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
