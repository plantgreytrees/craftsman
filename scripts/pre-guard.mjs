#!/usr/bin/env node
// PreToolUse (Read|Glob|Grep|Write|Edit|MultiEdit|NotebookEdit): deterministic
// checks in a SINGLE process (one Node spawn per tool call) —
//   1. hard-block edits to protected / generated / lock / secret paths
//   2. enforce that only the doc-writing commands (/plan, /orchestrate,
//      /sync-docs, /idea, /architect) may edit the guarded docs/ paths
// Doc authority is SESSION-SCOPED: each session holds its own grant, so
// concurrent sessions never block or leak into one another.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { hasDocWriteGrant, loadConfig, enabled, globToRe, STATE_DIR, PROJECT_ROOT, sidOf, sessionDir, logEvent, readStdin, readWorktreeBinding, mainCheckoutRoot, autoForceBlock } from "./lib/core.mjs";
import { forceBlocked } from "./lib/force-block.mjs";
import { readScope, scopeRequired } from "./scope.mjs";
import { generatedBlock } from "./tracker.mjs";
import { rollupBlock } from "./lib/tracker-rollup.mjs";

const T0 = Date.now();
let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const file = input?.tool_input?.file_path;
const tool = input.tool_name || "";
const toolInput = input.tool_input || {};
const target = file || toolInput.path;
const command = typeof toolInput.command === "string" ? toolInput.command : "";

function mutatesGit(value) {
  const command = value.replace(/\r?\n/g, ";");
  return /(?:^|[;&|]\s*)\s*git\s+(?:(?:-[A-Za-z]+\s+[^\s]+)\s+)*(?:add|apply|checkout|clean|commit|merge|mv|rebase|revert|rm|restore|reset|stash|switch|cherry-pick|push)\b|(?:^|[;&|]\s*)\s*git\s+branch\s+-[dD]\b|(?:^|[;&|]\s*)\s*git\s+worktree\s+(?:remove|move|prune)\b/.test(command);
}

function commandDirectoryTargets(command, worktree) {
  const targets = [];
  for (const match of command.matchAll(/\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)) {
    targets.push(match[1] || match[2] || match[3]);
  }
  for (const match of command.matchAll(/(?:^|&&|;|\|\|)\s*(?:cd|pushd)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)) {
    targets.push(match[1] || match[2] || match[3]);
  }
  return targets.some((target) => {
    const absolute = path.resolve(process.cwd(), target);
    let ancestor = absolute;
    while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
    let resolved;
    try { resolved = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute)); }
    catch { return true; }
    const realWorktree = fs.realpathSync(worktree);
    return resolved !== realWorktree && !resolved.startsWith(realWorktree + path.sep);
  });
}

function usesAlternateGitRoot(command) {
  return /\bgit\b[^;&|]*(?:--git-dir|--work-tree|--separate-git-dir)(?:[=\s])|\bGIT_DIR\s*=|\bGIT_WORK_TREE\s*=/.test(command);
}

// An unquoted-tag heredoc body is expanded by sh: keep only its $(...) and
// backtick substitutions (as lines of their own) so they are still parsed.
function heredocSubstitutions(body) {
  let res = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\") { i++; continue; }
    if (body[i] === "`") {
      let j = i + 1;
      while (j < body.length && body[j] !== "`") j += body[j] === "\\" ? 2 : 1;
      res += body.slice(i + 1, j) + "\n"; i = j;
    } else if (body[i] === "$" && body[i + 1] === "(") {
      let j = i + 2, depth = 1;
      while (j < body.length && depth) { if (body[j] === "(") depth++; else if (body[j] === ")") depth--; j++; }
      res += "$(" + body.slice(i + 2, j) + (depth ? ")" : "") + "\n"; i = j - 1;
    }
  }
  return res;
}

// Drop heredoc bodies (and their terminator lines) so their text is never
// parsed as shell. Quote-aware: a `<<` inside single quotes is not a heredoc,
// while one inside `"$( ... )"` is. Unterminated bodies run to the end, as in sh.
function arithmeticEnd(text, i) { // index of the `)` / `]` closing arithmetic opened at i, else text.length
  if (text[i + 1] === "[") { const j = text.indexOf("]", i + 2); return j === -1 ? text.length : j; }
  let j = i + 1, depth = 0;
  for (; j < text.length; j++) { if (text[j] === "(") depth++; else if (text[j] === ")" && --depth === 0) break; }
  return j;
}

function stripHeredocs(text) {
  let out = "", pending = [];
  const stack = ["cmd"]; // "cmd" | "dq"
  let sq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], top = stack[stack.length - 1];
    if (sq) { out += c; if (c === "'") sq = false; continue; }
    if (c === "\\" && i + 1 < text.length) { out += c + text[++i]; continue; }
    if (top === "dq") {
      if (c === "$" && ((text[i + 1] === "(" && text[i + 2] === "(") || text[i + 1] === "[")) { // arithmetic: a shift, never a heredoc
        const j = arithmeticEnd(text, i); out += text.slice(i, j + 1); i = j; continue;
      }
      if (c === '"') stack.pop();
      else if (c === "$" && text[i + 1] === "(") { stack.push("cmd"); out += "$("; i++; continue; }
      out += c; continue;
    }
    if (c === "'") { sq = true; out += c; continue; }
    if (c === '"') { stack.push("dq"); out += c; continue; }
    // Arithmetic `$(( ))` / `(( ))`: its `<<` is a shift, never a heredoc.
    if ((c === "$" && ((text[i + 1] === "(" && text[i + 2] === "(") || text[i + 1] === "[")) || (c === "(" && text[i + 1] === "(" && text[i - 1] !== "$")) {
      const j = c === "$" ? arithmeticEnd(text, i) : arithmeticEnd(text, i - 1);
      out += text.slice(i, j + 1); i = j; continue;
    }
    if (c === "#" && (i === 0 || /[\s;&|(]/.test(text[i - 1]))) { // comment: to end of line
      let j = text.indexOf("\n", i); if (j === -1) j = text.length;
      out += text.slice(i, j); i = j - 1; continue;
    }
    if (c === "$" && text[i + 1] === "(") { stack.push("cmd"); out += "$("; i++; continue; }
    if (c === "<" && text.startsWith("<<<", i)) { out += "<<<"; i += 2; continue; } // here-string
    if (c === ")" && stack.length > 1) { stack.pop(); out += c; continue; }
    if (c === "<" && text[i + 1] === "<" && text[i + 2] !== "<") {
      const m = /^<<(-?)\s*(?:'([^'\n]*)'|"([^"\n]*)"|(\\?)([\w.-]+))/.exec(text.slice(i));
      if (m) { pending.push({ tabs: m[1] === "-", tag: m[2] ?? m[3] ?? m[5], quoted: m[2] !== undefined || m[3] !== undefined || m[4] === "\\" }); out += m[0]; i += m[0].length - 1; continue; }
    }
    if (c === "\n" && pending.length) {
      out += c;
      let pos = i + 1;
      for (const { tabs, tag, quoted } of pending) {
        let body = "";
        for (;;) {
          if (pos >= text.length) break;
          let end = text.indexOf("\n", pos);
          if (end === -1) end = text.length;
          const line = text.slice(pos, end);
          pos = Math.min(end + 1, text.length);
          if ((tabs ? line.replace(/^\t+/, "") : line) === tag) break;
          body += line + "\n";
        }
        if (!quoted) out += heredocSubstitutions(body);
      }
      pending = [];
      i = pos - 1;
      continue;
    }
    out += c;
  }
  return out;
}

// Quote-aware split of a shell command into segments of words. `;` `&` `|`
// newline ( ) and backticks separate segments; a leading `\` on a word is
// dropped (`\rm`). `ok` is false when a quote never closes.
function shellSegments(cmd) {
  const segments = [], seps = [], substs = [], arrays = [];
  let words = [], word = null, quote = null, subst = false, arr = false, sep = null;
  const endWord = () => { if (word !== null) words.push(word); word = null; };
  // seps[i]: the separator before segment i; substs[i]: it opened a `...` or $(...).
  const endSegment = () => { endWord(); if (words.length) { segments.push(words); seps.push(sep); substs.push(subst); arrays.push(arr); sep = null; } words = []; subst = false; arr = false; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < cmd.length) word += cmd[++i];
      else word += c;
    } else if (c === "#" && word === null && (i === 0 || /[\s;&|(]/.test(cmd[i - 1]))) { while (i + 1 < cmd.length && cmd[i + 1] !== "\n") i++; } // comment: never opens a quote
    else if (c === '"' || c === "'") { quote = c; word ??= ""; }
    else if (c === "\\" && i + 1 < cmd.length) { word = (word ?? "") + cmd[++i]; }
    else if (/\s/.test(c) && c !== "\n") endWord();
    else if ("\n;&|()`".includes(c)) {
      if (c === "`" || (c === "(" && word !== null && word.endsWith("$"))) subst = true;
      const opensArray = c === "(" && word !== null && /^\w+\+?=$/.test(word); // NAME=( with nothing between
      endSegment();
      arr = opensArray;
      if (!(sep === "|" && "()`".includes(c))) sep = c;
    }
    else word = (word ?? "") + c;
  }
  endSegment();
  return { segments, seps, substs, arrays, ok: !quote };
}

const OPT_ARG = { sudo: new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U"]), env: new Set(["-u", "-C", "-S"]),
  xargs: new Set(["-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s"]) };
const WRAPPERS = new Set(["command", "builtin", "exec", "nohup", "time", "env", "sudo", "doas", "nice", "timeout", "busybox", "stdbuf", "ionice"]);
const KEYWORDS = new Set(["then", "do", "else", "elif", "!", "if", "while", "until", "coproc"]);
OPT_ARG.exec = new Set(["-a"]); OPT_ARG.nice = new Set(["-n"]); OPT_ARG.timeout = new Set(["-s", "-k"]);
OPT_ARG.stdbuf = new Set(["-i", "-o", "-e"]); OPT_ARG.ionice = new Set(["-c", "-n", "-p", "-P", "-u"]);

// Literal directory prefix of a guarded glob: "docs/plans/**" -> "docs/plans".
function guardedBase(glob) {
  const parts = [];
  for (const part of glob.replace(/^\.\//, "").split("/")) { if (/[*?[{]/.test(part)) break; parts.push(part); }
  return parts.join("/");
}

// Does removing/moving this path delete or alter a guarded doc? True for a
// guarded path itself, anything under it, or any ancestor of one (incl. ".").
// A glob in the LAST path segment (`*.log`, `d*`) matches against the guarded
// bases instead of collapsing to its parent directory.
function segmentRe(seg, flags = "") {
  let re = "";
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[" && seg.indexOf("]", i + 2) !== -1) { const e = seg.indexOf("]", i + 2); re += "[" + seg.slice(i + 1, e).replace(/^!/, "^").replace(/\\/g, "\\\\") + "]"; i = e; }
    else if (c === "{" && seg.indexOf("}", i) !== -1) { const e = seg.indexOf("}", i); re += "(?:" + seg.slice(i + 1, e).split(",").map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")"; i = e; }
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$", flags);
}

// A guarded glob as a RegExp; an icase pathspec compares it case-insensitively in full.
const guardRe = (p, icase) => (icase ? new RegExp(globToRe(p).source, "i") : globToRe(p));

function lastSegmentGlob(arg, cwd, docPaths, icase = false) {
  const slash = arg.lastIndexOf("/");
  const dir = slash === -1 ? "" : arg.slice(0, slash + 1), seg = arg.slice(slash + 1);
  if (!/[*?[{]/.test(seg) || /[*?[{]/.test(dir)) return undefined; // not a last-segment-only glob
  const rel = path.relative(activeRoot, path.resolve(cwd, dir || ".")).split(path.sep).join("/");
  if (rel === ".." || rel.startsWith("../")) {
    return path.relative(path.resolve(cwd, dir || "."), activeRoot).startsWith("..") ? null : (rel || ".");
  }
  const dirParts = rel === "" ? [] : rel.split("/");
  const re = segmentRe(seg, icase ? "i" : "");
  const sample = [...dirParts, seg.replace(/[*?[\]{},!]/g, "x")].join("/");
  let entries = null;
  try { entries = fs.readdirSync(path.join(activeRoot, ...dirParts)); } catch { entries = []; }
  for (const p of docPaths) {
    if (!p.includes("**")) {
      // No `**`: test the real directory entries the glob expands to, not a sample.
      const hit = entries.find((e) => re.test(e) && [[...dirParts, e].join("/"), "./" + [...dirParts, e].join("/")].some((c) => guardRe(p, icase).test(c)));
      if (hit !== undefined) return [...dirParts, hit].join("/");
    } else if (guardRe(p, icase).test(sample) || guardRe(p, icase).test("./" + sample)) return sample;
    const base = guardedBase(p).split("/").filter(Boolean);
    if (base.length > dirParts.length && dirParts.every((d, k) => base[k] === d) && re.test(base[dirParts.length])) return [...dirParts, base[dirParts.length]].join("/");
  }
  return null;
}

// git pathspec globs match across `/` (`*.md` reaches docs/plans/x.md). The
// glob is tested against every guarded base, its ancestors and its real contents.
function pathspecHit(arg, cwd, docPaths, icase = false) {
  if (!/[*?[]/.test(arg)) return null;
  const pre = path.relative(activeRoot, cwd).split(path.sep).join("/");
  if (pre === ".." || pre.startsWith("../")) return null;
  let re = "";
  for (const c of (pre ? pre + "/" : "") + arg.replace(/^\.\//, "")) re += c === "*" ? ".*" : c === "?" ? "." : c === "[" || c === "]" ? c : c.replace(/[.+^${}()|\\]/g, "\\$&");
  let rx;
  try { rx = new RegExp("^" + re + "$", icase ? "i" : ""); } catch { return "(git pathspec the parser cannot read: " + arg + ")"; }
  let budget = 20000, found = null;
  const visit = (rel) => {
    if (found || --budget < 0) return;
    if (rx.test(rel)) { found = rel; return; }
    let entries;
    try { entries = fs.readdirSync(path.join(activeRoot, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) visit(rel + "/" + e.name);
  };
  for (const p of docPaths) {
    const base = guardedBase(p).split("/").filter(Boolean);
    for (let n = 1; n <= base.length && !found; n++) { const r = base.slice(0, n).join("/"); if (rx.test(r)) found = r; }
    if (!found && base.length) visit(base.join("/"));
    if (found) break;
  }
  if (budget < 0 && !found) return "(git pathspec too broad to scan: " + arg + ")";
  return found;
}

// A git pathspec starting with `:` carries magic (`:/`, `:!`, `:^`, `:(top,icase,glob,...)`).
// Decode it to a plain path (top -> project root, icase -> the guarded base's own
// case); magic it cannot decode fails closed rather than slipping past.
function decodeMagic(arg, cwd, docPaths, forceIcase = false) {
  if (!arg.startsWith(":") && !forceIcase) return { arg, cwd };
  let rest = arg.startsWith(":") ? arg.slice(1) : arg, top = false, icase = forceIcase, exclude = false;
  if (!arg.startsWith(":")) { /* plain pathspec under --icase-pathspecs */ }
  else if (rest.startsWith("(")) {
    const e = rest.indexOf(")");
    if (e === -1) return { unreadable: "(git pathspec the parser cannot read: " + arg + ")" };
    for (const m of rest.slice(1, e).split(",")) {
      if (m === "top") top = true; else if (m === "icase") icase = true; else if (m === "exclude") exclude = true;
      else if (!["glob", "literal"].includes(m)) return { unreadable: "(git pathspec magic the parser cannot read: " + arg + ")" };
    }
    rest = rest.slice(e + 1);
  } else {
    while (/^[/!^]/.test(rest)) { if (rest[0] === "/") top = true; else exclude = true; rest = rest.slice(1); }
    if (rest.startsWith(":")) rest = rest.slice(1);
  }
  if (icase) {
    const bases = docPaths.map((p) => guardedBase(p).split("/").filter(Boolean));
    const parts = rest.replace(/^\.\//, "").split("/");
    for (const base of bases) {
      if (parts.every((x, k) => k >= base.length || x.toLowerCase() === base[k].toLowerCase() || x === "")) {
        rest = parts.map((x, k) => (k < base.length ? base[k] : x)).join("/"); break;
      }
    }
  }
  return { arg: rest || ".", cwd: top ? activeRoot : cwd, icase, exclude };
}

function touchesGuarded(arg, cwd, docPaths, icase = false) {
  if (!arg) return null;
  const lastSeg = lastSegmentGlob(arg, cwd, docPaths, icase);
  if (lastSeg !== undefined) return lastSeg;
  const cut = arg.search(/[*?[{]/);
  const literal = cut === -1 ? arg : arg.slice(0, cut).replace(/[^/]*$/, "") || ".";
  const rel = path.relative(activeRoot, path.resolve(cwd, literal)).split(path.sep).join("/");
  if (rel === ".." || rel.startsWith("../")) {
    // An ancestor of the project root contains every guarded doc.
    return path.relative(path.resolve(cwd, literal), activeRoot).startsWith("..") ? null : (rel || ".");
  }
  if (rel === "") return ".";
  if (docPaths.some((p) => [rel, "./" + rel, rel + "/x"].some((c) => guardRe(p, icase).test(c)))) return rel;
  if (docPaths.some((p) => { const base = guardedBase(p); return base === rel || base.startsWith(rel + "/"); })) return rel;
  return null;
}

// True when a `find` rooted ABOVE the guarded docs (never inside them) selects
// only by -name/-iname and no existing guarded file or directory matches any
// pattern. Any other predicate that can reach a path (-path, -regex, negation)
// or a start inside a guarded path fails closed (false).
function findNamesMiss(exprs, start, cwd, docPaths) {
  const names = [];
  let lastName = -1, action = -1;
  for (let k = 0; k < exprs.length; k++) {
    const w = exprs[k];
    if (/^-(?:i?path|i?wholename|i?regex|not|o|or)$/.test(w) || w === "!" || w === "," || w === "(" || w === ")") return false;
    if (/^-i?name$/.test(w) && exprs[k + 1] !== undefined) { names.push(segmentRe(exprs[k + 1], w === "-iname" ? "i" : "")); lastName = k; }
    if (action === -1 && (w === "-delete" || /^-exec(?:dir)?$/.test(w))) action = k;
  }
  if (!names.length || action < lastName) return false; // the delete must come after every -name
  const startRel = path.relative(activeRoot, path.resolve(cwd, start)).split(path.sep).join("/");
  if (startRel.startsWith("..")) return false;
  const inside = (r) => docPaths.some((p) => [r, "./" + r, r + "/x"].some((c) => globToRe(p).test(c)));
  if (startRel && inside(startRel)) return false;
  let budget = 20000;
  const visit = (rel) => {
    if (names.some((re) => re.test(path.basename(rel)))) return true;
    if (--budget < 0) return true;
    let entries;
    try { entries = fs.readdirSync(path.join(activeRoot, rel), { withFileTypes: true }); } catch { return false; }
    return entries.some((e) => visit(rel + "/" + e.name));
  };
  for (const p of docPaths) {
    const base = guardedBase(p).split("/").filter(Boolean);
    const sr = startRel ? startRel.split("/") : [];
    if (!sr.every((d, k) => base[k] === d)) continue;
    for (let n = sr.length + 1; n <= base.length; n++) {
      if (names.some((re) => re.test(base[n - 1]))) return false;
    }
    if (base.length && visit(base.join("/")) ) return false;
  }
  return true;
}

// Guarded doc paths removed (or moved) by a (chained) command: rm / unlink /
// git rm / git mv / mv / find -delete / xargs rm / sh -c bodies, through
// `git -C`, `cd`, and command|env|sudo|\ wrappers. Anything unparseable that
// names a guarded path fails closed.
function removedDocs(cmd, docPaths) {
  const hits = [];
  const st = { cwd: process.cwd(), xargsRm: false, seen: [], rmVar: false, sep: null, prev: null, subst: false };
  const check = (arg, cwd) => { const h = touchesGuarded(arg, cwd, docPaths); if (h) hits.push(h); };
  const args = (words) => words.filter((w) => w && !w.startsWith("-"));

  // A NAME=value word is stripped, so its value joins the seen words first.
  const assigned = (w, cwd = st.cwd) => { const v = w.slice(w.indexOf("=") + 1); if (v) st.seen.push({ w: v, cwd }); };

  function stripPrefixes(words, cwd = st.cwd) {
    for (;;) {
      if (!words.length) return words;
      const w = words[0], base = path.basename(w);
      if (/^\w+\+?=/.test(w)) assigned(w, cwd);
      if (w === "function" && words.length > 2 && words[2] === "{") { words = words.slice(2); continue; } // function NAME {
      if (w === "coproc" && words.length > 2 && words[2] === "{") { words = words.slice(2); continue; } // coproc NAME {
      if (/^\w+\+?=/.test(w) || w === "{" || KEYWORDS.has(w)) { words = words.slice(1); continue; }
      if (!WRAPPERS.has(base)) return words;
      words = words.slice(1);
      while (words.length && (words[0].startsWith("-") || (base === "env" && /^\w+\+?=/.test(words[0])))) {
        if (base === "env" && /^\w+\+?=/.test(words[0])) assigned(words[0], cwd);
        words = words.slice(OPT_ARG[base]?.has(words[0]) ? 2 : 1);
      }
      if (base === "timeout" && words.length) words = words.slice(1); // the duration
    }
  }

  function segment(words, state, depth, inheritIcase = false) {
    // GIT_ICASE_PATHSPECS=<truthy> anywhere in the prefix (`VAR=1 git`, `env VAR=1 git`).
    const icaseEnv = inheritIcase || state.icase || words.some((w) => { const m = /^GIT_ICASE_PATHSPECS=(.*)$/.exec(w); return m && !/^(?:0|false|no|off|)$/i.test(m[1]); });
    words = stripPrefixes(words, state.cwd);
    if (!words.length) return;
    const verb = path.basename(words[0]);
    const rest = words.slice(1);
    if (/^(?:export|local|declare|typeset|readonly)$/.test(verb)) for (const a of rest) if (/^\w+\+?=/.test(a)) {
      assigned(a, state.cwd);
      const m = /^GIT_ICASE_PATHSPECS=(.*)$/.exec(a); // stays set for the later segments
      if (m) state.icase = !/^(?:0|false|no|off|)$/i.test(m[1]);
    }
    state.seen.push(...args(rest).map((w) => ({ w, cwd: state.cwd })));
    if (verb === "cd" || verb === "pushd") { if (rest[0] && !rest[0].startsWith("-")) state.cwd = path.resolve(state.cwd, rest[0]); return; }
    if (verb === "rm" || verb === "unlink" || verb === "mv") {
      for (const a of args(rest)) {
        check(a, state.cwd);
        if (/^(?:~|\$\{?(?:PWD|HOME)(?![\w]))/.test(a)) hits.push("(" + verb + " argument the parser cannot resolve: " + a + ")");
        if (/\$[A-Za-z_{]/.test(a)) st.rmVar = true;
      }
      if (state.subst) hits.push("(" + verb + " with a command substitution argument)");
      else if (rest.some((a) => /\$\(|`/.test(a))) hits.push("(" + verb + " with a command substitution argument)");
      return;
    }
    if (verb === "git") {
      let cwd = state.cwd, i = 0, icaseAll = icaseEnv;
      while (i < rest.length && rest[i].startsWith("-")) {
        if (rest[i] === "--icase-pathspecs") icaseAll = true;
        if (rest[i] === "-C" && rest[i + 1] !== undefined) { cwd = path.resolve(cwd, rest[i + 1]); i += 2; }
        else i += rest[i] === "-c" ? 2 : 1;
      }
      if (rest[i] === "rm" || rest[i] === "mv") {
        const specs = args(rest.slice(i + 1)).map((raw) => decodeMagic(raw, cwd, docPaths, icaseAll));
        // An exclusion never names a path to keep: with no positive pathspec git
        // acts on everything, so the argument list fails closed as `.`.
        if (specs.length && specs.every((x) => x.exclude)) specs.push({ arg: ".", cwd });
        for (const spec of specs) {
          if (spec.unreadable) { hits.push(spec.unreadable); continue; }
          if (spec.exclude && spec.arg !== "." ) continue;
          const h0 = touchesGuarded(spec.arg, spec.cwd, docPaths, spec.icase); if (h0) hits.push(h0); const h = pathspecHit(spec.arg, spec.cwd, docPaths, spec.icase); if (h) hits.push(h);
        }
      }
      return;
    }
    if (verb === "find") {
      const exprAt = rest.findIndex((w) => w.startsWith("-") || w === "(" || w === "!");
      const starts = exprAt === -1 ? rest : rest.slice(0, exprAt);
      const exprs = exprAt === -1 ? [] : rest.slice(exprAt);
      // Each -exec command, wrappers stripped (`env rm`, `sudo mv`), up to `;` / `+`.
      const execs = [];
      for (let k = 0; k < exprs.length; k++) {
        if (!/^-exec(?:dir)?$/.test(exprs[k])) continue;
        let m = k + 1;
        // `+` ends the list only straight after `{}`; elsewhere it is a word.
        while (m < exprs.length && exprs[m] !== ";" && !(exprs[m] === "+" && exprs[m - 1] === "{}")) m++;
        const cmdWords = stripPrefixes(exprs.slice(k + 1, m), state.cwd);
        if (/^(?:rm|unlink|mv)$/.test(path.basename(cmdWords[0] || ""))) execs.push({ verb: path.basename(cmdWords[0]), words: cmdWords.slice(1) });
        else if (path.basename(cmdWords[0] || "") === "git") { // git rm / git mv count as removal verbs
          let g = 1;
          while (g < cmdWords.length && cmdWords[g].startsWith("-")) g += cmdWords[g] === "-C" || cmdWords[g] === "-c" ? 2 : 1;
          if (cmdWords[g] === "rm" || cmdWords[g] === "mv") execs.push({ verb: cmdWords[g], words: cmdWords.slice(g + 1) });
        }
      }
      const deletes = exprs.includes("-delete") || execs.some((x) => x.verb !== "mv" || x.words.some((w) => w.includes("{}")));
      for (const x of execs) for (const w of x.words) { // every literal word handed to rm/unlink/mv, bar `{}`
        if (w !== "{}" && !w.startsWith("-")) { const h = touchesGuarded(w, state.cwd, docPaths); if (h) hits.push(h); }
      }
      if (deletes) for (const a of starts.length ? starts : ["."]) {
        const h = touchesGuarded(a, state.cwd, docPaths);
        if (h && !findNamesMiss(exprs, a, state.cwd, docPaths)) hits.push(h);
      }
      return;
    }
    if (verb === "xargs") {
      let tail = rest;
      while (tail.length && tail[0].startsWith("-")) tail = tail.slice(OPT_ARG.xargs.has(tail[0]) ? 2 : 1);
      const inner = stripPrefixes(tail);
      if (inner.length && /^(?:rm|unlink)$/.test(path.basename(inner[0]))) {
        st.xargsRm = true;
        const opts = rest.slice(0, rest.length - tail.length);
        const prevVerb = state.prev ? path.basename(stripPrefixes(state.prev)[0] || "") : "";
        const visible = state.sep === "|" && /^(?:echo|printf|find)$/.test(prevVerb);
        if (!visible || rest.some((w) => w.startsWith("<")) || opts.some((w) => /^-a|^--arg-file/.test(w))) hits.push("(xargs " + path.basename(inner[0]) + " with input the parser cannot see)");
      }
      segment(tail, state, depth, icaseEnv);
      return;
    }
    if (/^(?:ba|z|da|k)?sh$/.test(verb) || verb === "eval") {
      const at = verb === "eval" ? 0 : rest.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w));
      const body = verb === "eval" ? rest.join(" ") : rest[at + 1];
      if (at !== -1 && body !== undefined && depth < 5) walk(body, { ...state, seen: state.seen, icase: icaseEnv }, depth + 1);
    }
  }

  function walk(text, state, depth) {
    text = stripHeredocs(text);
    const parsed = shellSegments(text);
    if (!parsed.ok && docPaths.some((p) => { const b = guardedBase(p); return b && text.includes(b); })) hits.push("(unparseable command naming a guarded path)");
    parsed.segments.forEach((words, i) => {
      state.sep = parsed.seps[i]; state.prev = parsed.segments[i - 1] || null; state.subst = parsed.substs[i];
      if (parsed.arrays[i] && !state.subst) { // NAME=(a b): the elements are the value
        for (const w of words) if (w) st.seen.push({ w, cwd: state.cwd });
        return;
      }
      segment(words, state, depth);
    });
  }

  walk(cmd, st, 0);
  if (st.xargsRm || st.rmVar) for (const { w, cwd } of st.seen) check(w, cwd);
  return hits;
}

function allowed(entry, candidate) {
  const pattern = entry.replaceAll(path.sep, "/").replace(/^\.\//, "");
  return globToRe(pattern).test(candidate) || globToRe(pattern).test("./" + candidate);
}

function searchRootAllowed(scope, candidate) {
  return scope.some((entry) => {
    const pattern = entry.replaceAll(path.sep, "/").replace(/^\.\//, "");
    return pattern.endsWith("/**") && candidate === pattern.slice(0, -3).replace(/\/$/, "");
  });
}

function scopeViolation(scope, candidates, buckets) {
  return candidates.find((candidate) => !buckets.some((bucket) =>
    scope[bucket].some((entry) => allowed(entry, candidate))
  ));
}

function orchestrationMetadataAllowed(active, candidate) {
  if (candidate === "docs/plans/TRACKER.md" || candidate === active.plan) return true;
  // The authoritative tracker sits in the main checkout, outside a unit's worktree.
  const root = path.resolve(active.project_root || PROJECT_ROOT);
  return path.resolve(root, candidate) === path.join(mainCheckoutRoot(root), "docs", "plans", "TRACKER.md");
}

// The checkout-relative docs/plans/TRACKER.md this absolute path IS, as
// { root, main } — or null when it is any other file.
function trackerTarget(absolute) {
  if (!/(?:^|[\\/])docs[\\/]plans[\\/]TRACKER\.md$/.test(absolute)) return null;
  let dir = path.dirname(absolute);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  let root;
  try { root = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
  const real = path.resolve(fs.realpathSync(dir), path.relative(dir, absolute));
  if (path.relative(root, real).split(path.sep).join("/") !== "docs/plans/TRACKER.md") return null;
  return { root, main: mainCheckoutRoot(root), real };
}

// A generated rollup docs/plans/<slug>/TRACKER.md (ARCH-TRACKER-10), or null.
function rollupTarget(absolute) {
  if (!/(?:^|[\\/])docs[\\/]plans[\\/][^\\/]+[\\/]TRACKER\.md$/.test(absolute)) return null;
  let dir = path.dirname(absolute);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  try {
    const root = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const real = path.resolve(fs.realpathSync(dir), path.relative(dir, absolute));
    return /^docs\/plans\/[^/]+\/TRACKER\.md$/.test(path.relative(root, real).split(path.sep).join("/")) ? { root, real } : null;
  } catch { return null; }
}

// The file as it would read after this Write/Edit/MultiEdit, or null when the
// edit can't apply (the tool then fails on its own; nothing to guard).
function afterEdit(current) {
  if (tool === "Write") return typeof toolInput.content === "string" ? toolInput.content : null;
  const edits = tool === "MultiEdit" ? toolInput.edits || [] : [toolInput];
  let text = current;
  for (const edit of edits) {
    if (typeof edit?.old_string !== "string" || typeof edit?.new_string !== "string" || !text.includes(edit.old_string)) return null;
    text = edit.replace_all ? text.split(edit.old_string).join(edit.new_string) : text.replace(edit.old_string, () => edit.new_string);
  }
  return text;
}

function projectAllowed(active, candidate) {
  const root = path.resolve(active.project_root || PROJECT_ROOT);
  const absolute = path.resolve(root, candidate);
  let ancestor = absolute;
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  let resolved;
  try { resolved = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute)); }
  catch { return false; }
  const realRoot = fs.realpathSync(root);
  return resolved === realRoot || resolved.startsWith(realRoot + path.sep);
}

// Is one file-tool call inside the active unit scope? In order: 1. tracker/
// plan-doc reads pass; 2. outside the project root fails; 3. no target fails
// closed; 4. a Glob/Grep rooted under a declared `<dir>/**` passes; 5. else
// every candidate must match its bucket (read+docs, or write).
function scopeVerdict(activeScope, tool, bucket, buckets, candidates) {
  if (bucket === "read" && candidates.length &&
      candidates.every((candidate) => orchestrationMetadataAllowed(activeScope, candidate))) {
    return null; // (1) tracker/plan metadata read
  }
  const projectViolation = candidates.find((candidate) => !projectAllowed(activeScope, candidate));
  if (projectViolation) return projectViolation; // (2) project-boundary violation

  if (!candidates.length) return "(missing target path)"; // (3) no target

  const isSearchTool = bucket === "read" && tool !== "Read";
  if (isSearchTool && searchRootAllowed(buckets.flatMap((name) => activeScope.scope[name]), candidates[0])) {
    return null; // (4) search root itself is a declared `**` allow-list entry
  }
  return scopeViolation(activeScope.scope, candidates, buckets); // (5) per-entry scope check
}

// Active scopes are created by /orchestrate immediately before delegation.
// Once present, this is fail-closed for implementation context: a missing or
// incorrect dependency must trigger re-analysis and an explicit scope refresh.
const activeScope = readScope(input);
const binding = readWorktreeBinding(input, activeScope?.project_root
  ? { root: activeScope.project_root, stateDir: path.join(activeScope.project_root, ".craftsman"), worktreePath: activeScope.worktree_path }
  : null);
const activeRoot = activeScope?.project_root || PROJECT_ROOT;
const activeContext = { root: activeRoot, stateDir: path.join(activeRoot, ".craftsman"), offFlag: path.join(activeRoot, ".craftsman", "off") };
const cfg = loadConfig(activeContext);
if (!enabled(cfg, activeContext)) process.exit(0);
const rel = target ? path.relative(activeRoot, target).split(path.sep).join("/") : "";
if (activeScope && ["Read", "Glob", "Grep", "Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
  if (activeScope.scope_ambiguous) {
    process.stderr.write(`craftsman: ${tool} blocked because more than one active project scope matches this session. Activate the intended project scope explicitly before retrying.\n`);
    process.exit(2);
  }
  const bucket = ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool) ? "write" : "read";
  const candidates = [];
  if (tool === "Read" || bucket === "write") {
    if (file) candidates.push(path.relative(activeRoot, file).split(path.sep).join("/"));
  } else {
    const searchRoot = toolInput.path || ".";
    candidates.push(path.relative(activeRoot, searchRoot).split(path.sep).join("/") || ".");
  }
  const buckets = bucket === "read" ? ["read", "docs"] : ["write"];
  const violation = scopeVerdict(activeScope, tool, bucket, buckets, candidates);
  if (violation) {
    const message = `craftsman: ${tool} blocked outside active unit scope (${activeScope.unit}). ` +
      `Required target: ${violation}. Stop and re-analyse the unit dependencies; add the exact ` +
      `source/doc path to the plan scope, then refresh it with ` +
      `node "${process.env.CLAUDE_PLUGIN_ROOT || "<plugin-root>"}/scripts/scope.mjs" ` +
      `using the session scope JSON before retrying. Repository-wide searches are forbidden.`;
    logEvent({ ms: Date.now() - T0, ev: "scope_blocked", sid: sidOf(input), tool, unit: activeScope.unit, target: violation });
    process.stderr.write(message + "\n");
    process.exit(2);
  }
}

// ARCH-LAND-05: /auto holds standing git authority (LAND-01) but never a
// destructive one. While its run lasts (core.mjs autoForceBlock, Phase C
// included), force pushes (flags or a +refspec), hard resets and forced
// worktree removal are blocked; a plain `git push origin HEAD:main` is not.
// orchestrate-scope-guard.mjs writes the marker at this same (sid) path.
// It runs before every other Bash check, so none can stall it past the timeout.
if (tool === "Bash" && autoForceBlock(sidOf(input))) {
  const destructive = await forceBlocked(command);
  if (destructive) {
    logEvent({ ms: Date.now() - T0, ev: "auto_force_blocked", sid: sidOf(input), command });
    process.stderr.write(
      `craftsman: ${destructive} is BLOCKED while /auto is active (ARCH-LAND-05). Land with a plain ` +
      `push or repo-exec merge; a rejected push or conflict PARKs the unit with a decision for Phase C.\n`
    );
    process.exit(2);
  }
}

// A hook rejection is fixed, never bypassed (--no-verify is forbidden):
// unconditional, for every commit/push with or without a worktree binding.
// The flag test is linear; the commit/push one retries per `git`, so only a
// command under 16 KB reaches it — a larger one with a bypass flag is blocked.
if (tool === "Bash" && /--no-verify\b|--no-gpg-sign\b|-c\s+commit\.gpgsign=false|-c\s+core\.hooksPath=/.test(command)
    && (command.length > 16384 || /\bgit\s+(?:-[A-Za-z]+(?:=\S+|\s+[^-\s]\S*)?\s+)*(?:commit|push)\b/.test(command))) {
  logEvent({ ms: Date.now() - T0, ev: "verify_bypass_blocked", sid: sidOf(input), command });
  process.stderr.write(
    `craftsman: Git commit/push hook bypass BLOCKED (--no-verify / --no-gpg-sign / gpgsign=false / ` +
    `core.hooksPath override). Fix the underlying hook failure instead of skipping it — this is a ` +
    `hard rule, not a suggestion.\n`
  );
  process.exit(2);
}

if (tool === "Bash" && binding && mutatesGit(command)) {
  const cwd = path.resolve(process.cwd());
  const worktree = path.resolve(binding.worktree_path);
  if ((cwd !== worktree && !cwd.startsWith(worktree + path.sep)) || commandDirectoryTargets(command, worktree) || usesAlternateGitRoot(command)) {
    logEvent({ ms: Date.now() - T0, ev: "git_guard_blocked", sid: sidOf(input), unit: binding.unit, command });
    process.stderr.write(
      `craftsman: Git mutation blocked outside the active worktree (${binding.worktree_path}). ` +
      `Run implementation Git commands from that worktree, or release the binding before the locked merge.\n`
    );
    process.exit(2);
  }
  let branch = "";
  try { branch = execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" }).trim(); } catch {}
  if (!branch || branch !== binding.branch) {
    logEvent({ ms: Date.now() - T0, ev: "git_guard_blocked", sid: sidOf(input), unit: binding.unit, command, branch });
    process.stderr.write(
      `craftsman: Git mutation blocked because the active worktree is on branch "${branch || "(detached)"}", ` +
      `not the bound branch "${binding.branch}".\n`
    );
    process.exit(2);
  }
}

if (!activeScope && scopeRequired(input) && ["Read", "Glob", "Grep", "Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
  process.stderr.write(
    `craftsman: ${tool} blocked because this session requires an active unit scope. ` +
    `Re-analyse the unit boundary, activate scripts/scope.mjs with the exact read/docs/write ` +
    `manifest, then retry.\n`
  );
  process.exit(2);
}

// Deleting a guarded doc is a write: `rm` / `git rm` (also chained) needs the grant.
if (tool === "Bash" && command && cfg.docWriteGuard?.enabled !== false) {
  const docPaths = cfg.docWriteGuard?.docPaths || ["docs/**"];
  const hit = removedDocs(command, docPaths);
  if (hit.length && !hasDocWriteGrant({ sid: sidOf(input), claim: true }, { ...activeContext, grantStateDir: STATE_DIR })) {
    logEvent({ ms: Date.now() - T0, ev: "docguard", file: hit[0], sid: sidOf(input), result: "blocked" });
    process.stderr.write(
      `craftsman: "${hit[0]}" matches this repo's guarded doc path(s) (docWriteGuard.docPaths); ` +
      `removing it with rm / git rm needs doc-write authority. Hand the change to /plan, or if you ARE ` +
      `that command, first run: node "\${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on\n`
    );
    process.exit(2);
  }
}

if (!file) process.exit(0); // no file: nothing to time or log

// 0) One tracker, in the main checkout: a worktree's TRACKER.md is never
//    written, and the root's generated ledger block is never hand-edited.
const tracker = ["Write", "Edit", "MultiEdit"].includes(tool) ? trackerTarget(path.resolve(activeRoot, file)) : null;
if (tracker) {
  if (path.resolve(tracker.main) !== path.resolve(tracker.root)) {
    const rootDoc = path.join(tracker.main, "docs", "plans", "TRACKER.md");
    logEvent({ ms: Date.now() - T0, ev: "tracker_guard", sid: sidOf(input), file: tracker.real, result: "worktree-copy" });
    process.stderr.write(
      `craftsman: this worktree's docs/plans/TRACKER.md is BLOCKED — the tracker lives only in the main ` +
      `checkout so every session sees it: ${rootDoc}. Register or move rows with ` +
      `node "\${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs" (the root file's ledger block re-renders itself); ` +
      `edit hand-written sections of ${rootDoc} directly.\n`
    );
    process.exit(2);
  }
  {
    let current = "";
    try { current = fs.readFileSync(tracker.real, "utf8"); } catch {}
    const next = afterEdit(current);
    if (next !== null && generatedBlock(next) !== generatedBlock(current)) {
      logEvent({ ms: Date.now() - T0, ev: "tracker_guard", sid: sidOf(input), file: tracker.real, result: "generated-block" });
      process.stderr.write(
        `craftsman: edit BLOCKED — it changes TRACKER.md's generated ledger block (between the ` +
        `craftsman:ledger markers). That block is rendered from .craftsman/tracker/events.jsonl: move the ` +
        `row with node "\${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs" and it updates itself. Edit only the ` +
        `hand-written sections outside it.\n`
      );
      process.exit(2);
    }
  }
}

const rollup = ["Write", "Edit", "MultiEdit"].includes(tool) ? rollupTarget(path.resolve(activeRoot, file)) : null;
if (rollup) {
  let current = "";
  try { current = fs.readFileSync(rollup.real, "utf8"); } catch {}
  const next = afterEdit(current);
  if (next !== null && rollupBlock(next) !== rollupBlock(current)) {
    logEvent({ ms: Date.now() - T0, ev: "tracker_guard", sid: sidOf(input), file: rollup.real, result: "rollup-block" });
    process.stderr.write(
      `craftsman: edit BLOCKED — it changes a generated rollup block (between the craftsman:rollup markers) ` +
      `in ${rollup.real}. It is rendered from the tracker ledger: move a row with ` +
      `node "\${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs" (or its rollup action) and it updates itself.\n`
    );
    process.exit(2);
  }
}

// 1) Protected paths — generated / vendored / lock / secret.
const hit = (cfg.protectedPaths || []).find((p) => globToRe(p).test(rel));
if (hit) {
  logEvent({ ms: Date.now() - T0, ev: "preguard", file: rel, pattern: hit, result: "blocked" });
  process.stderr.write(
    `craftsman: ${rel} is a protected path (matches "${hit}") — generated, vendored, ` +
    `lock, or secret file. Do not edit it directly. Change the source that generates it, ` +
    `or ask the user to make this change themselves.\n`
  );
  process.exit(2);
}

// 2) Doc-write authority — session-scoped.
const g = cfg.docWriteGuard || {};
const writeTool = ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool);
if (g.enabled !== false && writeTool) {
  const docPaths = g.docPaths || ["docs/**"];
  // The root tracker counts as a doc even when edited from a linked worktree,
  // where its worktree-relative path ("../../docs/…") matches no doc glob.
  const isDoc = Boolean(tracker) || docPaths.some((p) => globToRe(p).test(rel) || globToRe(p).test("./" + rel));
  if (isDoc) {
    const sid = sidOf(input);
    // Grants live with the root project, whichever worktree is being edited
    // (ARCH-STATE-06); core owns the check and claims/refreshes the marker.
    const ok = hasDocWriteGrant({ sid, claim: true }, { ...activeContext, grantStateDir: STATE_DIR });

    if (!ok) {
      logEvent({ ms: Date.now() - T0, ev: "docguard", file: rel, sid, result: "blocked" });
      process.stderr.write(
        `craftsman: "${rel}" matches this repo's guarded doc path(s) (docWriteGuard.docPaths). ` +
        `Do NOT write it directly. Hand the change to /plan (plan docs + tracker rows) — or whichever ` +
        `command this repo's config designates for this path. If you ARE that command, first run: ` +
        `node "\${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on\n`
      );
      process.exit(2);
    }
  }
}

logEvent({ ms: Date.now() - T0, ev: "preguard", sid: sidOf(input), file: rel, result: "allowed" });
process.exit(0);
