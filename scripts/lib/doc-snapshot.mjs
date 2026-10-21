// The post-hoc check on guarded docs (ARCH-SAFETY-10). SessionStart snapshots the sha1 of every guarded doc; Stop snapshots again and reports guarded docs that changed WITHOUT the doc
// guard allowing it (an editor, a script, a tool the guard never sees). It reports; it does not replace
// the guard, and it never blocks.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { globToRe } from "./core.mjs";

const MAX_FILES = 2000;
const MAX_BYTES = 2 * 1024 * 1024;

function git(root, args) {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 }); }
  catch { return null; }
}

export function snapshotDocs(root, docPaths) {
  const snap = { ts: Date.now(), docs: {} };
  const listing = git(root, ["ls-files", "--cached", "--others", "--exclude-standard"]);
  if (listing === null) return snap;
  const guarded = (rel) => docPaths.some((p) => globToRe(p).test(rel) || globToRe(p).test("./" + rel));
  for (const rel of [...new Set(listing.split("\n").filter(Boolean))].filter(guarded).slice(0, MAX_FILES)) {
    try {
      const file = path.join(root, rel);
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size <= MAX_BYTES) snap.docs[rel] = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
    } catch { /* deleted or unreadable: absent from the snapshot */ }
  }
  return snap;
}

export function docDrift(before, after) {
  if (!before?.docs || !after?.docs) return [];
  const out = [];
  for (const rel of new Set([...Object.keys(before.docs), ...Object.keys(after.docs)])) {
    if (!(rel in after.docs)) out.push({ path: rel, change: "removed" });
    else if (!(rel in before.docs)) out.push({ path: rel, change: "added" });
    else if (before.docs[rel] !== after.docs[rel]) out.push({ path: rel, change: "modified" });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// tracker.mjs renders TRACKER.md itself, and an edit the guard logged as allowed was seen. A Read, Grep
// or Glob the guard allowed changed nothing, so it never explains a change.
const EDIT_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);
export function unseenDocChanges(drift, events, sid) {
  const seen = new Set(events.filter((e) => e && e.ev === "preguard" && e.result === "allowed" && e.sid === sid && EDIT_TOOLS.has(e.tool)).map((e) => e.file));
  return drift.filter((d) => d.path !== "docs/plans/TRACKER.md" && !seen.has(d.path));
}

export function formatDocDrift(list) {
  return list.length
    ? `craftsman: guarded docs changed this session without passing the doc guard (informational):\n${list.map((d) => `  - ${d.path} (${d.change})`).join("\n")}`
    : "";
}
