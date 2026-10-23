import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { transition } from "./tracker.mjs";
import { buildDigest } from "./digest.mjs";

const fixtures = new Set();
function context() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-digest-"));
  fixtures.add(root);
  return { id: ".", root, stateDir: path.join(root, ".craftsman") };
}

afterEach(() => {
  for (const fixture of fixtures) fs.rmSync(fixture, { recursive: true, force: true });
  fixtures.clear();
});

test("digest: buckets rows into done, decisions, next, and per-plan percent", () => {
  const selected = context();
  transition({ plan: "docs/plans/a.md", unit: "unit-1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-1", status: "MERGED", evidence: "sha1" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-1", status: "COMPLETE", evidence: "shipped" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-2", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-2", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-2", status: "BLOCKED", evidence: "needs a call on auth provider" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-3", status: "PENDING" }, selected);

  const digest = buildDigest(selected);
  assert.equal(digest.done.length, 1);
  assert.equal(digest.done[0].unit, "unit-1");
  assert.equal(digest.decisions.length, 1);
  assert.equal(digest.decisions[0].unit, "unit-2");
  assert.equal(digest.next.length, 1);
  assert.equal(digest.next[0].unit, "unit-3");
  assert.deepEqual(digest.plans, [{ plan: "docs/plans/a.md", percent: 33, shippedNotConfirmed: 0, total: 3 }]);
});

test("digest: empty ledger yields empty buckets, not an error", () => {
  const selected = context();
  const digest = buildDigest(selected);
  assert.deepEqual(digest, { done: [], decisions: [], next: [], plans: [] });
});

test("digest: FEATURE_MERGED rows count with the open work, not as complete", () => {
  const selected = context();
  transition({ plan: "docs/plans/a.md", unit: "unit-1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  transition({ plan: "docs/plans/a.md", unit: "unit-1", status: "FEATURE_MERGED", evidence: "sha1" }, selected);

  const digest = buildDigest(selected);
  assert.deepEqual(digest.next.map((r) => r.unit), ["unit-1"]);
  assert.equal(digest.done.length, 0);
  assert.equal(digest.plans[0].percent, 0);
});

test("digest --html: writes dashboard and notes under the export root and prints the path", async () => {
  const { htmlOutput } = await import("./digest.mjs");
  const { exportRoot } = await import("./lib/export-notes.mjs");
  const selected = context();
  transition({ plan: "docs/plans/a.md", unit: "unit-1", status: "PENDING" }, selected);
  const out = htmlOutput(selected);
  assert.equal(out.length, 1);
  assert.equal(out[0], path.join(exportRoot(selected), "dashboard.html"));
  assert.ok(fs.existsSync(out[0]));
  assert.ok(fs.existsSync(path.join(exportRoot(selected), "notes")));
});

test("digest --html --publish: adds a final publish line", async () => {
  const { htmlOutput } = await import("./digest.mjs");
  const selected = context();
  const out = htmlOutput(selected, { publish: true });
  assert.equal(out.length, 2);
  assert.equal(out[1], `publish: ${out[0]}`);
});

test("digest --html: export.enabled false prints a one-line notice and writes nothing", async () => {
  const { htmlOutput } = await import("./digest.mjs");
  const { exportRoot } = await import("./lib/export-notes.mjs");
  const selected = context();
  fs.writeFileSync(path.join(selected.root, "craftsman.config.json"), JSON.stringify({ export: { enabled: false } }));
  const out = htmlOutput(selected, { publish: true });
  assert.equal(out.length, 1);
  assert.ok(!fs.existsSync(exportRoot(selected)));
});

test("digest.mjs has no network or Artifact call", () => {
  const src = fs.readFileSync(new URL("./digest.mjs", import.meta.url), "utf8");
  assert.ok(!/\bfetch\s*\(|node:(https?|net|tls|dgram)|child_process|\bhttps?:\/\/|Artifact/.test(src));
});
