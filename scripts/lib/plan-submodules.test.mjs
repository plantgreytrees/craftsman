import { test } from "node:test";
import assert from "node:assert/strict";
import { orderSteps, validateSteps } from "../plan-graph.mjs";
import { submoduleParents } from "./plan-submodules.mjs";

// ARCH-LAND-03 enforced: a registered project nested in another's root is a
// submodule; its parent needs a `bumps` step that lands after all its steps.
const nested = { projects: {
  app: { id: "app", root: "/w/app" },
  lib: { id: "lib", root: "/w/app/vendor/lib" },
  deep: { id: "deep", root: "/w/app/vendor/lib/third/deep" },
  other: { id: "other", root: "/w/other" },
} };
const step = (id, depends_on, project) => ({ id, scope_id: id, project, depends_on });
const bump = (id, bumps, depends_on, project) => ({ ...step(id, depends_on, project), bumps });

test("submoduleParents: the nearest enclosing registered root is the parent; a sibling prefix is not", () => {
  const parents = submoduleParents({ projects: { ...nested.projects, appx: { id: "appx", root: "/w/appx" } } });
  assert.deepEqual(Object.fromEntries(parents), { lib: "app", deep: "lib" });
});

test("validateSteps: a submodule's steps need a bump step in its parent (ARCH-LAND-03)", () => {
  assert.throws(() => validateSteps([step("lib-change", [], "lib"), step("consumer", ["lib-change"], "app")], { workspace: nested }),
    /submodule lib need a bump step in app/);
});

test("validateSteps: the bump step must depend on every submodule step, directly or transitively (ARCH-LAND-03)", () => {
  assert.throws(() => validateSteps([
    step("lib-a", [], "lib"), step("lib-b", [], "lib"), bump("bump-lib", "lib", ["lib-a"], "app"),
  ], { workspace: nested }), /bump step bump-lib must depend on submodule step lib-b/);
  const steps = validateSteps([
    step("lib-a", [], "lib"), step("lib-b", ["lib-a"], "lib"), bump("bump-lib", "lib", ["lib-b"], "app"),
  ], { workspace: nested });
  assert.equal(steps.length, 3);
});

test("validateSteps: bumps must name a submodule of the step's own project (ARCH-LAND-03)", () => {
  const sub = step("lib-change", [], "lib");
  assert.throws(() => validateSteps([sub, bump("bump-lib", "lib", ["lib-change"], "other")], { workspace: nested }), /not a submodule of its project other/);
  assert.throws(() => validateSteps([bump("bump-app", "app", [], "other")], { workspace: nested }), /not a submodule/);
  assert.throws(() => validateSteps([bump("bump-x", 7, [], "app")], { workspace: nested }), /not a submodule/);
  // deep's nearest enclosing project is lib, not app.
  assert.throws(() => validateSteps([step("d", [], "deep"), bump("bump-deep", "deep", ["d"], "app")], { workspace: nested }), /not a submodule of its project app/);
  const ok = validateSteps([
    step("d", [], "deep"), bump("bump-deep", "deep", ["d"], "lib"), bump("bump-lib", "lib", ["bump-deep"], "app"),
  ], { workspace: nested });
  assert.deepEqual(orderSteps(ok).map(({ id }) => id), ["d", "bump-deep", "bump-lib"]);
});

test("orderSteps: sub step, then the parent's bump, then the consumer; no manifest means no submodule check", () => {
  const steps = validateSteps([
    step("consumer", ["bump-lib"], "app"), bump("bump-lib", "lib", ["lib-change"], "app"), step("lib-change", [], "lib"),
  ], { workspace: nested });
  assert.deepEqual(orderSteps(steps).map(({ id }) => id), ["lib-change", "bump-lib", "consumer"]);
  assert.equal(validateSteps([step("lib-change", [], "lib")], { workspace: null }).length, 1);
});
