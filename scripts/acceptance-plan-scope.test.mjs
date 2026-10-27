import test from "node:test";
import assert from "node:assert/strict";
import { acceptanceCriteria, featureCriteria, bindingAcceptance } from "./lib/core.mjs";

test("tags parse in any order and plan is normalised", () => {
  const t = [
    "- [ ] [plan:a] [unit:u] x",
    "- [ ] [unit:u] [plan:a] x",
    "- [x] [feature:f] [plan:docs/plans/a.md] [unit:u] y",
    "- [ ] [unit:u] only",
    "- [ ] bare",
  ].join("\n");
  const c = acceptanceCriteria(t);
  assert.deepEqual([c[0].unit, c[0].plan, c[0].feature], ["u", "a", null]);
  assert.deepEqual([c[1].unit, c[1].plan], ["u", "a"]);
  assert.deepEqual([c[2].unit, c[2].plan, c[2].feature, c[2].done], ["u", "a", "f", true]);
  assert.deepEqual([c[3].unit, c[3].plan], ["u", null]);
  assert.deepEqual([c[4].unit, c[4].plan, c[4].feature], [null, null, null]);
});

test("featureCriteria never matches another plan's [plan:] line", () => {
  const t = "- [ ] [plan:other] x\n- [ ] [plan:mine] y\n- [ ] legacy z\n- [ ] [feature:f1] w";
  assert.deepEqual(featureCriteria(t, "f2", true, "mine").map((c) => c.line),
    ["- [ ] [plan:mine] y", "- [ ] legacy z"]);
  assert.equal(featureCriteria(t, "f2", true).length, 3);
  assert.equal(featureCriteria(t, "f1", false, "mine").length, 1);
});

test("bindingAcceptance table", () => {
  const t = [
    "- [ ] [unit:x] [plan:b] ux",
    "- [ ] [unit:y] uy",
    "- [ ] [plan:b] pb",
    "- [ ] [plan:a] pa",
    "- [ ] legacy",
  ].join("\n");
  const run = (units, plans) => {
    const r = bindingAcceptance(t, { units, plans });
    return [r.binding.map((c) => c.line.split("] ").pop()), r.legacy.map((c) => c.line.split("] ").pop())];
  };
  assert.deepEqual(run([], ["b"]), [["pb"], ["legacy"]]);
  assert.deepEqual(run(["y"], ["b"]), [["uy", "pb"], ["legacy"]]);
  assert.deepEqual(run(["x"], []), [["ux", "legacy"], []]);
  assert.deepEqual(run([], []), [["legacy"], []]);
});

test("Gleam-shaped two-plan fixture", () => {
  const t = "- [ ] untagged from plan A\n- [ ] [plan:b] plan B whole-plan";
  const forB = bindingAcceptance(t, { units: [], plans: ["b"] });
  assert.deepEqual(forB.binding.map((c) => c.plan), ["b"]);
  assert.equal(forB.legacy.length, 1);
  const forA = bindingAcceptance(t, { units: [], plans: ["a"] });
  assert.equal(forA.binding.length, 0);
  assert.equal(forA.legacy.length, 1);
  assert.equal(bindingAcceptance(t, { units: [], plans: [] }).binding.length, 1);
});
