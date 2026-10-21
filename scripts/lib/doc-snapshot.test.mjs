// ARCH-SAFETY-10: a post-hoc check on the guarded docs. The snapshot is taken at SessionStart, the drift
// is read at Stop, and only changes the doc guard did not allow are reported.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as ds from "./doc-snapshot.mjs";

const DOC_PATHS = ["docs/plans/**", "docs/ideas/**", "docs/architecture/**"];
function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-docsnap-")));
  const g = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q", "-b", "main"); g("config", "user.email", "t@e"); g("config", "user.name", "t");
  for (const [rel, body] of [["docs/plans/a.md", "# a\n"], ["docs/ideas/i.md", "# i\n"], ["docs/architecture/x.rules.md", "# x\n"], ["src/app.js", "1\n"]]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  g("add", "-A"); g("commit", "-q", "-m", "init");
  return dir;
}

test("snapshotDocs: the sha1 of every guarded doc (tracked or not), none of the code, plus the working-tree status", () => {
  const dir = repo();
  try {
    fs.writeFileSync(path.join(dir, "docs", "plans", "new.md"), "# new\n");
    const snap = ds.snapshotDocs(dir, DOC_PATHS);
    assert.deepEqual(Object.keys(snap.docs).sort(), ["docs/architecture/x.rules.md", "docs/ideas/i.md", "docs/plans/a.md", "docs/plans/new.md"]);
    assert.match(snap.docs["docs/plans/a.md"], /^[0-9a-f]{40}$/);
    assert.equal(typeof snap.ts, "number");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("snapshotDocs: craftsman's own state is not part of the status; not a repo gives an empty snapshot", () => {
  const dir = repo();
  try {
    fs.mkdirSync(path.join(dir, ".craftsman"));
    fs.writeFileSync(path.join(dir, ".craftsman", "events.jsonl"), "{}");
    assert.equal(Object.keys(ds.snapshotDocs(dir, DOC_PATHS).docs).some((rel) => rel.startsWith(".craftsman")), false);
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-docsnap-bare-"));
    assert.deepEqual(ds.snapshotDocs(bare, DOC_PATHS).docs, {});
    fs.rmSync(bare, { recursive: true, force: true });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("docDrift: modified, added and removed guarded docs; an untouched tree has none", () => {
  const dir = repo();
  try {
    const before = ds.snapshotDocs(dir, DOC_PATHS);
    assert.deepEqual(ds.docDrift(before, ds.snapshotDocs(dir, DOC_PATHS)), []);
    fs.writeFileSync(path.join(dir, "docs", "plans", "a.md"), "# a changed\n");
    fs.writeFileSync(path.join(dir, "docs", "plans", "b.md"), "# b\n");
    fs.rmSync(path.join(dir, "docs", "ideas", "i.md"));
    fs.writeFileSync(path.join(dir, "src", "app.js"), "2\n");
    assert.deepEqual(ds.docDrift(before, ds.snapshotDocs(dir, DOC_PATHS)), [
      { path: "docs/ideas/i.md", change: "removed" }, { path: "docs/plans/a.md", change: "modified" }, { path: "docs/plans/b.md", change: "added" },
    ]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("docDrift: no snapshot, or one from a repo with no docs, reports nothing", () => {
  assert.deepEqual(ds.docDrift(null, { docs: { "docs/plans/a.md": "x" } }), []);
  assert.deepEqual(ds.docDrift({ docs: {} }, { docs: {} }), []);
});

test("unseenDocChanges: drops what the doc guard allowed this session and the generated tracker", () => {
  const drift = [{ path: "docs/plans/a.md", change: "modified" }, { path: "docs/plans/TRACKER.md", change: "modified" }, { path: "docs/ideas/i.md", change: "removed" }];
  const events = [
    { ev: "preguard", sid: "s1", tool: "Write", file: "docs/plans/a.md", result: "allowed" },
    { ev: "preguard", sid: "s2", tool: "Write", file: "docs/ideas/i.md", result: "allowed" },
    { ev: "preguard", sid: "s1", tool: "Write", file: "docs/ideas/i.md", result: "blocked" },
  ];
  assert.deepEqual(ds.unseenDocChanges(drift, events, "s1"), [{ path: "docs/ideas/i.md", change: "removed" }]);
});

test("formatDocDrift: a one-line-per-doc informational report, empty when there is nothing", () => {
  assert.equal(ds.formatDocDrift([]), "");
  const text = ds.formatDocDrift([{ path: "docs/plans/a.md", change: "modified" }]);
  assert.match(text, /^craftsman: guarded docs changed this session without passing the doc guard \(informational\):\n  - docs\/plans\/a\.md \(modified\)$/);
});

test("unseenDocChanges: only an edit tool counts as seen; a doc that was merely read, or an old event without a tool, does not", () => {
  const drift = [{ path: "docs/plans/a.md", change: "modified" }];
  const event = (tool) => ({ ev: "preguard", sid: "s1", ...(tool ? { tool } : {}), file: "docs/plans/a.md", result: "allowed" });
  for (const tool of ["Read", "Grep", "Glob", undefined]) assert.deepEqual(ds.unseenDocChanges(drift, [event(tool)], "s1"), drift, `${tool}`);
  for (const tool of ["Write", "Edit", "NotebookEdit"]) assert.deepEqual(ds.unseenDocChanges(drift, [event(tool)], "s1"), [], tool);
});

test("snapshotDocs: the snapshot holds the docs and a timestamp, nothing that docDrift never reads", () => {
  const dir = repo();
  try {
    assert.deepEqual(Object.keys(ds.snapshotDocs(dir, DOC_PATHS)).sort(), ["docs", "ts"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
