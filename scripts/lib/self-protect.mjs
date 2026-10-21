// The one list of files only a unit run by /orchestrate or /auto may rewrite (ARCH-SAFETY-05).
// scope.mjs refuses to activate a manifest whose write list can reach one of them without such a
// run; pre-guard.mjs gives the exemption only to a scope that names one. Both import it from here.
import { globToRe } from "./core.mjs";

export const SELF_SCOPED = Object.freeze([
  "hooks/hooks.json",
  "craftsman.config.json",
  ".claude/settings.json",
  ".claude/settings.local.json",
]);

const clean = (entry) => String(entry).replaceAll("\\", "/").replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");

// Does one `scope.write` entry (a path, a directory or a glob) reach `name`?
function reaches(entry, name) {
  const e = clean(entry);
  if (e === "" || e === ".") return true; // the whole project
  // Over-matching only demands an /orchestrate run, so a bare filename counts as a hit too.
  if (e === name || e.endsWith("/" + name) || name.endsWith("/" + e)) return true;
  if (!/[*?{[]/.test(e)) return name.startsWith(e + "/"); // a directory that holds it
  return globToRe(e).test(name);
}

// craftsman.config.json keys that switch a guard off or loosen it; an edit that changes one needs a unit scope
// naming the file. Dotted names reach into a nested object. Every key here exists in the shipped config.
export const SAFETY_CONFIG_KEYS = Object.freeze([
  "enabled", "protectedPaths", "docWriteGuard", "execution.agentMode", "execution.engine", "stopGate",
]);

// Environment keys in the harness settings that decide whether node runs craftsman's hooks, or which code it loads.
export const SAFETY_ENV = /^(?:CRAFTSMAN|(?:NODE_OPTIONS|NODE_PATH|PATH|CLAUDE_PLUGIN_ROOT)$)/i;

const dig = (obj, dotted) => dotted.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), obj) ?? null;

// What an edit of a scoped file may not change: the safety keys of craftsman.config.json, or the harness settings
// that decide whether craftsman's hooks run at all (every hook, craftsman's plugin entry, the safety env).
export function safetyProjection(rel, doc) {
  if (!doc || typeof doc !== "object") return {};
  if (/(?:^|\/)\.claude\/settings(?:\.local)?\.json$/.test(rel)) {
    const pick = (obj, re) => Object.fromEntries(Object.entries(obj && typeof obj === "object" ? obj : {}).filter(([key]) => re.test(key)));
    return { disableAllHooks: doc.disableAllHooks ?? null, hooks: doc.hooks ?? null, plugins: pick(doc.enabledPlugins, /^craftsman(?:@|$)/i), env: pick(doc.env, SAFETY_ENV) };
  }
  return Object.fromEntries(SAFETY_CONFIG_KEYS.map((key) => [key, dig(doc, key)]));
}

// The self-scoped files any of `writeEntries` can reach, in list order.
export function namesSelfScoped(writeEntries) {
  const entries = Array.isArray(writeEntries) ? writeEntries : [];
  return SELF_SCOPED.filter((name) => entries.some((entry) => reaches(entry, name)));
}
