import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compactMemory, recordMemory, recallMemory } from "./plan-memory.mjs";

function isolated() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-memory-"));
  fs.mkdirSync(path.join(root, ".git"));
  return { id: ".", root, stateDir: path.join(root, ".craftsman") };
}

test("plan memory records bounded, provenance-bearing entries and recalls by unit", () => {
  const context = isolated();
  try {
    const record = recordMemory({
      plan: "docs/plans/example.md", unit: "unit-1", scope_id: "scope-1",
      category: "decision", summary: "Use the local tracker as execution authority.",
      source_files: ["docs/plans/example.md"], status: "verified",
      context,
    });
    assert.equal(record.project, ".");
    const result = recallMemory({ plan: "docs/plans/example.md", unit: "unit-1", query: "tracker authority", context });
    assert.equal(result.count, 1);
    assert.equal(result.records[0].source_files[0], "docs/plans/example.md");
    assert.equal(recallMemory({ plan: "docs/plans/example.md", unit: "unit-2", context }).count, 0);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory excludes expired and superseded entries and caps recall", () => {
  const context = isolated();
  try {
    recordMemory({ plan: "plan.md", category: "decision", summary: "expired", expires_at: "2000-01-01T00:00:00Z", context });
    recordMemory({ plan: "plan.md", category: "decision", summary: "superseded", status: "superseded", context });
    for (let index = 0; index < 20; index++) recordMemory({ plan: "plan.md", category: "tooling-gotcha", summary: `gotcha ${index}`, context });
    const result = recallMemory({ plan: "plan.md", max_items: 50, max_chars: 5000, context });
    assert.equal(result.count, 12);
    assert.ok(result.records.every((record) => record.summary.startsWith("gotcha")));
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory rejects unsafe plans and source paths", () => {
  const context = isolated();
  try {
    assert.throws(() => recordMemory({ plan: "../secrets", category: "decision", summary: "bad", context }), /safe path/);
    assert.throws(() => recordMemory({ plan: "plan.md", category: "decision", summary: "bad", source_files: ["../secret"], context }), /safe relative/);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory keeps distinct plan paths in distinct ledgers", () => {
  const context = isolated();
  try {
    recordMemory({ plan: "a/b.md", category: "decision", summary: "first", context });
    recordMemory({ plan: "a__b.md", category: "decision", summary: "second", context });
    assert.equal(recallMemory({ plan: "a/b.md", context }).records[0].summary, "first");
    assert.equal(recallMemory({ plan: "a__b.md", context }).records[0].summary, "second");
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory supports compact summaries and summary-only recall", () => {
  const context = isolated();
  try {
    for (let index = 0; index < 3; index++) recordMemory({ plan: "plan.md", unit: "unit-1", category: "decision", summary: `decision ${index}`, context });
    const compacted = compactMemory({ plan: "plan.md", context });
    assert.equal(compacted.records_before, 3);
    assert.equal(compacted.records_after, 1);
    assert.equal(compacted.entries_superseded, 2);
    const result = recallMemory({ plan: "plan.md", summary_only: true, context });
    assert.equal(result.count, 1);
    assert.deepEqual(Object.keys(result.records[0]).sort(), ["category", "confidence", "id", "source_commit", "status", "summary"]);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});