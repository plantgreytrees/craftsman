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
      source_files: ["docs/plans/example.md"], status: "verified", tags: ["tracker"],
      context,
    });
    assert.equal(record.project, ".");
    const result = recallMemory({ plan: "docs/plans/example.md", unit: "unit-1", query: "tracker authority", context });
    assert.equal(result.count, 1);
    assert.equal(result.records[0].source_files[0], "docs/plans/example.md");
    assert.equal(recallMemory({ plan: "docs/plans/example.md", unit: "unit-2", query: "tracker authority", context }).count, 0);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory returns nothing for a query with no term match, and nothing at all for no query", () => {
  const context = isolated();
  try {
    recordMemory({ plan: "plan.md", category: "decision", summary: "Use Redis for the session cache.", tags: ["redis", "cache"], context });
    assert.equal(recallMemory({ plan: "plan.md", query: "unrelated postgres migration", context }).count, 0);
    assert.equal(recallMemory({ plan: "plan.md", context }).count, 0); // no query at all → no blanket dump
    assert.equal(recallMemory({ plan: "plan.md", query: "redis", context }).count, 1);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory excludes expired and superseded entries and caps recall", () => {
  const context = isolated();
  try {
    recordMemory({ plan: "plan.md", category: "decision", summary: "expired gotcha", expires_at: "2000-01-01T00:00:00Z", tags: ["gotcha"], context });
    recordMemory({ plan: "plan.md", category: "decision", summary: "superseded gotcha", status: "superseded", tags: ["gotcha"], context });
    for (let index = 0; index < 20; index++) recordMemory({ plan: "plan.md", category: "tooling-gotcha", summary: `gotcha ${index}`, tags: ["gotcha"], context });
    const result = recallMemory({ plan: "plan.md", query: "gotcha", max_items: 50, max_chars: 5000, context });
    assert.equal(result.count, 12);
    assert.ok(result.records.every((record) => record.summary.startsWith("gotcha")));
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory rejects unsafe plans and source paths", () => {
  const context = isolated();
  try {
    assert.throws(() => recordMemory({ plan: "../secrets", category: "decision", summary: "bad", tags: ["x"], context }), /safe path/);
    assert.throws(() => recordMemory({ plan: "plan.md", category: "decision", summary: "bad", source_files: ["../secret"], tags: ["x"], context }), /safe relative/);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory rejects a record with no tags — untargeted memory can't be retrieved only when needed", () => {
  const context = isolated();
  try {
    assert.throws(() => recordMemory({ plan: "plan.md", category: "decision", summary: "no tags here", tags: [], context }), /at least one tag/);
    assert.throws(() => recordMemory({ plan: "plan.md", category: "decision", summary: "no tags here", context }), /at least one tag/);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory rejects a summary over the terse-fact cap", () => {
  const context = isolated();
  try {
    assert.throws(() => recordMemory({ plan: "plan.md", category: "decision", summary: "x".repeat(221), tags: ["x"], context }), /at most 220 characters/);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory keeps distinct plan paths in distinct ledgers", () => {
  const context = isolated();
  try {
    recordMemory({ plan: "a/b.md", category: "decision", summary: "first", tags: ["first"], context });
    recordMemory({ plan: "a__b.md", category: "decision", summary: "second", tags: ["second"], context });
    assert.equal(recallMemory({ plan: "a/b.md", query: "first", context }).records[0].summary, "first");
    assert.equal(recallMemory({ plan: "a__b.md", query: "second", context }).records[0].summary, "second");
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});

test("plan memory supports compact summaries and summary-only recall", () => {
  const context = isolated();
  try {
    for (let index = 0; index < 3; index++) recordMemory({ plan: "plan.md", unit: "unit-1", category: "decision", summary: `decision ${index}`, tags: ["decision"], context });
    const compacted = compactMemory({ plan: "plan.md", context });
    assert.equal(compacted.records_before, 3);
    assert.equal(compacted.records_after, 1);
    assert.equal(compacted.entries_superseded, 2);
    const result = recallMemory({ plan: "plan.md", query: "decision", summary_only: true, context });
    assert.equal(result.count, 1);
    assert.deepEqual(Object.keys(result.records[0]).sort(), ["category", "confidence", "id", "source_commit", "status", "summary"]);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
});
