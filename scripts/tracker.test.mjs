import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { currentState, transition } from "./tracker.mjs";

const fixtures = new Set();
function context() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-tracker-"));
  fixtures.add(root);
  return { id: ".", root, stateDir: path.join(root, ".craftsman") };
}

afterEach(() => {
  for (const fixture of fixtures) fs.rmSync(fixture, { recursive: true, force: true });
  fixtures.clear();
});

test("tracker: records identity and replays the current row state", () => {
  const selected = context();
  transition({ plan: "docs/plans/example.md", unit: "unit-1", goal: "Ship the example", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  const [row] = currentState(selected);
  assert.equal(row.status, "IN_PROGRESS");
  assert.equal(row.goal, "Ship the example");
  assert.equal(row.plan, "docs/plans/example.md");
});

test("tracker: rejects illegal transitions and terminal states without evidence", () => {
  const selected = context();
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "COMPLETE" }, selected), /illegal tracker transition/);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED" }, selected), /requires evidence/);
});

test("tracker: terminal evidence is retained as the latest concise proof", () => {
  const selected = context();
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123; tests pass" }, selected);
  assert.equal(currentState(selected)[0].evidence, "abc123; tests pass");
});
