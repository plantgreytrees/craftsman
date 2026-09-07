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
