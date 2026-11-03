// Tests for scripts/lib/export-notes.mjs (ARCH-VIEWS-11..14).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  exportRoot, notesRoot, inboxRoot, buildNotes, writeNotes, clearNotes, takeInboxNote,
  planStatusRollup, INBOX_MAX_BYTES, verifiedExportDir, atomicWrite, writeExportFile, sweepStaleTemps,
} from "./lib/export-notes.mjs";
import { parseFrontmatter } from "./lib/plan-index.mjs";

const SECRET_BODY = "SECRET-BODY-TEXT-NEVER-EXPORTED";
const mk = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "export-notes-")));
const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

function fixture() {
  const root = mk();
  put(root, "docs/plans/alpha.md", `---\nslug: alpha\ngoal: Ship alpha\npriority: P1\n---\n# Alpha\n${SECRET_BODY}\n`);
  put(root, "docs/ideas/idea-one.md", `---\nslug: idea-one\nstatus: architected\nverdict: pursue\nconfidence: medium\nupdated: 2026-10-01\n---\n${SECRET_BODY}\n`);
  put(root, "docs/architecture/views.rules.md", `---\narea: views\ngoverns: ["a.mjs", "b.mjs"]\nsource: docs/ideas/idea-one.md\n---\n# ARCH views\n\n- **ARCH-VIEWS-01** [decided] ${SECRET_BODY}\n- **ARCH-VIEWS-02** [superseded by ARCH-VIEWS-01] x\n`);
  put(root, "docs/plans/TRACKER-archive.md", `# Tracker archive\n\n## docs/plans/old-plan.md (2026-10-09) — Old goal · doc abc123 · landed def456 · archive 999aaa\n\n- row ${SECRET_BODY}\n`);
  const rows = [
    { plan: "docs/plans/alpha.md", unit: "u1", status: "COMPLETE", updated_at: "2026-10-02T00:00:00Z" },
    { plan: "docs/plans/alpha.md", unit: "u2", status: "IN_PROGRESS", updated_at: "2026-10-03T00:00:00Z" },
  ];
  return { root, context: { root, rows } };
}
const keys = (text) => Object.keys(parseFrontmatter(text));

test("exportRoot: a linked worktree resolves to the main checkout (8.1)", () => {
  const main = mk();
  const g = (...a) => execFileSync("git", ["-C", main, ...a], { stdio: "ignore" });
  g("init", "-q", "-b", "main"); g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "i");
  const wt = path.join(main, "wt");
  g("worktree", "add", "-q", "-b", "side", wt);
  assert.equal(exportRoot({ root: fs.realpathSync(wt) }), path.join(main, ".craftsman", "export"));
  assert.equal(exportRoot({ root: main }), path.join(main, ".craftsman", "export"));
});

test("planStatusRollup: the documented order", () => {
  const r = (...s) => planStatusRollup(s.map((status) => ({ status })));
  assert.equal(r(), "UNTRACKED");
  assert.equal(r("COMPLETE", "COMPLETE"), "COMPLETE");
  assert.equal(r("COMPLETE", "PARKED", "BLOCKED"), "BLOCKED");
  assert.equal(r("COMPLETE", "PARKED"), "PARKED");
  assert.equal(r("MERGED", "MERGED"), "MERGED");
  assert.equal(r("PENDING", "PENDING"), "PENDING");
  assert.equal(r("PENDING", "MERGED"), "IN_PROGRESS");
  assert.equal(r("COMPLETE", "IN_PROGRESS"), "IN_PROGRESS");
});

test("buildNotes: key set per type, generated marker, no document body (8.2)", () => {
  const { context } = fixture();
  const notes = buildNotes(context);
  const sets = {
    "plans/alpha.md": ["type", "slug", "status", "progress", "priority", "parent", "goal", "updated", "source", "generated"],
    "ideas/idea-one.md": ["type", "slug", "verdict", "status", "confidence", "updated", "source", "generated"],
    "areas/views.md": ["type", "slug", "rules", "superseded", "governs", "from_idea", "source", "generated"],
    "archive/old-plan.md": ["type", "slug", "goal", "doc_sha", "archive_sha", "generated"],
  };
  for (const [rel, expected] of Object.entries(sets)) {
    assert.ok(notes.has(rel), rel);
    assert.deepEqual(keys(notes.get(rel)), expected, rel);
  }
  const plan = parseFrontmatter(notes.get("plans/alpha.md"));
  assert.equal(plan.status, "IN_PROGRESS");
  assert.equal(plan.progress, "1/2");
  assert.equal(plan.priority, "P1");
  assert.equal(plan.source, "docs/plans/alpha.md");
  assert.equal(String(plan.generated), "true");
  const area = parseFrontmatter(notes.get("areas/views.md"));
  assert.equal(String(area.rules), "2"); assert.equal(String(area.superseded), "1");
  const arch = parseFrontmatter(notes.get("archive/old-plan.md"));
  assert.equal(arch.archive_sha, "999aaa"); assert.equal(arch.doc_sha, "abc123");
  for (const text of notes.values()) assert.ok(!text.includes(SECRET_BODY));
  // body: one goal line plus the source path
  assert.match(notes.get("plans/alpha.md"), /---\nShip alpha\n\ndocs\/plans\/alpha\.md\n$/);
});

test("writeNotes: writes, updates, removes stale generated notes, replaces a retired plan (8.3)", () => {
  const { root, context } = fixture();
  const first = writeNotes(context);
  assert.ok(first.written.includes("plans/alpha.md"));
  const notes = notesRoot(context);
  assert.ok(fs.existsSync(path.join(notes, "plans/alpha.md")));
  // retire alpha: its note goes, an archived-plan note appears
  fs.rmSync(path.join(root, "docs/plans/alpha.md"));
  put(root, "docs/plans/TRACKER-archive.md", fs.readFileSync(path.join(root, "docs/plans/TRACKER-archive.md"), "utf8")
    + "\n## docs/plans/alpha.md (2026-10-10) — Ship alpha · doc 111 · landed 222\n");
  const second = writeNotes(context);
  assert.deepEqual(second.removed, ["plans/alpha.md"]);
  assert.ok(fs.existsSync(path.join(notes, "archive/alpha.md")));
  assert.ok(!fs.existsSync(path.join(notes, "plans/alpha.md")));
  // idempotent
  assert.deepEqual(writeNotes(context), { written: [], removed: [], skipped: [] });
});

test("writeNotes: a foreign (unmarked) file is never removed or overwritten", () => {
  const { context } = fixture();
  const notes = notesRoot(context);
  fs.mkdirSync(path.join(notes, "plans"), { recursive: true });
  fs.writeFileSync(path.join(notes, "mine.md"), "---\ntitle: hand written\n---\nkeep\n");
  fs.writeFileSync(path.join(notes, "plans/alpha.md"), "---\ntitle: hand written\n---\nkeep\n");
  fs.writeFileSync(path.join(notes, "mine.txt"), "x");
  fs.writeFileSync(path.join(notes, "falsemark.md"), "---\ngenerated: false\n---\nkeep\n");
  const res = writeNotes(context);
  assert.ok(res.skipped.includes("plans/alpha.md"));
  assert.equal(fs.readFileSync(path.join(notes, "mine.md"), "utf8"), "---\ntitle: hand written\n---\nkeep\n");
  assert.equal(fs.readFileSync(path.join(notes, "plans/alpha.md"), "utf8"), "---\ntitle: hand written\n---\nkeep\n");
  assert.ok(fs.existsSync(path.join(notes, "mine.txt")));
  assert.ok(fs.existsSync(path.join(notes, "falsemark.md")));
});

test("writeNotes: inbox/ is untouched across regenerations and nothing is written outside the export tree", () => {
  const { root, context } = fixture();
  const inbox = inboxRoot(context);
  fs.mkdirSync(path.join(inbox, "done"), { recursive: true });
  fs.writeFileSync(path.join(inbox, "pitch.md"), "---\ngenerated: true\n---\nuser note\n"); // even a marked file in inbox stays
  const snap = (dir) => {
    const out = {};
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[path.relative(dir, f)] = [fs.readFileSync(f, "utf8"), fs.statSync(f).mtimeMs]; } };
    walk(dir); return out;
  };
  const before = snap(inbox);
  writeNotes(context); fs.rmSync(path.join(root, "docs/ideas/idea-one.md")); writeNotes(context); clearNotes(context);
  assert.deepEqual(snap(inbox), before);
  // outside the export tree only docs/ and .craftsman/export exist
  assert.deepEqual(fs.readdirSync(root).sort(), [".craftsman", "docs"]);
  assert.deepEqual(fs.readdirSync(path.join(root, ".craftsman")), ["export"]);
});

test("writeNotes: refuses a symlinked notes root", () => {
  const { context } = fixture();
  const outside = mk();
  fs.mkdirSync(exportRoot(context), { recursive: true });
  fs.symlinkSync(outside, notesRoot(context));
  assert.throws(() => writeNotes(context), /symlinked notes root/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("writeNotes: a symlinked notes subdirectory is never followed", () => {
  const { context } = fixture();
  const outside = mk();
  fs.mkdirSync(notesRoot(context), { recursive: true });
  fs.symlinkSync(outside, path.join(notesRoot(context), "plans"));
  fs.symlinkSync(outside, path.join(notesRoot(context), "ideas"));
  const res = writeNotes(context);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.ok(res.skipped.includes("plans/alpha.md") && res.skipped.includes("ideas/idea-one.md"));
  // a generated file already outside is neither rewritten nor removed
  fs.writeFileSync(path.join(outside, "stale.md"), "---\ngenerated: true\n---\nx\n");
  writeNotes(context); clearNotes(context);
  assert.deepEqual(fs.readdirSync(outside), ["stale.md"]);
});

test("README.md is written into the notes root and removable by the generator (8.5)", () => {
  const { context } = fixture();
  writeNotes(context);
  const readme = path.join(notesRoot(context), "README.md");
  assert.ok(fs.existsSync(readme));
  assert.match(fs.readFileSync(readme, "utf8"), /generated/);
  assert.ok(clearNotes(context).includes("README.md"));
  assert.ok(!fs.existsSync(readme));
});

function inboxFixture() {
  const { context } = fixture();
  const inbox = inboxRoot(context);
  fs.mkdirSync(inbox, { recursive: true });
  return { context, inbox };
}

test("takeInboxNote: returns untrusted text and moves only after confirm (8.4)", () => {
  const { context, inbox } = inboxFixture();
  fs.writeFileSync(path.join(inbox, "pitch.md"), "an idea");
  const t = takeInboxNote(context, "pitch.md");
  assert.equal(t.text, "an idea"); assert.equal(t.untrusted, true);
  assert.ok(fs.existsSync(path.join(inbox, "pitch.md")));
  assert.ok(!fs.existsSync(path.join(inbox, "done")));
  const dest = t.confirm();
  assert.equal(dest, path.join(fs.realpathSync(inbox), "done", "pitch.md"));
  assert.ok(!fs.existsSync(path.join(inbox, "pitch.md")));
  assert.equal(fs.readFileSync(dest, "utf8"), "an idea");
  assert.equal(t.confirm(), dest);
  // a same-named note later does not overwrite the done copy
  fs.writeFileSync(path.join(inbox, "pitch.md"), "again");
  const d2 = takeInboxNote(context, "pitch.md").confirm();
  assert.notEqual(d2, dest); assert.equal(fs.readFileSync(dest, "utf8"), "an idea");
  assert.throws(() => takeInboxNote(context, "done/pitch.md"), /already done/);
});

test("takeInboxNote: refuses traversal, absolute paths and a missing inbox", () => {
  const { context, inbox } = inboxFixture();
  fs.writeFileSync(path.join(path.dirname(inbox), "secret.md"), "s");
  assert.throws(() => takeInboxNote(context, "../secret.md"), /escapes inbox/);
  assert.throws(() => takeInboxNote(context, path.join(path.dirname(inbox), "secret.md")), /escapes inbox/);
  assert.throws(() => takeInboxNote(context, "nope.md"), /not found/);
  assert.throws(() => takeInboxNote({ root: mk() }, "x.md"), /no inbox/);
  assert.ok(fs.existsSync(path.join(path.dirname(inbox), "secret.md")));
});

test("takeInboxNote: refuses a symlink that escapes inbox/ (file and directory)", () => {
  const { context, inbox } = inboxFixture();
  const outside = mk();
  fs.writeFileSync(path.join(outside, "target.md"), "outside");
  fs.symlinkSync(path.join(outside, "target.md"), path.join(inbox, "link.md"));
  fs.symlinkSync(outside, path.join(inbox, "dir"));
  assert.throws(() => takeInboxNote(context, "link.md"), /escapes inbox/);
  assert.throws(() => takeInboxNote(context, "dir/target.md"), /escapes inbox/);
  assert.equal(fs.readFileSync(path.join(outside, "target.md"), "utf8"), "outside");
});

test("takeInboxNote: refuses a note over 20 KB, accepts exactly 20 KB; refuses a symlinked done/", () => {
  const { context, inbox } = inboxFixture();
  fs.writeFileSync(path.join(inbox, "big.md"), "x".repeat(INBOX_MAX_BYTES + 1));
  assert.throws(() => takeInboxNote(context, "big.md"), /exceeds/);
  fs.writeFileSync(path.join(inbox, "ok.md"), "x".repeat(INBOX_MAX_BYTES));
  const t = takeInboxNote(context, "ok.md");
  assert.equal(t.text.length, INBOX_MAX_BYTES);
  const outside = mk();
  fs.symlinkSync(outside, path.join(inbox, "done"));
  assert.throws(() => t.confirm(), /escapes inbox/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.ok(fs.existsSync(path.join(inbox, "ok.md")));
});

test("write safety: a symlinked export/, .craftsman or target file is refused (ARCH-VIEWS-11)", () => {
  const out = mk();
  const a = mk(); fs.mkdirSync(path.join(a, ".craftsman")); fs.symlinkSync(out, path.join(a, ".craftsman", "export"));
  assert.throws(() => verifiedExportDir({ root: a }), /refusing export/);
  assert.throws(() => writeNotes({ root: a, rows: [] }), /refusing export/);
  const b = mk(); fs.symlinkSync(out, path.join(b, ".craftsman"));
  assert.throws(() => verifiedExportDir({ root: b }), /refusing export/);
  assert.deepEqual(fs.readdirSync(out), []);
  const c = mk(); const dir = verifiedExportDir({ root: c });
  const victim = path.join(out, "victim"); fs.writeFileSync(victim, "keep");
  fs.symlinkSync(victim, path.join(dir, "dashboard.html"));
  assert.throws(() => writeExportFile({ root: c }, "dashboard.html", "x"), /not a regular file/);
  assert.equal(fs.readFileSync(victim, "utf8"), "keep");
});

test("write safety: atomicWrite renames a temp file, leaves the old file on failure and no temp behind", () => {
  const d = mk(); const f = path.join(d, "f.txt");
  atomicWrite(f, "one"); atomicWrite(f, "two");
  assert.equal(fs.readFileSync(f, "utf8"), "two");
  assert.deepEqual(fs.readdirSync(d), ["f.txt"]);
  const g = path.join(d, "dir"); fs.mkdirSync(g);
  assert.throws(() => atomicWrite(g, "x"));
  const orig = fs.renameSync;
  fs.renameSync = () => { throw new Error("killed"); };
  try { assert.throws(() => atomicWrite(f, "three"), /killed/); } finally { fs.renameSync = orig; }
  assert.equal(fs.readFileSync(f, "utf8"), "two");
  assert.deepEqual(fs.readdirSync(d).sort(), ["dir", "f.txt"]);
});

test("clearNotes: unlinks nothing through a symlinked .craftsman or .craftsman/export (ARCH-VIEWS-11)", () => {
  for (const linkAt of [".craftsman", ".craftsman/export"]) {
    const { root, context } = fixture();
    const outside = mk();
    const victim = path.join(outside, "notes", "x.md");
    put(outside, "notes/x.md", "---\ngenerated: true\n---\nx\n");
    if (linkAt === ".craftsman") fs.symlinkSync(outside, path.join(root, ".craftsman"));
    else { fs.mkdirSync(path.join(root, ".craftsman")); fs.symlinkSync(outside, path.join(root, ".craftsman/export")); }
    assert.deepEqual(clearNotes(context), []);
    assert.ok(fs.existsSync(victim), linkAt);
  }
});

test("writeExportFile: sweeps a stale temp file, keeps a fresh one from a live pid (2.3)", () => {
  const { context } = fixture();
  const dir = verifiedExportDir(context);
  const stale = path.join(dir, `.dashboard.html.${2 ** 22 + 12345}.1.tmp`);
  const fresh = path.join(dir, `.dashboard.html.${process.pid}.${Date.now() - 5000}.tmp`);
  fs.writeFileSync(stale, "s"); fs.writeFileSync(fresh, "f");
  const old = new Date(Date.now() - 2 * 60 * 1000);
  fs.utimesSync(stale, old, old); // a dead writer's file is deleted once it is older than the minimum age
  writeExportFile(context, "dashboard.html", "<html>");
  assert.ok(!fs.existsSync(stale));
  assert.ok(fs.existsSync(fresh));
  assert.ok(fs.existsSync(path.join(dir, "dashboard.html")));
});

test("sweepStaleTemps: a dead pid's file is kept until it has a minimum age; a live pid's file goes only after ten minutes", () => {
  const { context } = fixture();
  const dir = verifiedExportDir(context);
  const at = (name, ageMs) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, "x");
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(file, t, t);
    return file;
  };
  const dead = 2 ** 22 + 54321;
  const deadYoung = at(`.a.html.${dead}.1.tmp`, 5 * 1000);
  const deadOld = at(`.b.html.${dead}.2.tmp`, 2 * 60 * 1000);
  const liveYoung = at(`.c.html.${process.pid}.3.tmp`, 2 * 60 * 1000);
  const liveOld = at(`.d.html.${process.pid}.4.tmp`, 11 * 60 * 1000);
  const removed = sweepStaleTemps(dir).sort();
  assert.deepEqual(removed, [path.basename(deadOld), path.basename(liveOld)].sort());
  assert.ok(fs.existsSync(deadYoung), "a dead pid does not condemn a just-written file");
  assert.ok(fs.existsSync(liveYoung), "a live pid's file under ten minutes stays");
  assert.ok(!fs.existsSync(deadOld));
  assert.ok(!fs.existsSync(liveOld), "a live pid's file past ten minutes goes");
});
