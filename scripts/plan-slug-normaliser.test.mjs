import test from "node:test";
import assert from "node:assert/strict";
import { planSlugOf, bindingAcceptance } from "./lib/core.mjs";

test("planSlugOf normalises paths to the basename slug", () => {
  for (const a of ["./docs/plans/x.md", "sub/docs/plans/x.md", "docs/plans/x.md", "x"]) {
    assert.equal(planSlugOf(a), "x", a);
  }
  assert.equal(planSlugOf("a b"), "a");
  assert.equal(planSlugOf("--flag x"), "x");
  assert.equal(planSlugOf("a/b"), null);
  assert.equal(planSlugOf("$x"), null);
  assert.equal(planSlugOf(""), null);
});

test("bindingAcceptance binds a [plan:b] line for a ./docs/plans/b.md plan", () => {
  const { binding } = bindingAcceptance("- [ ] [plan:b] y\n- [ ] [plan:c] z", { units: [], plans: ["./docs/plans/b.md"] });
  assert.deepEqual(binding.map((c) => c.plan), ["b"]);
});
