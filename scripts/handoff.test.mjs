import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeHandoff } from "./handoff.mjs";

const HANDOFF = path.join(path.dirname(fileURLToPath(import.meta.url)), "handoff.mjs");

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

// A hand-off that names a unit is a unit hand-off: SessionStart and adopt re-arm scope-required from its
// remaining_units (ARCH-AUTO-11), so the writer must say whether any are left; [] is the closing answer.
const unitHandoff = { plan: "docs/plans/example.md", next_action: "run unit 2", unit: "u1" };

test("normalizeHandoff: a hand-off that names a unit without a remaining_units array is refused", () => {
  assert.throws(() => normalizeHandoff(unitHandoff), /remaining_units/);
  assert.throws(() => normalizeHandoff({ ...unitHandoff, remaining_units: "u2" }), /remaining_units/);
  assert.throws(() => normalizeHandoff({ ...unitHandoff, remaining_units: null }), /remaining_units/);
  assert.throws(() => normalizeHandoff({ ...unitHandoff, remaining_units: { 0: "u2" } }), /remaining_units/);
});

test("normalizeHandoff: a unit hand-off carrying [] or a non-empty remaining_units array is accepted as written", () => {
  assert.deepEqual(normalizeHandoff({ ...unitHandoff, remaining_units: [] }).remaining_units, []);
  assert.deepEqual(normalizeHandoff({ ...unitHandoff, remaining_units: ["u2", "u3"] }).remaining_units, ["u2", "u3"]);
});

test("normalizeHandoff: a hand-off that names no unit is accepted without the field", () => {
  const { unit, ...phase } = unitHandoff;
  assert.equal(normalizeHandoff(phase).unit, null);
  assert.equal(normalizeHandoff({ ...phase, unit: "" }).unit, null);
});

test("handoff.mjs: the CLI refuses a unit hand-off without remaining_units and writes nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-handoff-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const base = { ...process.env };
    const childEnv = { ...base, CLAUDE_PROJECT_DIR: dir };
    const send = (payload) => spawnSync(process.execPath, [HANDOFF], {
      cwd: dir, input: JSON.stringify({ session_id: "s-handoff", ...payload }), encoding: "utf8", env: childEnv,
    });
    const file = path.join(dir, ".craftsman", "sessions", "s-handoff", "handoff.json");
    const refused = send(unitHandoff);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /handoff failed: .*remaining_units/);
    assert.equal(fs.existsSync(file), false);
    const closing = send({ ...unitHandoff, remaining_units: [] });
    assert.equal(closing.status, 0, closing.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).remaining_units, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
