import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyInitPlan, buildInitPlan } from "./init.mjs";
import { buildDigest } from "./digest.mjs";
import { transition } from "./tracker.mjs";

const fixtures = new Set();

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-loop-smoke-"));
  const selected = { id: ".", root, stateDir: path.join(root, ".craftsman") };
  fixtures.add(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }) + "\n");
  return selected;
}

afterEach(() => {
  for (const root of fixtures) fs.rmSync(root, { recursive: true, force: true });
  fixtures.clear();
});

test("workflow smoke: init creates project surfaces and digest reflects tracker progress", () => {
  const selected = fixture();
  const plan = buildInitPlan(selected.root, { checkTools: false });

  assert.equal(plan.detected.languages.includes("javascript"), true);
  assert.equal(plan.ready, false);
  const result = applyInitPlan(plan);
  assert.equal(result.ready, true);
  assert.match(fs.readFileSync(path.join(selected.root, ".gitignore"), "utf8"), /^\.craftsman\/$/m);
  assert.match(fs.readFileSync(path.join(selected.root, ".claudeignore"), "utf8"), /Craftsman managed/);

  transition({ plan: "docs/plans/release.md", unit: "unit-1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/release.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "implemented" }, selected);
  transition({ plan: "docs/plans/release.md", unit: "unit-1", status: "MERGED", evidence: "abc123" }, selected);
  transition({ plan: "docs/plans/release.md", unit: "unit-1", status: "COMPLETE", evidence: "verified" }, selected);
  transition({ plan: "docs/plans/release.md", unit: "unit-2", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/release.md", unit: "unit-2", status: "BLOCKED", evidence: "needs approval" }, selected);

  const digest = buildDigest(selected);
  assert.equal(digest.done[0].unit, "unit-1");
  assert.equal(digest.decisions[0].unit, "unit-2");
  assert.equal(digest.plans[0].percent, 50);
  assert.equal(digest.plans[0].total, 2);
});
