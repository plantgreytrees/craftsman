import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHandoff } from "./handoff.mjs";

test("normalizeHandoff: preserves the resume contract and supplies arrays", () => {
  const handoff = normalizeHandoff({ plan: "docs/plans/example.md", next_action: "run unit 2" });
  assert.equal(handoff.plan, "docs/plans/example.md");
  assert.equal(handoff.next_action, "run unit 2");
  assert.deepEqual(handoff.completed_units, []);
  assert.deepEqual(handoff.remaining_units, []);
  assert.deepEqual(handoff.changed_files, []);
  assert.deepEqual(handoff.memory_entries, []);
  assert.match(handoff.written_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("normalizeHandoff: rejects a hand-off without a next action", () => {
  assert.throws(() => normalizeHandoff({ plan: "docs/plans/example.md" }), /handoff.next_action/);
});
