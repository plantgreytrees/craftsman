import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "./workspace-init.mjs";

test("buildManifest: creates explicit versioned project mappings", () => {
  assert.deepEqual(buildManifest({ projects: { payments: "services/payments" } }), {
    version: 1,
    projects: { payments: { root: "services/payments" } },
  });
});

test("buildManifest: update merges only supplied mappings", () => {
  const existing = { projects: { payments: { root: "services/payments" } } };
  const result = buildManifest({ projects: { search: "tools/search" } }, existing);
  assert.deepEqual(result.projects, {
    payments: { root: "services/payments" },
    search: { root: "tools/search" },
  });
});

test("buildManifest: rejects empty or unsafe mappings", () => {
  assert.throws(() => buildManifest({ projects: {} }), /at least one/);
  assert.throws(() => buildManifest({ projects: { "bad id": "services/a" } }), /invalid project id/);
  assert.throws(() => buildManifest({ projects: { bad: "/tmp/project" } }), /relative root/);
});
