// The one list of files only a unit run by /orchestrate or /auto may rewrite (ARCH-SAFETY-05).
// scope.mjs refuses to activate a manifest whose write list can reach one of them without such a
// run; pre-guard.mjs gives the exemption only to a scope that names one. Both import it from here.
import fs from "node:fs";
import path from "node:path";
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
  ".craftsman/off", ".craftsman/doc-write-pending", ".craftsman/sessions/**/doc-write", ".craftsman/sessions/**/commands.json", ".craftsman/sessions/**/goal-tokens.json",
  // The scope manifests: scope.mjs (a script, never a tool call) is their only writer, so a forged one cannot widen a unit.
  ".craftsman/sessions/**/scope*", ".craftsman/sessions/**/*worktree-binding*",
  // git's own config and hooks decide which hooks run (core.hooksPath, aliases): a tool call must not write them.
  "**/.git/config", "**/.git/config.worktree", "**/.git/hooks/**",
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
export const WRITER_VERBS = Object.freeze(["touch", "tee", "cp", "mv", "ln", "install", "dd", "truncate", "mkdir", "sed", "perl"]);

// A glob as free text: how a command line would spell it before any quote is removed. `**/` may be empty.
function globToText(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") { i++; re += "(?:\\S*/)?"; } else re += "\\S*";
    } else if (c === "*") re += "[\\w.-]*";
    else re += c.replace(/[.+?^${}()|[\]\\/]/g, "\\$&");
  }
  return re + "(?![\\w.-])";
}
// The raw-text gate: does a command line name a never-written path? Derived from SELF_NEVER, so it cannot drift.
export const NEVER_TEXT = new RegExp(SELF_NEVER.map(globToText).join("|"), "i");

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

const lastSegment = (glob) => glob.split("/").pop().replace(/\*+/g, "x");
const literalBase = (glob) => {
  const parts = [];
  for (const part of glob.split("/")) { if (/[*?[{]/.test(part)) break; parts.push(part); }
  return parts.join("/");
};
// Does removing or moving `rel` (relative to the project root) take `pattern`'s files with it: is it one, inside one,
// or a directory that holds one? The project root itself is not counted (that is destroying the project, which the
// sandbox and the ask rules own).
function holds(rel, pattern) {
  const r = clean(rel);
  if (r === "" || r === "." || r.startsWith("..")) return false;
  const re = ci(pattern);
  if (re.test(r) || re.test(r + "/" + lastSegment(pattern))) return true;
  const base = literalBase(pattern).toLowerCase(), rl = r.toLowerCase();
  return base !== "" && (base === rl || base.startsWith(rl + "/"));
}
export const heldNever = (rel) => SELF_NEVER.some((pattern) => holds(rel, pattern));
// Only the project-root names: a directory that merely might hold a nested copy of one is not what this guards.
export const heldScoped = (rel) => SELF_SCOPED.filter((name) => holds(rel, name));
