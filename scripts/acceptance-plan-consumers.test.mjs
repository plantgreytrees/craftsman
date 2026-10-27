import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { currentState, reconcileAcceptance, transition } from "./tracker.mjs";
import { featureGate } from "./repo-exec.mjs";

const fixtures = new Set();
afterEach(() => { for (const f of fixtures) fs.rmSync(f, { recursive: true, force: true }); fixtures.clear(); });

function setup(acceptance, plans = ["a", "b"]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-acc-consumers-"));
  fixtures.add(root);
  const ctx = { id: ".", root, stateDir: path.join(root, ".craftsman") };
  fs.mkdirSync(ctx.stateDir, { recursive: true });
  const acPath = path.join(ctx.stateDir, "acceptance.md");
  fs.writeFileSync(acPath, "- [ ] [unit:a1] a unit\n- [x] [unit:b1] b unit\n" + acceptance);
  for (const [plan, unit] of [["a", "a1"], ["b", "b1"]].filter(([p]) => plans.includes(p))) {
    transition({ plan: `docs/plans/${plan}.md`, unit, status: "PENDING" }, ctx);
    transition({ plan: `docs/plans/${plan}.md`, unit, status: "IN_PROGRESS", evidence: "claimed" }, ctx);
  }
  fs.writeFileSync(acPath, "- [ ] [unit:a1] a unit\n- [x] [unit:b1] b unit\n" + acceptance);
  transition({ plan: "docs/plans/b.md", unit: "b1", status: "MERGED", evidence: "abc" }, ctx);
  return ctx;
}
const statusOf = (ctx, unit) => currentState(ctx).find((r) => r.unit === unit).status;

test("A: plan a's open untagged or [plan:a] line does not hold plan b's MERGED row", () => {
  for (const line of ["- [ ] legacy of a\n", "- [ ] [plan:a] whole a\n"]) {
    const ctx = setup(line);
    reconcileAcceptance(ctx, {});
    assert.equal(statusOf(ctx, "b1"), "COMPLETE", line);
  }
});

test("A: ledger naming only plan b is not held by an open untagged line", () => {
  const ctx = setup("- [ ] legacy\n", ["b"]);
  assert.deepEqual([...new Set(currentState(ctx).map((r) => r.plan))], ["docs/plans/b.md"]);
  reconcileAcceptance(ctx, {});
  assert.equal(statusOf(ctx, "b1"), "COMPLETE");
});

test("A: an open [plan:b] line holds plan b's row", () => {
  const ctx = setup("- [ ] [plan:b] whole b\n");
  reconcileAcceptance(ctx, {});
  assert.equal(statusOf(ctx, "b1"), "MERGED");
});

test("B: land-feature gate for plan b ignores [plan:a] lines, keeps b's and legacy", () => {
  const text = "- [ ] [plan:a] a whole\n- [ ] [plan:b] b whole\n- [ ] legacy\n";
  const last = { last: true };
  assert.deepEqual(featureGate(text, "b", "f1", last).openCriteria.map((c) => c.line), ["- [ ] [plan:b] b whole", "- [ ] legacy"]);
  assert.equal(featureGate("- [ ] [plan:a] a whole\n", "b", "f1", { error: "x" }).unresolvedOpen.length, 0);
  assert.equal(featureGate("- [ ] [plan:b] b\n", "b", "f1", { error: "x" }).unresolvedOpen.length, 1);
  assert.equal(featureGate("- [ ] legacy\n", "b", "f1", { error: "x" }).unresolvedOpen.length, 1);
});
