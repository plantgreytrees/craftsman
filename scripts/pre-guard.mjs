#!/usr/bin/env node
// PreToolUse (Read|Glob|Grep|Write|Edit|NotebookEdit): deterministic
// checks in a SINGLE process (one Node spawn per tool call) —
//   1. hard-block edits to protected / generated / lock / secret paths
//   2. enforce that only the doc-writing commands (/plan, /orchestrate,
//      /sync-docs, /idea, /architect) may edit the guarded docs/ paths
// Doc authority is SESSION-SCOPED: each session holds its own grant, so
// concurrent sessions never block or leak into one another.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { hasDocWriteGrant, loadConfig, enabled, safetyEnabled, commandInvoked, DOC_WRITER_COMMANDS, globToRe, STATE_DIR, PROJECT_ROOT, sidOf, sessionDir, logEvent, readStdin, readWorktreeBinding, mainCheckoutRoot, autoForceBlock } from "./lib/core.mjs";
import { forceBlocked } from "./lib/force-block.mjs";
import { shellSegments, UNEXPANDED } from "./lib/shell-words.mjs";
import { readScope, scopeRequired } from "./scope.mjs";
import { generatedBlock } from "./tracker.mjs";
import { rollupBlock } from "./lib/tracker-rollup.mjs";

const T0 = Date.now();
// ARCH-SAFETY-02/03: a safety hook that cannot decide denies. An uncaught error or a rejected
// top-level await would otherwise exit 1, which Claude Code treats as a non-blocking failure.
const GUARD = "pre-guard";
function failClosed(why) {
  process.stderr.write(`craftsman: ${GUARD} could not decide (${why}), so the call is denied.\n`);
  process.exit(2);
}
process.on("uncaughtException", (error) => failClosed(error?.message || String(error)));
process.on("unhandledRejection", (error) => failClosed(error?.message || String(error)));

let input = {};
const rawInput = await readStdin();
try { input = JSON.parse(rawInput); } catch { failClosed(rawInput.trim() ? "bad JSON on stdin" : "empty stdin"); }
if (!input || typeof input !== "object" || Array.isArray(input)) failClosed("stdin is not a JSON object");
// Test-only: lets the suite prove an exception denies. It can only ever deny.
if (process.env.CRAFTSMAN_TEST_THROW === GUARD) throw new Error("forced by CRAFTSMAN_TEST_THROW");
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

// The heredoc delimiter at `from`: a full shell word, quotes and backslashes removed
// (`E"OF"` is EOF, `E@F` is E@F). `quoted` when any of it was quoted or escaped.
function heredocWord(text, from) {
  let tag = "", quoted = false, j = from;
  while (j < text.length) {
    const c = text[j];
    if (c === "'") { const e = text.indexOf("'", j + 1); if (e === -1) return null; tag += text.slice(j + 1, e); quoted = true; j = e + 1; }
    else if (c === '"') {
      let k = j + 1, body = "";
      while (k < text.length && text[k] !== '"') { if (text[k] === "\\" && /["\\$`]/.test(text[k + 1] ?? "")) k++; body += text[k++]; }
      if (k >= text.length) return null;
      tag += body; quoted = true; j = k + 1;
    }
    else if (c === "\\") { if (j + 1 >= text.length || text[j + 1] === "\n") return null; tag += text[j + 1]; quoted = true; j += 2; }
    else if (/[\s;&|<>()]/.test(c)) break;
    else { tag += c; j++; }
  }
  return tag === "" && !quoted ? null : { tag, quoted, end: j };
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
      const m = /^<<(-?)[ \t]*/.exec(text.slice(i));
      const w = m && heredocWord(text, i + m[0].length);
      if (w) { pending.push({ tabs: m[1] === "-", tag: w.tag, quoted: w.quoted }); out += text.slice(i, w.end); i = w.end - 1; continue; }
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

// Realpath of a directory, or its plain resolution when it does not exist.
function realDir(dir) { try { return fs.realpathSync(dir); } catch { return path.resolve(dir); } }
function realRoot() { return realDir(activeRoot); }

// `p` resolved from `cwd`, each component through realpath while it exists, so a
// symlink (`d -> docs`) is followed; the rest of a missing tail stays lexical.
function realResolve(cwd, p) {
  let cur = path.isAbsolute(p) ? path.parse(p).root : realDir(cwd);
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { cur = path.dirname(cur); continue; }
    const next = path.join(cur, part);
    try { cur = fs.realpathSync(next); } catch { cur = next; }
  }
  return cur;
}

const WRAPPERS = new Set(["command", "builtin", "exec", "nohup", "time", "env", "sudo", "doas", "nice", "timeout", "busybox", "stdbuf", "ionice"]);
const KEYWORDS = new Set(["if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done", "case", "esac", "in", "select", "function", "time", "coproc", "!", "{", "}", "[["]);

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

function lastSegmentGlob(arg, cwd, docPaths) {
  const slash = arg.lastIndexOf("/");
  const dir = slash === -1 ? "" : arg.slice(0, slash + 1), seg = arg.slice(slash + 1);
  if (!/[*?[{]/.test(seg) || /[*?[{]/.test(dir)) return undefined; // not a last-segment-only glob
  const abs = realResolve(cwd, dir || ".");
  const rel = path.relative(realRoot(), abs).split(path.sep).join("/");
  if (rel === ".." || rel.startsWith("../")) {
    return path.relative(abs, realRoot()).startsWith("..") ? null : (rel || ".");
  }
  const dirParts = rel === "" ? [] : rel.split("/");
  const re = segmentRe(seg);
  const sample = [...dirParts, seg.replace(/[*?[\]{},!]/g, "x")].join("/");
  let entries = null;
  try { entries = fs.readdirSync(path.join(realRoot(), ...dirParts)); } catch { entries = []; }
  for (const p of docPaths) {
    if (!p.includes("**")) {
      // No `**`: test the real directory entries the glob expands to, not a sample.
      const hit = entries.find((e) => re.test(e) && [[...dirParts, e].join("/"), "./" + [...dirParts, e].join("/")].some((c) => globToRe(p).test(c)));
      if (hit !== undefined) return [...dirParts, hit].join("/");
    } else if (globToRe(p).test(sample) || globToRe(p).test("./" + sample)) return sample;
    const base = guardedBase(p).split("/").filter(Boolean);
    if (base.length > dirParts.length && dirParts.every((d, k) => base[k] === d) && re.test(base[dirParts.length])) return [...dirParts, base[dirParts.length]].join("/");
  }
  return null;
}

// git pathspec globs match across `/` (`*.md` reaches docs/plans/x.md). The
// glob is tested against every guarded base, its ancestors and its real contents.
function pathspecHit(arg, cwd, docPaths) {
  if (!/[*?[]/.test(arg)) return null;
  const pre = path.relative(realRoot(), realDir(cwd)).split(path.sep).join("/");
  if (pre === ".." || pre.startsWith("../")) return null;
  let re = "";
  for (const c of (pre ? pre + "/" : "") + arg.replace(/^\.\//, "")) re += c === "*" ? ".*" : c === "?" ? "." : c === "[" || c === "]" ? c : c.replace(/[.+^${}()|\\]/g, "\\$&");
  let rx;
  try { rx = new RegExp("^" + re + "$"); } catch { return "(git pathspec the parser cannot read: " + arg + ")"; }
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

function expandHome(arg) { return arg === "~" || arg?.startsWith("~/") ? path.join(os.homedir(), arg.slice(1)) : arg; }

function touchesGuarded(arg, cwd, docPaths) {
  if (!arg) return null;
  const lastSeg = lastSegmentGlob(arg, cwd, docPaths);
  if (lastSeg !== undefined) return lastSeg;
  const cut = arg.search(/[*?[{]/);
  const literal = cut === -1 ? arg : arg.slice(0, cut).replace(/[^/]*$/, "") || ".";
  const abs = realResolve(cwd, literal); // through realpath of the longest existing prefix
  const rel = path.relative(realRoot(), abs).split(path.sep).join("/");
  if (rel === ".." || rel.startsWith("../")) {
    // An ancestor of the project root contains every guarded doc.
    return path.relative(abs, realRoot()).startsWith("..") ? null : (rel || ".");
  }
  if (rel === "") return ".";
  if (docPaths.some((p) => [rel, "./" + rel, rel + "/x"].some((c) => globToRe(p).test(c)))) return rel;
  if (docPaths.some((p) => { const base = guardedBase(p); return base === rel || base.startsWith(rel + "/"); })) return rel;
  return null;
}

// True when a `find` rooted ABOVE the guarded docs (never inside them) selects
// only by -name/-iname (`names`, compiled) and no existing guarded file or
// directory matches any pattern. No name, or a start inside a guarded path,
// fails closed (false).
function findNamesMiss(names, start, cwd, docPaths) {
  if (!names.length) return false;
  const startRel = path.relative(realRoot(), realResolve(cwd, start)).split(path.sep).join("/");
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

// ARCH-DOCS-07: a Bash command whose text holds a removal-capable word (quoted
// or not) is blocked without the doc-write grant unless proveSafe() understands
// all of it: simple commands joined by ; && || | & or newline, literal or quoted
// words, no $ ` or ~ in a removal target, no env-assignment prefix, no shell
// keyword, { ( or function definition, and every removal target resolved
// (cwd, `git -C`, `cd X &&`) outside the guarded bases and their ancestors.
// Anything else with a removal word present is reported as a hit.
const REMOVAL_WORD = /\b(?:rm|unlink|rmdir|mv|shred|truncate|rsync|find|xargs|eval|clean)\b/;
const SHELL_C = /\b(?:sh|bash|zsh|dash|ksh)\b[\s\S]*\s-\w*c\b/; // `sh|bash|zsh -c`, wherever the flag sits
const CANDIDATES = new Set(["rm", "unlink", "rmdir", "mv", "shred", "truncate", "rsync", "find", "xargs", "eval", "git", "sh", "bash", "zsh", "dash", "ksh"]);
const RM_LIKE = new Set(["rm", "unlink", "rmdir", "mv", "shred", "truncate", "rsync"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const SAFE_HEADS = new Set(["echo", "printf", "grep", "egrep", "fgrep"]);
const DECLARERS = new Set(["export", "declare", "typeset", "readonly", "local"]);
const DYNAMIC = /[$`~]/;
const ASSIGNMENT = /^[A-Za-z_][\w[\]]*\+?=/;
const XARGS_ARG = new Set(["-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s"]);
const FIND_ACTION = /^-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)$/;
const FIND_ARG = new Set(["-name", "-iname", "-type", "-maxdepth", "-mindepth", "-mtime", "-mmin", "-atime", "-amin", "-ctime", "-cmin", "-size", "-newer", "-user", "-group", "-perm"]);
const FIND_FLAG = new Set(["-empty", "-print", "-print0", "-a", "-and", "-depth", "-xdev", "-mount", "-readable", "-writable", "-executable", "-true"]);

// Index of the `)` matching the `(` at i (quote-aware), or -1.
function matchParen(t, i) {
  let depth = 0;
  for (; i < t.length; i++) {
    const c = t[i];
    if (c === "\\") i++;
    else if (c === "'") { i = t.indexOf("'", i + 1); if (i === -1) return -1; }
    else if (c === '"') {
      for (i++; i < t.length && t[i] !== '"'; i++) {
        if (t[i] === "\\") i++;
        else if (t[i] === "$" && t[i + 1] === "(") { i = matchParen(t, i + 1); if (i === -1) return -1; }
      }
      if (i >= t.length) return -1;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

// Strict tokenizer for the safe subset: [{ words, sep, redirOut, redirIn, substs }]
// or null (after fail(why)) for anything outside it: `(` `)` a lone `&` `;;`,
// process substitution, an unclosed quote or substitution.
function tokenize(text, fail) {
  const cmds = [], n = text.length;
  const fresh = (sep) => ({ words: [], sep, redirOut: [], redirIn: false, substs: [] });
  let cur = fresh(null), word = null, pending = null;
  const endWord = () => {
    if (word === null) return;
    if (pending === "out") cur.redirOut.push(word); else if (!pending) cur.words.push(word);
    pending = null; word = null;
  };
  const endCmd = (op) => {
    endWord();
    if (pending) return false;
    if (cur.words.length || cur.redirOut.length || cur.redirIn) cmds.push(cur);
    cur = fresh(op);
    return true;
  };
  const redirect = (kind) => { // an operator: an all-digit word before it is its fd
    if (word !== null && /^\d+$/.test(word)) word = null; else endWord();
    pending = kind;
    if (kind !== "out") cur.redirIn = true;
  };
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (c === "\\") { if (text[i + 1] === "\n") i++; else word = (word ?? "") + (i + 1 < n ? text[++i] : "\\"); }
    else if (c === "'") {
      const j = text.indexOf("'", i + 1);
      if (j === -1) { fail("an unclosed quote"); return null; }
      word = (word ?? "") + text.slice(i + 1, j); i = j;
    } else if (c === '"') {
      word ??= "";
      for (i++; i < n && text[i] !== '"'; i++) {
        const d = text[i];
        if (d === "\\" && i + 1 < n) { const e = text[++i]; if (e !== "\n") word += '"\\$`'.includes(e) ? e : "\\" + e; }
        else if (d === "$" && text[i + 1] === "(") {
          const j = matchParen(text, i + 1);
          if (j === -1) { fail("an unclosed substitution"); return null; }
          cur.substs.push(text.slice(i + 2, j)); word += text.slice(i, j + 1); i = j;
        } else if (d === "`") {
          let j = i + 1; while (j < n && text[j] !== "`") j += text[j] === "\\" ? 2 : 1;
          if (j >= n) { fail("an unclosed substitution"); return null; }
          cur.substs.push(text.slice(i + 1, j)); word += text.slice(i, j + 1); i = j;
        } else word += d;
      }
      if (i >= n) { fail("an unclosed quote"); return null; }
    } else if (c === "$" && text[i + 1] === "(") {
      const j = matchParen(text, i + 1);
      if (j === -1) { fail("an unclosed substitution"); return null; }
      cur.substs.push(text.slice(i + 2, j)); word = (word ?? "") + text.slice(i, j + 1); i = j;
    } else if (c === "`") {
      let j = i + 1; while (j < n && text[j] !== "`") j += text[j] === "\\" ? 2 : 1;
      if (j >= n) { fail("an unclosed substitution"); return null; }
      cur.substs.push(text.slice(i + 1, j)); word = (word ?? "") + text.slice(i, j + 1); i = j;
    } else if (c === "#" && word === null && (i === 0 || /[\s;&|<>]/.test(text[i - 1]))) { while (i + 1 < n && text[i + 1] !== "\n") i++; }
    else if (c === " " || c === "\t" || c === "\r") endWord();
    else if (c === "\n") { if (!endCmd("\n")) { fail("a redirect without a target"); return null; } }
    else if (c === ";") {
      if (text[i + 1] === ";" || text[i + 1] === "&") { fail("a case terminator"); return null; }
      if (!endCmd(";")) { fail("a redirect without a target"); return null; }
    } else if (c === "&") {
      if (text[i + 1] === "&") { i++; if (!endCmd("&&")) { fail("a redirect without a target"); return null; } }
      else if (text[i + 1] === ">") { i++; if (text[i + 1] === ">") i++; redirect("out"); }
      else if (!endCmd("&")) { fail("a redirect without a target"); return null; }
    } else if (c === "|") {
      if (text[i + 1] === "&") { fail("a |& pipe"); return null; }
      const op = text[i + 1] === "|" ? "||" : "|"; if (op === "||") i++;
      if (!endCmd(op)) { fail("a redirect without a target"); return null; }
    } else if (c === "(" || c === ")") { fail("a subshell, group or function definition"); return null; }
    else if (c === "<") {
      if (text[i + 1] === "(") { fail("process substitution"); return null; }
      if (text[i + 1] === "<") { i++; if (text[i + 1] === "<") i++; else if (text[i + 1] === "-") i++; redirect("skip"); }
      else if (text[i + 1] === ">") { i++; redirect("out"); }
      else if (text[i + 1] === "&") { i++; const m = /^(?:\d+|-)/.exec(text.slice(i + 1)); if (m) i += m[0].length; else redirect("skip"); }
      else redirect("skip");
    } else if (c === ">") {
      if (text[i + 1] === "(") { fail("process substitution"); return null; }
      if (word !== null && /^\d+$/.test(word)) word = null; else endWord();
      if (text[i + 1] === ">" || text[i + 1] === "|") i++;
      if (text[i + 1] === "&") { i++; const m = /^(?:\d+|-)/.exec(text.slice(i + 1)); if (m) i += m[0].length; else pending = "out"; }
      else pending = "out";
    } else word = (word ?? "") + c;
  }
  if (!endCmd("")) { fail("a redirect without a target"); return null; }
  return cmds;
}

function removedDocs(cmd, docPaths) {
  const hits = [];
  const unsafe = (why) => { hits.push("(command the parser cannot prove safe: " + why + ")"); };
  // The gate reads the text with its quotes and backslashes removed as well as the
  // raw text, so `r''m`, `r\m` and `"r"m` are removal words; a `>` redirect onto a
  // guarded (or unresolvable) path, read from the de-quoted targets, is one too.
  const bare = cmd.replace(/['"\\]/g, "");
  const cdPresent = /\b(?:cd|pushd)\b/.test(bare);
  // A dynamic target ($VAR) is judged by the full analysis, and only when a removal word is present.
  const redirectBad = (t) => t && !/[$`]/.test(t) && !/^~[^/]/.test(t) && (touchesGuarded(expandHome(t), process.cwd(), docPaths) || (cdPresent && !path.isAbsolute(expandHome(t))));
  const redirectsOntoDocs = () => {
    for (const m of cmd.matchAll(/>>?\|?\s*(?:"([^"]*)"|'([^']*)'|([^\s;&|<>()]*))/g)) {
      if (redirectBad(m[1] ?? m[2] ?? m[3] ?? "")) return true;
    }
    const walk = (text, depth) => {
      if (depth > 5) return true;
      const cmds = tokenize(stripHeredocs(text), () => {});
      return !!cmds && cmds.some((c) => c.redirOut.some(redirectBad) || c.substs.some((x) => walk(x, depth + 1)));
    };
    return walk(cmd, 0);
  };
  if (!REMOVAL_WORD.test(cmd) && !REMOVAL_WORD.test(bare) && !SHELL_C.test(cmd) && !SHELL_C.test(bare) && !redirectsOntoDocs()) return hits;
  const fork = (st) => ({ cwds: st.cwds && st.cwds.slice() });

  // One removal target, resolved from every directory the command may run in.
  const ancestorOfGuarded = (root) => { // is this absolute dir the project root, above it, or a guarded base or its ancestor?
    const rel = path.relative(realRoot(), root).split(path.sep).join("/");
    if (rel === "") return true;
    if (rel === ".." || rel.startsWith("../")) return !path.relative(root, realRoot()).startsWith("..");
    return docPaths.some((p) => { const base = guardedBase(p); return base === rel || base.startsWith(rel + "/"); });
  };
  function target(arg, st, label, env) {
    if (env.exec && arg.includes("{}")) return;
    if (env.execdir && env.roots && !path.isAbsolute(arg) && env.roots.some(ancestorOfGuarded)) {
      return hits.push("(" + label + " target relative to a find -execdir directory under a root above a guarded path: " + arg + ")");
    }
    arg = expandHome(arg);
    if (DYNAMIC.test(arg)) return hits.push("(" + label + " target the parser cannot resolve: " + arg + ")");
    if (!st.cwds) return hits.push("(" + label + " in a directory the parser cannot resolve)");
    if (env.execdir && /(?:^|\/)\.\.(?:\/|$)/.test(arg)) return hits.push("(" + label + " target above a find -execdir directory: " + arg + ")");
    for (const cwd of st.cwds) { const h = touchesGuarded(arg, cwd, docPaths); if (h) hits.push(label === "redirect" ? "redirect:" + h : h); }
  }
  const targetsOf = (rest) => {
    const out = []; let dashes = false;
    for (const a of rest) {
      if (dashes) out.push(a);
      else if (a === "--") dashes = true;
      else if (a.startsWith("--") && a.includes("=")) out.push(a.slice(a.indexOf("=") + 1));
      else if (!a.startsWith("-")) out.push(a);
    }
    return out;
  };
  const noteRemoval = (verb, rest, env) => {
    if (!env.exec) return;
    env.exec.removal = true;
    if (verb !== "mv") env.exec.mvOnly = false;
    if (rest.some((a) => a.includes("{}"))) env.exec.brace = true;
  };

  function git(rest, st, env) {
    let i = 0, cwds = st.cwds, bad = null, always = null;
    while (i < rest.length && rest[i].startsWith("-")) {
      const o = rest[i];
      if (o === "-C") {
        const d = rest[i + 1];
        cwds = d === undefined || DYNAMIC.test(d) || !cwds ? null : cwds.map((c) => path.resolve(c, d));
        i += 2;
      } else if (o === "-c") { if (/^alias\./i.test(rest[i + 1] || "")) bad = always = "a git alias override"; i += 2; }
      else {
        if (/^--config-env\b/.test(o)) bad = always = "git " + o + " (a config override)";
        if (/^--(?:icase-pathspecs|work-tree|git-dir|separate-git-dir)\b/.test(o)) bad = "git " + o;
        i += /^--(?:git-dir|work-tree|namespace|super-prefix|config-env)$/.test(o) ? 2 : 1;
      }
    }
    const sub = rest[i];
    if (/GIT_CONFIG/.test(cmd)) bad = always = "a GIT_CONFIG_* variable (a config override)";
    if (sub !== "rm" && sub !== "mv" && sub !== "clean") {
      if (always) return unsafe(always);
      const args = rest.slice(i + 1);
      const message = sub === "commit" || sub === "tag";
      const named = args.filter((a, n) => REMOVAL_WORD.test(a) && !(message && (/^-[A-Za-z]*[mF]$|^--(?:message|file)$/.test(args[n - 1] || "") || /^(?:-[mF]|--message=|--file=)/.test(a))));
      if (named.length) unsafe("git " + (sub || "") + " given an argument naming a removal word (" + named[0] + ")");
      return;
    }
    const after = rest.slice(i + 1);
    noteRemoval(sub, after, env);
    if (env.unseen) return unsafe("git " + sub + " with input the parser cannot see");
    if (bad) return unsafe(bad);
    if (/GIT_ICASE_PATHSPECS|GIT_DIR|GIT_WORK_TREE/.test(cmd)) return unsafe("a git environment variable that changes pathspec matching or the work tree");
    if (after.some((a) => /^--pathspec-from-file/.test(a))) return unsafe("git pathspecs read from a file");
    const specs = targetsOf(after);
    if (sub === "clean" && !specs.length) specs.push(".");
    const at = { cwds };
    for (const spec of specs) {
      if (spec.startsWith(":")) { unsafe("git pathspec magic: " + spec); continue; }
      if (env.exec && spec.includes("{}")) continue;
      const before = hits.length;
      target(spec, at, "git " + sub, env);
      if (hits.length === before && cwds) for (const cwd of cwds) { const h = pathspecHit(spec, cwd, docPaths); if (h) hits.push(h); }
    }
  }

  function find(rest, st, depth) {
    let s = 0; while (s < rest.length && /^-[HLP]$/.test(rest[s])) s++;
    let e = s; while (e < rest.length && !rest[e].startsWith("-") && rest[e] !== "(" && rest[e] !== "!") e++;
    const starts = rest.slice(s, e), exprs = rest.slice(e);
    if (!exprs.some((x) => FIND_ACTION.test(x))) return; // selects only: removes nothing
    const names = []; let kind = null, execdir = false, execCmd = [];
    for (let i = 0; i < exprs.length && kind === null;) {
      const t = exprs[i];
      if (FIND_ARG.has(t)) {
        const a = exprs[i + 1];
        if (a === undefined || DYNAMIC.test(a)) return unsafe("find " + t + " argument");
        if (t === "-name" || t === "-iname") { try { names.push(segmentRe(a, t === "-iname" ? "i" : "")); } catch { return unsafe("find pattern " + a); } }
        i += 2;
      } else if (FIND_FLAG.has(t)) i++;
      else if (t === "-delete" && i === exprs.length - 1) kind = "delete";
      else if (t === "-exec" || t === "-execdir") {
        let m = i + 1;
        while (m < exprs.length && exprs[m] !== ";" && !(exprs[m] === "+" && exprs[m - 1] === "{}")) m++;
        if (m !== exprs.length - 1) return unsafe("find " + t + " not ending the expression");
        kind = "exec"; execdir = t === "-execdir"; execCmd = exprs.slice(i + 1, m);
      } else return unsafe("find expression " + t + " outside the -name/-type ... -delete|-exec form");
    }
    if (kind === null) return;
    const roots = starts.length ? starts : ["."];
    if (roots.some((r) => DYNAMIC.test(r))) return unsafe("find start path " + roots.join(" "));
    if (!st.cwds) return unsafe("find in a directory the parser cannot resolve");
    let deletes = kind === "delete";
    if (kind === "exec") {
      const exec = { removal: false, mvOnly: true, brace: false };
      const rootDirs = st.cwds.flatMap((d) => roots.map((r) => realResolve(d, r)));
      const cwds = execdir ? [...st.cwds, ...rootDirs] : st.cwds;
      dispatch(execCmd, {}, null, { cwds }, depth, { exec, execdir, roots: execdir ? rootDirs : undefined });
      deletes = exec.removal && (!exec.mvOnly || exec.brace);
    }
    if (deletes) for (const r of roots) for (const cwd of st.cwds) {
      const h = touchesGuarded(r, cwd, docPaths);
      if (h && !findNamesMiss(names, r, cwd, docPaths)) hits.push(h);
    }
  }

  // Every word that may be the command is examined: leading wrappers, their
  // options and option values (`env -u find rm`, `sudo -u x rm`, `timeout 5 rm`)
  // are read through, and a candidate that could be an option value does not end
  // the scan. The first word that is none of those is the command; one outside
  // the known-safe list is unsafe when an argument of it names a removal word.
  function dispatch(words, c, prev, st, depth, env) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i], b = path.basename(w), afterOption = i > 0 && words[i - 1].startsWith("-");
      if (CANDIDATES.has(b)) { dispatchAt(words, i, c, prev, st, depth, env); if (!afterOption) return; continue; }
      if (WRAPPERS.has(b) || w.startsWith("-") || ASSIGNMENT.test(w) || afterOption || /^\d+(?:\.\d+)?[smhd]?$/.test(w)) continue;
      const args = words.slice(i + 1);
      const safe = SAFE_HEADS.has(b) || (b === "node" && args.length > 0 && /(?:^|\/)scripts\/[\w.-]+\.mjs$/.test(args[0]));
      const named = args.find((a) => REMOVAL_WORD.test(a));
      if (!safe && named !== undefined) unsafe("an argument naming a removal word is given to " + b + " (" + named + ")");
      return;
    }
  }

  function dispatchAt(words, k, c, prev, st, depth, env) {
    const verb = path.basename(words[k]), rest = words.slice(k + 1);
    if (RM_LIKE.has(verb)) {
      noteRemoval(verb, rest, env);
      if (env.unseen) return unsafe(verb + " with input the parser cannot see");
      for (const t of targetsOf(rest)) target(t, st, verb, env);
    } else if (verb === "git") git(rest, st, env);
    else if (verb === "find") find(rest, st, depth);
    else if (verb === "xargs") {
      let i = 0; while (i < rest.length && rest[i].startsWith("-")) i += XARGS_ARG.has(rest[i]) ? 2 : 1;
      const tail = rest.slice(i);
      if (!tail.length) return; // bare xargs only echoes
      const opts = rest.slice(0, i);
      const feeder = prev && c.sep === "|" ? path.basename(prev.words[0] || "") : "";
      const fed = prev ? prev.words.slice(1) : [];
      // xargs splits on blanks, honours quotes, and -d/-0/-E/-I change what it reads;
      // printf formats and echo escapes build text the parser cannot see.
      const reshaped = opts.some((o) => /^-(?!-)[A-Za-z0-9]*[d0EIi]|^--(?:delimiter|null|eof|replace)/.test(o) || /^-a|^--arg-file/.test(o))
        || fed.some((x) => /['"]/.test(x) || (feeder === "printf" ? /[%\\]/.test(x) : /\\/.test(x)))
        || (feeder === "echo" && fed.some((x) => /^-[A-Za-z]*e/.test(x)));
      const visible = (feeder === "echo" || feeder === "printf") && !c.redirIn && !reshaped;
      const extra = visible ? fed.filter((x) => !x.startsWith("-")).flatMap((x) => x.split(/\s+/)).filter(Boolean) : [];
      dispatch([...tail, ...extra], {}, null, st, depth, { ...env, unseen: !visible });
    } else if (SHELLS.has(verb) || verb === "eval") {
      let body;
      if (verb === "eval") body = rest.join(" ");
      else {
        const at = rest.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w));
        if (at === -1) return unsafe("a shell running a script or input the parser cannot see");
        let j = at + 1; while (j < rest.length && rest[j].startsWith("-") && rest[j] !== "--") j++;
        if (rest[j] === "--") j++;
        body = rest[j];
        if (body === undefined) return unsafe("a shell -c without a command");
      }
      analyze(body, fork(st), depth + 1, { exec: env.exec, execdir: env.execdir, roots: env.roots });
    }
  }

  function run(c, prev, st, depth, env) {
    for (const s of c.substs) analyze(s, fork(st), depth + 1, {});
    for (const t of c.redirOut) if (t !== "/dev/null") target(t, st, "redirect", {});
    const w = c.words;
    if (!w.length) return;
    if (ASSIGNMENT.test(w[0])) return unsafe("an environment assignment prefix (" + w[0] + ")");
    if (KEYWORDS.has(w[0])) return unsafe("the shell keyword " + w[0]);
    if (/[$`]/.test(w[0])) return unsafe("a command name the parser cannot resolve");
    const head = path.basename(w[0]);
    if (DECLARERS.has(head) && w.slice(1).some((a) => ASSIGNMENT.test(a))) return unsafe("an assignment given to " + head);
    if (head === "cd" || head === "pushd" || head === "popd") {
      let arg = w.slice(1).find((a) => !a.startsWith("-"));
      if (arg === "~" || arg?.startsWith("~/")) arg = path.join(os.homedir(), arg.slice(1));
      if (head === "popd" || !arg || arg === "-" || DYNAMIC.test(arg)) st.cwds = null;
      else if (st.cwds) st.cwds = [...new Set([...st.cwds, ...st.cwds.map((d) => path.resolve(d, arg))])];
      return;
    }
    if (WRAPPERS.has(head) && w.some((a) => /[$`]/.test(a))) return unsafe("a wrapped command the parser cannot resolve");
    // `env -C`/`sudo -D` change the working directory; `env -S` splits a string into a command.
    let at = st;
    if (WRAPPERS.has(head)) {
      let wrapper = "";
      for (const a of w) {
        const b = path.basename(a);
        if (CANDIDATES.has(b)) break;
        if (b === "env" || b === "sudo") { wrapper = b; continue; }
        if (!a.startsWith("-") || a === "--") continue;
        if (wrapper === "env" && /^(?:-[A-Za-z]*S|--split-string)/.test(a)) return unsafe("env -S splits a string into a command");
        if ((wrapper === "env" && /^(?:-[A-Za-z]*C|--chdir)/.test(a)) || (wrapper === "sudo" && /^(?:-[A-Za-z]*D|--chdir)/.test(a))) at = { cwds: null };
      }
    }
    dispatch(w, c, prev, at, depth, env);
  }

  function analyze(text, st, depth, env) {
    if (depth > 5) return unsafe("nesting too deep");
    const cmds = tokenize(stripHeredocs(text), unsafe);
    if (cmds) cmds.forEach((c, i) => run(c, cmds[i - 1] || null, st, depth, env));
  }

  analyze(cmd, { cwds: [process.cwd()] }, 0, {});
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

// The file as it would read after this Write/Edit, or null when the
// edit can't apply (the tool then fails on its own; nothing to guard).
function afterEdit(current) {
  if (tool === "Write") return typeof toolInput.content === "string" ? toolInput.content : null;
  const edits = [toolInput];
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
if (!safetyEnabled()) process.exit(0); // ARCH-SAFETY-05: CRAFTSMAN_SAFETY=off in the user's environment only
// The doc-write authority and tracker checks belong to the doc side, which follows enabled(): off for
// CRAFTSMAN=off, .craftsman/off, enabled:false, and outside a git repo (ARCH-SAFETY-08). Everything else
// in this file is safety and runs whatever enabled() says.
const docSide = enabled(cfg, activeContext);
const rel = target ? path.relative(activeRoot, target).split(path.sep).join("/") : "";
if (activeScope && ["Read", "Glob", "Grep", "Write", "Edit", "NotebookEdit"].includes(tool)) {
  if (activeScope.scope_ambiguous) {
    process.stderr.write(`craftsman: ${tool} blocked because more than one active project scope matches this session. Activate the intended project scope explicitly before retrying.\n`);
    process.exit(2);
  }
  const bucket = ["Write", "Edit", "NotebookEdit"].includes(tool) ? "write" : "read";
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

// The same rule read by token (shell-words, no new parser): `commit -n` and clustered short flags (`-an`,
// `-nm msg`), abbreviated long flags git accepts (`--no-ver`), `-ccore.hooksPath=...`, `--config-env=`, any
// case of the config key, and every falsy spelling of commit.gpgsign. Only `git [wrappers] [globals] commit|push`
// at command position counts, so a message or an argument that merely holds `-n` does not. A command the lexer
// cannot read with certainty returns false here and meets the text check above and below.
// Options of a wrapper that take a value: the next word is that value, not the wrapped command.
const WRAPPER_VALUE_SHORT = { env: "uCS", sudo: "ugCDhprtUTR", doas: "uC", nice: "n", timeout: "sk", stdbuf: "ioe", ionice: "cnpt", time: "fo" };
const WRAPPER_VALUE_LONG = new Set(["--unset", "--chdir", "--split-string", "--user", "--group", "--host", "--prompt", "--role", "--type", "--other-user", "--chroot", "--signal", "--kill-after"]);
const COMMIT_VALUE_SHORT = new Set(["m", "F", "C", "c", "t"]); // value: the rest of the cluster, else the next word
const COMMIT_ATTACHED_SHORT = new Set(["S", "u"]); // value is attached or absent
const COMMIT_VALUE_LONG = new Set(["--message", "--file", "--author", "--date", "--reuse-message", "--reedit-message", "--template", "--cleanup", "--fixup", "--squash", "--pathspec-from-file", "--trailer"]);
const ASSIGNMENT_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/;
// The index of the first word that is one of `targets`, looking through assignments and the shared WRAPPERS
// (with their options, and the values of those that take one).
function commandWordIndex(words, targets) {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (ASSIGNMENT_WORD.test(word)) continue;
    const base = word.split("/").pop();
    if (targets.has(base)) return i;
    if (!WRAPPERS.has(base)) return -1;
    const valued = WRAPPER_VALUE_SHORT[base] || "";
    while (i + 1 < words.length && (words[i + 1].startsWith("-") || /^\d+[smhd]?$/.test(words[i + 1]) || ASSIGNMENT_WORD.test(words[i + 1]))) {
      i++;
      const opt = words[i];
      if ((/^-[A-Za-z]$/.test(opt) && valued.includes(opt[1])) || WRAPPER_VALUE_LONG.has(opt)) i++;
    }
  }
  return -1;
}
const GIT_ONLY = new Set(["git"]);
const gitWordIndex = (words) => commandWordIndex(words, GIT_ONLY);
// The body of `sh -c '<body>'` (any cluster holding c, any wrapper before it), else null.
function shellBody(words) {
  const at = commandWordIndex(words, SHELLS);
  if (at < 0) return null;
  for (let j = at + 1; j < words.length; j++) {
    const word = words[j];
    if (word === "--" || !/^[-+]/.test(word)) return null;
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(word)) return words[j + 1] ?? null;
    if (word === "-o" || word === "+o" || word === "-O") j++;
  }
  return null;
}
const HOOK_ENV = /\bGIT_CONFIG_(?:KEY_\d+|PARAMETERS)=\S*?(?:core\.hookspath|commit\.gpgsign)/i;
// `git config` that points hooks elsewhere, or defines an alias that itself skips them.
function configBypasses(args) {
  if (args.some((a) => /^(?:--get\S*|--unset\S*|--list|-l|--remove-section|--rename-section)$/.test(a))) return false;
  const operands = [];
  for (let k = 0; k < args.length; k++) {
    if (["-f", "--file", "--blob", "--type", "--default"].includes(args[k])) k++;
    else if (!args[k].startsWith("-")) operands.push(args[k]);
  }
  const key = (operands[0] ?? "").toLowerCase();
  const value = operands.slice(1).join(" ");
  if (key === "core.hookspath") return true;
  if (key.startsWith("alias.") && value) return bypassesHooks("git " + value, 1) || bypassesHooks(value.replace(/^!/, ""), 1);
  return false;
}
function bypassesHooks(text, depth = 0) {
  if (depth > 3) return true; // nesting this deep is not a commit
  if (HOOK_ENV.test(text)) return true;
  let segments;
  try { segments = shellSegments(text); } catch { return false; }
  for (const words of segments) {
    if (words.includes(UNEXPANDED)) continue;
    const body = shellBody(words);
    if (body !== null && bypassesHooks(body, depth + 1)) return true;
    const at = gitWordIndex(words);
    if (at < 0) continue;
    const configs = [];
    let i = at + 1;
    for (; i < words.length; i++) {
      const word = words[i];
      if (word === "-c" || word === "--config-env") configs.push(words[++i] ?? "");
      else if (word.startsWith("--config-env=")) configs.push(word.slice("--config-env=".length));
      else if (word.startsWith("-c") && !word.startsWith("--")) configs.push(word.slice(2));
      else if (["-C", "--git-dir", "--work-tree", "--namespace", "--super-prefix"].includes(word)) i++;
      else if (!word.startsWith("-")) break;
    }
    const sub = words[i];
    if (sub === "config" && configBypasses(words.slice(i + 1))) return true;
    if (sub !== "commit" && sub !== "push") continue;
    for (const config of configs) {
      const eq = config.indexOf("=");
      const key = (eq < 0 ? config : config.slice(0, eq)).toLowerCase();
      const value = eq < 0 ? "" : config.slice(eq + 1).toLowerCase();
      if (key === "core.hookspath" || (key === "commit.gpgsign" && ["false", "no", "off", "0"].includes(value))) return true;
    }
    const rest = words.slice(i + 1);
    for (let j = 0; j < rest.length; j++) {
      const word = rest[j];
      if (word === "--") break;
      if (word.startsWith("--")) {
        const name = word.split("=")[0];
        if (name.length >= 6 && "--no-verify".startsWith(name)) return true;
        if (name.length >= 6 && "--no-gpg-sign".startsWith(name)) return true;
        if (COMMIT_VALUE_LONG.has(word)) j++;
      } else if (sub === "commit" && /^-[A-Za-z]/.test(word)) {
        const cluster = word.slice(1);
        for (let k = 0; k < cluster.length; k++) {
          if (cluster[k] === "n") return true;
          if (COMMIT_VALUE_SHORT.has(cluster[k])) { if (k === cluster.length - 1) j++; break; }
          if (COMMIT_ATTACHED_SHORT.has(cluster[k])) break;
        }
      }
    }
  }
  return false;
}

// A hook rejection is fixed, never bypassed (--no-verify is forbidden):
// unconditional, for every commit/push with or without a worktree binding.
// The flag test is linear; the commit/push one retries per `git`, so only a
// command under 16 KB reaches it — a larger one with a bypass flag is blocked.
if (tool === "Bash" && ((/--no-verify\b|--no-gpg-sign\b|-c\s+commit\.gpgsign=false|-c\s+core\.hooksPath=/.test(command)
    && (command.length > 16384 || /\bgit\s+(?:-[A-Za-z]+(?:=\S+|\s+[^-\s]\S*)?\s+)*(?:commit|push)\b/.test(command)))
    || (command.length <= 16384 && bypassesHooks(command)))) {
  logEvent({ ms: Date.now() - T0, ev: "verify_bypass_blocked", sid: sidOf(input), command });
  process.stderr.write(
    `craftsman: Git commit/push hook bypass BLOCKED (--no-verify, commit -n, --no-gpg-sign, gpgsign=false / ` +
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

if (!activeScope && scopeRequired(input) && ["Read", "Glob", "Grep", "Write", "Edit", "NotebookEdit"].includes(tool)) {
  process.stderr.write(
    `craftsman: ${tool} blocked because this session requires an active unit scope. ` +
    `Re-analyse the unit boundary, activate scripts/scope.mjs with the exact read/docs/write ` +
    `manifest, then retry.\n`
  );
  process.exit(2);
}

// ARCH-SAFETY-05: a tool call cannot switch the guards off. Token matching only; anything the parser
// cannot read stays with the sandbox. "never" paths are written by craftsman's own scripts, never by a
// tool call. "scoped" paths can be edited by a unit whose scope manifest (made by /orchestrate) names them.
const SELF_NEVER = [".craftsman/off", ".craftsman/doc-write-pending", ".craftsman/sessions/**/doc-write", ".craftsman/sessions/**/commands.json", ".craftsman/sessions/**/goal-tokens.json",
  // The scope manifests: scope.mjs (a script, never a tool call) is their only writer, so a forged one cannot widen a unit.
  ".craftsman/sessions/**/scope*", ".craftsman/sessions/**/*worktree-binding*"];
const SELF_SCOPED = ["hooks/hooks.json", "craftsman.config.json"];
const SAFETY_CONFIG_KEYS = ["safety", "stopGate"];
const selfKind = (relPath) => {
  const r = String(relPath).replace(/^\.\//, "");
  if (SELF_NEVER.some((p) => globToRe(p).test(r))) return "never";
  return SELF_SCOPED.some((p) => r === p || r.endsWith("/" + p)) ? "scoped" : null;
};
const scopeNames = (relPath) => (activeScope?.scope?.write || []).some((entry) => allowed(entry, String(relPath).replace(/^\.\//, "")));
function safetyKeysChanged(current, next) {
  if (next === null) return false; // the edit cannot apply; the tool fails on its own
  let after;
  try { after = JSON.parse(next); } catch { return true; } // a result that is not JSON cannot be shown safe
  let before = {};
  try { before = JSON.parse(current); } catch { /* an unreadable current file counts as empty */ }
  return SAFETY_CONFIG_KEYS.some((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
}
function denySelfDisable(what) {
  logEvent({ ms: Date.now() - T0, ev: "selfguard", sid: sidOf(input), what, result: "blocked" });
  process.stderr.write(
    `craftsman: ${what} is blocked: craftsman's own guards cannot be switched off or rewritten by a tool call. ` +
    `Ask the user to make this change themselves, or run the craftsman command that owns it.\n`
  );
  process.exit(2);
}
if (tool === "Bash" && command) {
  const verb = /(?:^|[\s;&|(])(?:touch|tee|cp|mv|ln|install|dd|truncate|mkdir)(?=\s)|\bsed\s+-[A-Za-z]*i\b|\bperl\s+-[A-Za-z]*i\b/.test(command);
  const never = /\.craftsman\/(?:off|doc-write-pending)(?![\w.-])|\.craftsman\/sessions\/\S*(?:\/doc-write(?![\w.-])|commands\.json|goal-tokens\.json|\/scope[\w.-]*|[\w.-]*worktree-binding)/.test(command);
  const scopedMentioned = ["hooks/hooks.json", "craftsman.config.json"].filter((name) => new RegExp(`(?:^|[\\s"'=/])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`).test(command));
  const concrete = removedDocs(command, [...SELF_NEVER, ...SELF_SCOPED, ...SELF_SCOPED.map((p) => "**/" + p)])
    .filter((h) => !h.startsWith("(")).map((h) => h.replace(/^redirect:/, ""));
  if (never && verb) denySelfDisable("a command that writes a craftsman grant, marker or off flag");
  // A link into the state directory would let a later Write reach it under another name.
  if (/(?:^|[\s;&|(])ln(?=\s)/.test(command) && command.includes(".craftsman")) denySelfDisable("a command that links into .craftsman");
  for (const hit of concrete) {
    const kind = selfKind(hit);
    if (kind === "never") denySelfDisable(`a command that writes ${hit}`);
    if (kind === "scoped" && !scopeNames(hit)) denySelfDisable(`a command that writes ${hit}`);
  }
  if (verb) for (const name of scopedMentioned) if (!scopeNames(name)) denySelfDisable(`a command that writes ${name}`);
  // The scripts that grant doc authority or flip the gates run only after the command that owns them.
  // Every `node … <name>.mjs` invocation counts, whatever node options precede it; `node --check` only parses.
  const invocations = (name) => [...command.matchAll(new RegExp(`\\bnode\\b([^;&|\\n]*?)["']?[^\\s;&|"']*\\b${name}\\.mjs["']?(?:[ \\t]+([^\\s;&|)]*))?`, "g"))]
    .filter((m) => !/(?:^|\s)(?:--check|-c)(?=\s|$)/.test(m[1]))
    .map((m) => (m[2] || "").replace(/^["']|["']$/g, ""));
  if (invocations("doc-write").some((arg) => arg !== "off") && !commandInvoked(sidOf(input), DOC_WRITER_COMMANDS, { context: { stateDir: STATE_DIR } })) {
    denySelfDisable("doc-write.mjs on outside /plan, /orchestrate, /sync-docs, /idea, /architect or /builtin-check");
  }
  if (invocations("toggle").some((arg) => arg !== "on") && !commandInvoked(sidOf(input), ["toggle"], { context: { stateDir: STATE_DIR }, via: "prompt" })) {
    denySelfDisable("toggle.mjs off unless the user typed /craftsman:toggle");
  }
}

// Deleting a guarded doc is a write: `rm` / `git rm` (also chained) needs the grant.
if (tool === "Bash" && command && docSide && cfg.docWriteGuard?.enabled !== false) {
  const docPaths = cfg.docWriteGuard?.docPaths || ["docs/**"];
  const hit = removedDocs(command, docPaths);
  if (hit.length && !hasDocWriteGrant({ sid: sidOf(input), claim: true }, { ...activeContext, grantStateDir: STATE_DIR })) {
    logEvent({ ms: Date.now() - T0, ev: "docguard", file: hit[0], sid: sidOf(input), result: "blocked" });
    const first = hit[0], ask = `Hand the change to /plan, or if you ARE that command, first run: node "\${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on\n`;
    process.stderr.write(
      first.startsWith("(redirect target the parser cannot resolve")
        ? `craftsman: this command holds a removal word and redirects to a target the guard cannot resolve ${first}; ` +
          `without doc-write authority it is blocked. Redirect to a literal path, or: ${ask}`
      : first.startsWith("(")
        ? `craftsman: this command holds a removal word and the guard cannot prove it safe ${first}; ` +
          `without doc-write authority it is blocked. Rewrite it with literal targets, or: ${ask}`
        : first.startsWith("redirect:")
          ? `craftsman: this command writes with a redirect (>) to "${first.slice(9)}", which matches this repo's guarded ` +
            `doc path(s) (docWriteGuard.docPaths); writing it needs doc-write authority. ${ask}`
          : `craftsman: "${first}" matches this repo's guarded doc path(s) (docWriteGuard.docPaths); ` +
            `removing it with rm / git rm needs doc-write authority. ${ask}`
    );
    process.exit(2);
  }
}

if (!file) process.exit(0); // no file: nothing to time or log

if (["Write", "Edit"].includes(tool)) {
  // The target by its real path too: a symlinked directory (`cs -> .craftsman/sessions`) is the same file.
  const realTarget = path.relative(realRoot(), realResolve(activeRoot, file)).split(path.sep).join("/");
  const kinds = [selfKind(rel), selfKind(realTarget)];
  if (kinds.includes("never")) denySelfDisable(`writing ${rel}`);
  if (kinds.includes("scoped") && !(scopeNames(rel) || scopeNames(realTarget))) {
    if (rel.endsWith("hooks/hooks.json")) denySelfDisable(`editing ${rel}`);
    let current = "";
    try { current = fs.readFileSync(path.resolve(activeRoot, file), "utf8"); } catch {}
    if (safetyKeysChanged(current, afterEdit(current))) denySelfDisable(`editing the safety keys (${SAFETY_CONFIG_KEYS.join(", ")}) of ${rel}`);
  }
}

// 0) One tracker, in the main checkout: a worktree's TRACKER.md is never
//    written, and the root's generated ledger block is never hand-edited.
const tracker = docSide && ["Write", "Edit"].includes(tool) ? trackerTarget(path.resolve(activeRoot, file)) : null;
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

const rollup = docSide && ["Write", "Edit"].includes(tool) ? rollupTarget(path.resolve(activeRoot, file)) : null;
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
const writeTool = ["Write", "Edit", "NotebookEdit"].includes(tool);
if (g.enabled !== false && writeTool && docSide) {
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

logEvent({ ms: Date.now() - T0, ev: "preguard", sid: sidOf(input), tool, file: rel, result: "allowed" });
process.exit(0);
