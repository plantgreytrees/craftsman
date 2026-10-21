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

// The self-scoped files any of `writeEntries` can reach, in list order.
export function namesSelfScoped(writeEntries) {
  const entries = Array.isArray(writeEntries) ? writeEntries : [];
  return SELF_SCOPED.filter((name) => entries.some((entry) => reaches(entry, name)));
}
