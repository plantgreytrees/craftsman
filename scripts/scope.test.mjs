import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScope } from "./scope.mjs";

test("normalizeScope: keeps a narrow deduplicated read/docs/write manifest", () => {
  const scope = normalizeScope({
    plan: "docs/plans/example.md",
    unit: "unit-1",
    project: ".",
    scope: {
      read: ["src/a.ts", "src/a.ts"],
      docs: ["docs/standards/typescript.md"],
      write: ["src/a.ts", "tests/a.test.ts"],
    },
  });
  assert.deepEqual(scope.scope.read, ["src/a.ts"]);
  assert.deepEqual(scope.scope.docs, ["docs/standards/typescript.md"]);
  assert.deepEqual(scope.scope.write, ["src/a.ts", "tests/a.test.ts"]);
  assert.match(scope.activated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("normalizeScope: rejects a missing scope list", () => {
  assert.throws(() => normalizeScope({ plan: "p", unit: "u", project: ".", scope: { read: [], docs: [] } }), /scope.write/);
});

test("normalizeScope: binds the project root to an explicit worktree", () => {
  const scope = normalizeScope({
    plan: "p",
    unit: "u",
    project: ".",
    worktree_path: "/tmp/worktree",
    scope: { read: ["src/a.ts"], docs: [], write: ["src/a.ts"] },
  });
  assert.equal(scope.project_root, "/tmp/worktree");
  assert.equal(scope.worktree_path, "/tmp/worktree");
});
