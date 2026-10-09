import { test } from "node:test";
import assert from "node:assert/strict";
import { orderSteps, validateSteps } from "./plan-graph.mjs";

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
  const workspace = { projects: { lib: { path: "vendor/lib" }, app: { path: "." } } };
  const steps = validateSteps([
    step("consumer", ["bump-lib"], "app"),
    step("bump-lib", ["lib-change"], "app"),
    step("lib-change", [], "lib"),
  ], { workspace });
  assert.deepEqual(orderSteps(steps).map(({ id, project }) => `${project}:${id}`), ["lib:lib-change", "app:bump-lib", "app:consumer"]);
  assert.throws(() => validateSteps([step("x", [], "unregistered")], { workspace }), /unknown workspace project/, "only registered projects are touched (LAND-04)");
});
