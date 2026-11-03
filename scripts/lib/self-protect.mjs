// The one list of files only a unit run by /orchestrate or /auto may rewrite (ARCH-SAFETY-05).
// scope.mjs refuses to activate a manifest whose write list can reach one of them without such a
// run; pre-guard.mjs gives the exemption only to a scope that names one. Both import it from here.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { globToRe } from "./core.mjs";

export const SELF_SCOPED = Object.freeze([
  "hooks/hooks.json",
  "craftsman.config.json",
  "craftsman.project.json", // the project override (core.mjs loadConfig): it can set every key the config can
  ".claude/settings.json",
  ".claude/settings.local.json",
]);

// Paths no tool call may write: craftsman's own scripts (and git itself) are their only writers.
export const SELF_NEVER = Object.freeze([
  ".craftsman/off", ".craftsman/doc-write-pending", ".craftsman/sessions/**/doc-write", ".craftsman/sessions/**/commands.json", ".craftsman/sessions/**/goal-tokens.json", ".craftsman/sessions/**/nonce-*",
  // The scope manifests: scope.mjs (a script, never a tool call) is their only writer, so a forged one cannot widen a unit.
  ".craftsman/sessions/**/scope*", ".craftsman/sessions/**/*worktree-binding*",
  // The approval record gateFeature and runLanded trust: approval.mjs and repo-exec.mjs write it from their own process, so a forged one would pass the gate.
  ".craftsman/approvals/**",
  // The network push queue in the git common dir (repo-exec's enqueuePush is its only writer): root's unattended drain pushes what it holds with the user's credentials, so a forged entry must not reach it (ARCH-SAFETY-13, ARCH-LAND-36).
  "**/.git/.craftsman/network/**",
  // A submodule project's git dir is the superproject's .git/modules/<name> (nested ones add /modules/<inner>), so its queue is not under a bare .git/.craftsman.
  "**/.git/modules/**/.craftsman/network/**",
  // A superproject's linked worktree keeps the git dir of a submodule checked out in it under .git/worktrees/<wt>/modules/<name>, and the queue with it.
  "**/.git/worktrees/*/modules/**/.craftsman/network/**",
  // git's own config and hooks decide which hooks run (core.hooksPath, aliases): a tool call must not write them. `{a,b}` is a choice between names inside one path segment, so one pattern covers
  // several and NEVER_TEXT, which carries every pattern, does not grow with them.
  "**/.git/{config,config.worktree}", "**/.git/hooks/**",
  // A submodule's git dir holds the same config and hooks, and each of its linked worktrees (.git/modules/<name>/worktrees/<wt>) a config of its own and the commondir and gitdir files that say where
  // git's common dir and the work tree are: a forged one moves the repository that the queue lookup and every other guard here find (ARCH-SAFETY-13).
  "**/.git/modules/**/{config,config.worktree}", "**/.git/modules/**/hooks/**", "**/.git/modules/**/worktrees/*/{config*,commondir,gitdir}",
  // a linked worktree's own config (extensions.worktreeConfig, e.g. after sparse-checkout) is read from the main .git, and so are its commondir and gitdir
  "**/.git/worktrees/*/{config,config.worktree,commondir,gitdir}",
  // The git dir of a submodule checked out in a superproject's linked worktree, .git/worktrees/<wt>/modules/<name>, holds all of the above again.
  "**/.git/worktrees/*/modules/**/{config,config.worktree}", "**/.git/worktrees/*/modules/**/hooks/**", "**/.git/worktrees/*/modules/**/worktrees/*/{config*,commondir,gitdir}",
]);

// A glob as a case-insensitive RegExp: the filesystems this runs on (default macOS, Windows) reach `.Claude` as `.claude`.
const ci = (glob) => new RegExp(globToRe(glob).source, "i");
const clean = (entry) => String(entry).replaceAll("\\", "/").replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");

// Does one `scope.write` entry (a path, a directory or a glob) reach `name`?
function reaches(entry, name) {
  const e = clean(entry).toLowerCase();
  if (e === "" || e === ".") return true; // the whole project
  // Over-matching only demands an /orchestrate run, so a bare filename counts as a hit too.
  if (e === name || e.endsWith("/" + name) || name.endsWith("/" + e)) return true;
  if (!/[*?{[]/.test(e)) return name.startsWith(e + "/"); // a directory that holds it
  return ci(e).test(name);
}

// craftsman.config.json keys that switch a guard off or loosen it; an edit that changes one needs a unit scope
// naming the file. Dotted names reach into a nested object. Every key here exists in the shipped config.
export const SAFETY_CONFIG_KEYS = Object.freeze([
  "enabled", "protectedPaths", "docWriteGuard", "execution.agentMode", "execution.engine", "stopGate",
  "worktrees", // what the Stop and SessionStart sweep may remove (ARCH-SAFETY-07)
  "repoExec.approval.required", "planning.featureBranches", // the approval gate runs only when both are true (approval-gate.mjs approvalRequired)
]);

// Environment keys in the harness settings that decide whether node runs craftsman's hooks, or which code it loads.
export const SAFETY_ENV = /^(?:CRAFTSMAN|DYLD_|(?:NODE_OPTIONS|NODE_PATH|PATH|CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR|CLAUDE_CODE_SESSION_ID|LD_PRELOAD|LD_LIBRARY_PATH)$)/i;

const dig = (obj, dotted) => dotted.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), obj) ?? null;

// What an edit of a scoped file may not change: the safety keys of craftsman.config.json, or the harness settings
// that decide whether craftsman's hooks run at all (every hook, craftsman's plugin entry, the safety env).
export function safetyProjection(rel, doc) {
  if (!doc || typeof doc !== "object") return {};
  if (/(?:^|\/)\.claude\/settings(?:\.local)?\.json$/i.test(rel)) {
    const pick = (obj, re) => Object.fromEntries(Object.entries(obj && typeof obj === "object" ? obj : {}).filter(([key]) => re.test(key)));
    return { disableAllHooks: doc.disableAllHooks ?? null, hooks: doc.hooks ?? null, sandbox: doc.sandbox ?? null, defaultMode: doc.permissions?.defaultMode ?? null, plugins: pick(doc.enabledPlugins, /^craftsman(?:@|$)/i), env: pick(doc.env, SAFETY_ENV) };
  }
  return Object.fromEntries(SAFETY_CONFIG_KEYS.map((key) => [key, dig(doc, key)]));
}

// Each write entry again with the symlinks in its literal directory prefix followed: `c/**` with `c -> .claude` is also
// `.claude/**`. Only the entries that change are returned; a link that leaves the project is skipped. scope.mjs judges
// the entries and these together, so a manifest cannot reach a self-scoped file through a link it made itself.
export function realEntries(writeEntries, root) {
  let realRoot;
  try { realRoot = fs.realpathSync(root); } catch { return []; }
  const out = [];
  for (const entry of Array.isArray(writeEntries) ? writeEntries : []) {
    const e = clean(entry);
    const cut = e.search(/[*?{[]/);
    const dir = cut < 0 ? e : e.slice(0, cut).replace(/[^/]*$/, "");
    const tail = cut < 0 ? "" : e.slice(dir.length);
    let probe = path.resolve(realRoot, dir);
    const missing = [];
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) { missing.unshift(path.basename(probe)); probe = path.dirname(probe); }
    let real;
    try { real = path.join(fs.realpathSync(probe), ...missing); } catch { continue; }
    const rel = path.relative(realRoot, real).split(path.sep).join("/");
    if (rel.startsWith("..")) continue;
    const resolved = [rel, tail].filter(Boolean).join("/");
    if (resolved !== e) out.push(resolved === "" ? "." : resolved);
  }
  return out;
}

// The self-scoped files any of `writeEntries` can reach, in list order.
export function namesSelfScoped(writeEntries) {
  const entries = Array.isArray(writeEntries) ? writeEntries : [];
  return SELF_SCOPED.filter((name) => entries.some((entry) => reaches(entry, name)));
}

// The one list of commands that write or move a file. pre-guard builds its text gates and its dispatch from it.
export const WRITER_VERBS = Object.freeze(["touch", "tee", "cp", "mv", "ln", "link", "install", "dd", "truncate", "mkdir", "sed", "perl"]);

// A glob as free text: how a command line would spell it before any quote is removed. `**/` may be empty. NEVER_TEXT is searched, not anchored, so a `**/` that leads a glob would only
// make every alternative read the rest of the word from every position (quadratic: a 4 KB word of `.git/modules/` took seconds): it is dropped, and the name is found wherever it sits.
function globToText(glob) {
  const body = glob.startsWith("**/") ? glob.slice(3) : glob;
  let re = "", choice = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "*" && body[i + 1] === "*") {
      i++;
      if (body[i + 1] === "/") { i++; re += "(?:\\S*/)?"; } else re += "\\S*";
    } else if (c === "*") re += "[\\w.-]*";
    else if (c === "{") { choice = true; re += "(?:"; } // `{a,b}`: one of the names, inside one path segment
    else if (c === "}") { choice = false; re += ")"; }
    else if (c === "," && choice) re += "|";
    else re += c.replace(/[.+?^${}()|[\]\\/]/g, "\\$&");
  }
  return re;
}
// The raw-text gate: does a command line name a never-written path? Derived from SELF_NEVER, so it cannot drift. The name must end where the path does (`.git/config.bak` is not `.git/config`): one lookahead
// after the alternation, not one per pattern.
export const NEVER_TEXT = new RegExp("(?:" + SELF_NEVER.map(globToText).join("|") + ")(?![\\w.-])", "i");

// Words that, once the quotes are gone, name craftsman state or the files this layer protects. A bare `off` or
// `doc-write` is not here on purpose (too common): those are caught as paths by NEVER_TEXT.
const PROTECTED_WORDS = new Set([".craftsman", ".claude", "doc-write-pending", "commands.json", "goal-tokens.json",
  "settings.json", "settings.local.json", "hooks.json", "craftsman.config.json"]);
// Does a command line (read after its quotes are removed) name a protected path? Used where the shell parser gave up,
// so what a command writes cannot be read: it is refused only when it also names craftsman state.
export function namesProtected(text) {
  const bare = String(text).replace(/['"\\]/g, "");
  if (NEVER_TEXT.test(bare)) return true;
  if (SELF_SCOPED.some((name) => bare.includes(name))) return true;
  return bare.split(/[\s;&|()<>={}]+/).some((word) => PROTECTED_WORDS.has(word.toLowerCase()) || PROTECTED_WORDS.has(word.split("/").pop().toLowerCase()) || word.toLowerCase().startsWith(".craftsman/") || word.toLowerCase().startsWith(".claude/settings"));
}

// The last name of a glob as a sample name that it matches (`x` for `*`, the first of a `{a,b}`): the file a directory would hold.
const lastSegment = (glob) => glob.split("/").pop().replace(/\{([^,}]*)[^}]*\}/g, "$1").replace(/\*+/g, "x");
const literalBase = (glob) => {
  const parts = [];
  for (const part of glob.split("/")) { if (/[*?[{]/.test(part)) break; parts.push(part); }
  return parts.join("/");
};
// A pattern led by `**/` has no literal base of its own: it sits under any directory, so its names are found at the end of a path. Its anchor is the names before its first `**`, read as a glob
// (`.git/worktrees/*/modules` for `**/.git/worktrees/*/modules/**/config`; the `*` is any one worktree's name). The anchor and each directory above it (`.git`, `.git/worktrees`, `.git/worktrees/wt`) hold a
// match, and a `**` swallows any directories, so everything beneath the anchor may lead to one. Nothing else does: `.git/worktrees/wt/index.lock` lies beside the anchor, not under it.
const anchors = new Map();
function anchorOf(pattern) {
  if (!pattern.startsWith("**/")) return null;
  let anchor = anchors.get(pattern);
  if (anchor === undefined) {
    const names = pattern.slice(3).split("/"), swallow = names.indexOf("**");
    const lead = swallow < 0 ? names : names.slice(0, swallow);
    const endsWith = (list) => new RegExp("(?:^|/)" + globToRe(list.join("/")).source.slice(1), "i"); // the glob at the end of a path, on a name boundary: `.git`, not `.github`
    anchor = lead.length === 0 ? { dirs: [], beneath: null }
      : { dirs: lead.map((_, n) => endsWith(lead.slice(0, n + 1))), beneath: swallow < 0 ? null : new RegExp(endsWith(lead).source.slice(0, -1) + "/", "i") };
    anchors.set(pattern, anchor);
  }
  return anchor;
}
// Does removing or moving `rel` (relative to the project root) take `pattern`'s files with it: is it one, inside one,
// or a directory that holds one? The project root itself is not counted (that is destroying the project, which the
// sandbox and the ask rules own). Removing or moving the anchor or a directory above it takes the protected files along
// and lets a forged directory be put in its place. A name that only starts like one (`.github`, `src/.gitx`) is not one.
function holds(rel, pattern) {
  const r = clean(rel);
  if (r === "" || r === "." || r.startsWith("..")) return false;
  const re = ci(pattern);
  if (re.test(r) || re.test(r + "/" + lastSegment(pattern))) return true;
  const anchor = anchorOf(pattern);
  if (anchor) return anchor.dirs.some((dir) => dir.test(r)) || (anchor.beneath !== null && anchor.beneath.test(r));
  const base = literalBase(pattern).toLowerCase(), rl = r.toLowerCase();
  return base !== "" && (base === rl || base.startsWith(rl + "/"));
}
export const heldNever = (rel) => SELF_NEVER.some((pattern) => holds(rel, pattern));
// Only the project-root names: a directory that merely might hold a nested copy of one is not what this guards.
export const heldScoped = (rel) => SELF_SCOPED.filter((name) => holds(rel, name));

// The git common dir of the repository `root` belongs to, as a real path; null when it cannot be told (not a repository, no git, no answer), so a caller
// that asks fails open to the verdicts it had before. Asked once per root: a guard process judges one. Git prints it relative to `root` for a main checkout and
// absolute for a linked worktree. A linked worktree of a submodule has no superproject to walk up to (git prints none for it) and `git worktree list` names the
// submodule's git dir as its main checkout, so the queue there is only found where git says the common dir is (ARCH-SAFETY-13).
const commonDirs = new Map();
export function gitCommonDir(root) {
  if (commonDirs.has(root)) return commonDirs.get(root);
  let dir = null;
  try {
    const out = execFileSync("git", ["-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (out) dir = fs.realpathSync(path.resolve(root, out)); // an empty answer would resolve to the root itself
  } catch { /* not a repository, or git is not there */ }
  commonDirs.set(root, dir);
  return dir;
}

// `abs` (a real path) spelled the way a session at the superproject would spell it, so the patterns above judge it: from the directory that holds the `.git` that
// holds the git dir `common` (a submodule's git dir is .git/modules/<name>, a plain repository's is .git itself; a git dir under no `.git` is named as if it
// were one). That `.git`, the store above the git dir and everything under it keep the names SELF_NEVER and heldNever hold. Null outside that `.git`;
// compared case-folded, as the patterns are.
export function commonRel(common, abs) {
  if (!common) return null;
  let dotGit = common;
  for (let dir = common, hops = 0; hops < 16 && dir !== path.dirname(dir); dir = path.dirname(dir), hops++) {
    if (path.basename(dir).toLowerCase() === ".git") { dotGit = dir; break; }
  }
  const root = dotGit.toLowerCase(), here = String(abs).toLowerCase();
  if (here !== root && !here.startsWith(root + path.sep)) return null;
  return (".git" + here.slice(root.length)).split(path.sep).join("/");
}
