// The session change list and the `{changed}` / `{changedDirs}` command placeholders (ARCH-STATE-21).
//
// quality-gate appends the root-relative POSIX path of every edited source file to sessions/<sid>/changed, beside the
// `dirty` marker. Stop and the pre-merge gate read it back and expand it into the argv of a configured command. Commands
// run with no shell, so a placeholder is only ever a whole argv token: nothing is quoted, joined or word-split.
import fs from "node:fs";
import path from "node:path";
import { splitCmd, PROJECT_ROOT } from "./core.mjs";

const FILE = "changed";
const WHOLE = new Set(["{changed}", "{changedDirs}"]);
const isWhole = (tok) => WHOLE.has(tok);
const isEmbedded = (tok) => !isWhole(tok) && [...WHOLE].some((p) => tok.includes(p));

/** Append `relPath` (POSIX, relative to the project root) as one line of the session's change list. False, and nothing
 * written, for a path that cannot be held on one line. Throws on a filesystem error: the caller decides it is best-effort. */
export function recordChanged(sessionDir, relPath) {
  if (typeof relPath !== "string" || !relPath || /[\r\n]/.test(relPath)) return false;
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.appendFileSync(path.join(sessionDir, FILE), relPath + "\n");
  return true;
}

/** The session's changed paths, deduped, in first-seen order. `null` is "unknown" (no list, or one that cannot be read);
 * `[]` is a list with nothing in it. The two never mean the same thing. */
export function readChanged(sessionDir) {
  let text;
  try { text = fs.readFileSync(path.join(sessionDir, FILE), "utf8"); } catch { return null; }
  return [...new Set(text.split("\n").filter((line) => line !== ""))];
}

/** True when some token of the command is exactly `{changed}` or `{changedDirs}`. */
export function hasChangePlaceholder(cmd) {
  return typeof cmd === "string" && splitCmd(cmd).some(isWhole);
}

/** True when `{changed}` or `{changedDirs}` appears inside a longer token (`--files={changed}`), which is never expanded. */
export function embeddedChangePlaceholder(cmd) {
  return typeof cmd === "string" && splitCmd(cmd).some(isEmbedded);
}

/** Expand the command into argv for `files` (root-relative POSIX paths from readChanged): a whole `{changed}` token becomes
 * one entry per file and `{changedDirs}` the sorted unique directories, both POSIX and relative to `cwd` (default: `root`).
 * `{ skip }` is an empty ("no-changes") or unknown ("changes-unknown", files is not an array) set; `{ warn }` is an
 * embedded placeholder, which stays literal and means the command must not run. A command with no placeholder is only split. */
export function expandChangePlaceholders(cmd, files, { cwd, root } = {}) {
  const tokens = splitCmd(String(cmd));
  if (tokens.some(isEmbedded)) return { warn: "embedded-placeholder" };
  if (!tokens.some(isWhole)) return { argv: tokens };
  if (!Array.isArray(files)) return { skip: "changes-unknown" };
  if (!files.length) return { skip: "no-changes" };
  const base = root || PROJECT_ROOT;
  const from = cwd || base;
  const rels = files.map((f) => path.relative(from, path.resolve(base, f)).split(path.sep).join("/") || ".");
  const dirs = [...new Set(rels.map((r) => path.posix.dirname(r)))].sort();
  return { argv: tokens.flatMap((tok) => (tok === "{changed}" ? rels : tok === "{changedDirs}" ? dirs : [tok])) };
}
