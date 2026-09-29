import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acceptanceNotice, currentState, reconcileAcceptance, transition } from "./tracker.mjs";

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

// The unit's own "am I done?" checkpoint: MERGED names what is still open.
test("tracker: MERGED is refused while the unit's own tagged acceptance criteria are unticked", () => {
  const selected = context();
  const acPath = path.join(selected.stateDir, "acceptance.md");
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(acPath, "- [ ] [unit:unit-1] the endpoint rejects bad input\n- [ ] [unit:unit-2] not this unit\n- [ ] whole-plan criterion\n");
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.throws(
    () => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123" }, selected),
    (error) => /MERGED refused/.test(error.message) && /rejects bad input/.test(error.message) && !/not this unit/.test(error.message),
  );
  fs.writeFileSync(acPath, fs.readFileSync(acPath, "utf8").replace("- [ ] [unit:unit-1]", "- [x] [unit:unit-1]"));
  assert.equal(transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123" }, selected).status, "MERGED");
});

test("tracker: criteria tagged with the unit's scope_id also gate MERGED; PARKED never does", () => {
  const selected = context();
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), "- [ ] [unit:S1] scoped criterion\n");
  transition({ plan: "docs/plans/example.md", unit: "unit-1", scope_id: "S1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc" }, selected), /scoped criterion/);
  assert.equal(transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PARKED", evidence: "gate failed twice" }, selected).status, "PARKED");
});

function status(selected, unit) {
  return currentState(selected).find((row) => row.unit === unit)?.status;
}
function startUnit(selected, unit, extra = {}) {
  transition({ plan: "docs/plans/example.md", unit, status: "PENDING", ...extra }, selected);
  transition({ plan: "docs/plans/example.md", unit, status: "IN_PROGRESS", evidence: "claimed" }, selected);
}

// The trigger: all criteria met → the tracker moves, without anyone asking.
test("tracker: reconcile moves a MERGED unit to COMPLETE once its criteria and the plan-wide ones are all ticked", () => {
  const selected = context();
  const acPath = path.join(selected.stateDir, "acceptance.md");
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(acPath, "- [x] [unit:unit-1] a\n- [x] [unit:unit-1] b\n- [ ] whole-plan check\n");
  startUnit(selected, "unit-1");
  const merged = transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123", session_id: "s1" }, selected);
  assert.equal(merged.acceptance.plan_wide_open, true);
  assert.equal(status(selected, "unit-1"), "MERGED", "an open whole-plan criterion means the request is not verified yet");

  fs.writeFileSync(acPath, fs.readFileSync(acPath, "utf8").replace("- [ ] whole-plan", "- [x] whole-plan"));
  fs.rmSync(path.join(selected.stateDir, "sessions"), { recursive: true, force: true });
  const result = reconcileAcceptance(selected, { session_id: "s1" });
  assert.deepEqual(result.completed, [{ plan: "docs/plans/example.md", unit: "unit-1" }]);
  const row = currentState(selected).find((r) => r.unit === "unit-1");
  assert.equal(row.status, "COMPLETE");
  assert.match(row.evidence, /all 2 acceptance criteria ticked; abc123/);
  assert.equal(fs.existsSync(path.join(selected.stateDir, "sessions", "s1", "compact-required")), false,
    "bookkeeping from a hook must never arm the compact gate");
  assert.match(acceptanceNotice(result), /MERGED → COMPLETE[\s\S]*TRACKER\.md/);
  assert.deepEqual(reconcileAcceptance(selected, {}).completed, [], "idempotent — COMPLETE is not re-completed");
});

test("tracker: ticking every criterion before the merge completes the unit the moment it lands on MERGED", () => {
  const selected = context();
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), "- [x] [unit:S9] scoped by scope_id\n");
  startUnit(selected, "unit-9", { scope_id: "S9" });
  const merged = transition({ plan: "docs/plans/example.md", unit: "unit-9", status: "MERGED", evidence: "def456" }, selected);
  assert.equal(merged.compact_required, true, "the real close-out still arms the compact gate");
  assert.deepEqual(merged.acceptance.completed.map((c) => c.unit), ["unit-9"]);
  assert.equal(status(selected, "unit-9"), "COMPLETE");
});

test("tracker: an IN_PROGRESS unit with every criterion ticked is reported ready to merge, not transitioned", () => {
  const selected = context();
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), "- [x] [unit:unit-2] done\n- [ ] [unit:unit-3] open\n");
  startUnit(selected, "unit-2");
  startUnit(selected, "unit-3");
  const result = reconcileAcceptance(selected, {});
  assert.deepEqual(result.ready, [{ plan: "docs/plans/example.md", unit: "unit-2" }]);
  assert.equal(status(selected, "unit-2"), "IN_PROGRESS");
  assert.match(acceptanceNotice(result), /unit-2[\s\S]*merge it now/);
  assert.doesNotMatch(acceptanceNotice(result), /unit-3/);
});
