import { test } from "node:test";
import assert from "node:assert/strict";
import { orderSteps, validateSteps, waves } from "./plan-graph.mjs";

const step = (id, depends_on = [], project = "repo-a") => ({ id, scope_id: id, project, depends_on });

test("orderSteps: orders scope steps by dependencies while preserving independent input order", () => {
  const ordered = orderSteps([step("consumer", ["contract"]), step("docs"), step("contract")]);
  assert.deepEqual(ordered.map(({ id }) => id), ["contract", "consumer", "docs"]);
});

test("validateSteps: rejects duplicate, unknown, and self dependencies", () => {
  assert.throws(() => validateSteps([step("a"), step("a")]), /duplicate/);
  assert.throws(() => validateSteps([step("a", ["missing"])]), /unknown/);
  assert.throws(() => validateSteps([step("a", ["a"])]), /itself/);
});

test("orderSteps: rejects dependency cycles", () => {
  assert.throws(() => orderSteps([step("a", ["b"]), step("b", ["a"])]), /cycle/);
});

test("validateSteps: keeps project as an explicit repository boundary", () => {
  assert.equal(validateSteps([step("a", [], "services/payments")])[0].project, "services/payments");
});

// ARCH-LAND-02/03: each repo lands in plan-graph order, and a submodule
// pointer bump is its own parent unit after the sub-repo lands.
test("orderSteps: sub-repo unit, then the parent's pointer bump, then the consumer", () => {
  const workspace = { projects: { lib: { id: "lib", root: "/w/app/vendor/lib" }, app: { id: "app", root: "/w/app" } } };
  const steps = validateSteps([
    step("consumer", ["bump-lib"], "app"),
    { ...step("bump-lib", ["lib-change"], "app"), bumps: "lib" },
    step("lib-change", [], "lib"),
  ], { workspace, isGitlink: () => true });
  assert.deepEqual(orderSteps(steps).map(({ id, project }) => `${project}:${id}`), ["lib:lib-change", "app:bump-lib", "app:consumer"]);
  assert.throws(() => validateSteps([step("x", [], "unregistered")], { workspace }), /unknown workspace project/, "only registered projects are touched (LAND-07)");
});

const NO_WS = { workspace: null };
const fstep = (id, feature, depends_on = [], write) => ({ id, scope_id: id, feature, depends_on, ...(write ? { scope: { write } } : {}) });

test("validateSteps: refuses a feature over featureUnitCap", () => {
  const steps = [fstep("a", "f"), fstep("b", "f"), fstep("c", "f")];
  assert.throws(() => validateSteps(steps, { ...NO_WS, featureUnitCap: 2 }), /cap of 2/);
  assert.equal(validateSteps(steps, { ...NO_WS, featureUnitCap: 3 }).length, 3);
});

test("validateSteps: refuses a depends_on into a later feature", () => {
  const steps = [fstep("a", "one", ["b"]), fstep("b", "two")];
  assert.throws(() => validateSteps(steps, NO_WS), /later feature/);
  assert.equal(validateSteps([fstep("a", "one"), fstep("b", "two", ["a"])], NO_WS).length, 2);
});

test("validateSteps: steps without a feature share one implicit feature", () => {
  const plain = (id, depends_on = []) => ({ id, scope_id: id, depends_on });
  const steps = [plain("a", ["c"]), plain("b"), plain("c")];
  assert.equal(validateSteps(steps, NO_WS).length, 3);
  assert.throws(() => validateSteps(steps, { ...NO_WS, featureUnitCap: 2 }), /implicit/);
});

const ids = (batches) => batches.map((b) => b.map((s) => s.id));

test("waves: maxSubagents 0 or 1 runs one step per batch", () => {
  const steps = [fstep("a", "f", [], ["x"]), fstep("b", "f", [], ["y"])];
  assert.deepEqual(ids(waves(steps, { maxSubagents: 0 })), [["a"], ["b"]]);
  assert.deepEqual(ids(waves(steps, { maxSubagents: 1 })), [["a"], ["b"]]);
});

test("waves: cap 2 batches disjoint independent steps", () => {
  const steps = [fstep("a", "f", [], ["x.mjs"]), fstep("b", "f", [], ["y.mjs"]), fstep("c", "f", [], ["z.mjs"])];
  assert.deepEqual(ids(waves(steps, { maxSubagents: 2 })), [["a", "b"], ["c"]]);
});

test("waves: cap 2 splits steps with overlapping writes", () => {
  const steps = [fstep("a", "f", [], ["src/x.mjs"]), fstep("b", "f", [], ["src/x.mjs"])];
  assert.deepEqual(ids(waves(steps, { maxSubagents: 2 })), [["a"], ["b"]]);
});

test("waves: cap 2 splits dependent steps", () => {
  const steps = [fstep("a", "f", [], ["x"]), fstep("b", "f", ["a"], ["y"])];
  assert.deepEqual(ids(waves(steps, { maxSubagents: 2 })), [["a"], ["b"]]);
});
