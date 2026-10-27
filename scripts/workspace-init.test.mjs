import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildManifest } from "./workspace-init.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "workspace-init.mjs");

function runInit(input) {
  return spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: "utf8" });
}

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

test("buildManifest: update writes back declared roots, not loaded absolute roots", () => {
  // loadWorkspaceManifest() returns normalized entries whose root is a realpath.
  const existing = { projects: { payments: { id: "payments", root: "/abs/ws/services/payments", initialized: true, relativeRoot: "services/payments", declaredRoot: "services/payments" } } };
  const result = buildManifest({ projects: { search: "tools/search" } }, existing);
  assert.deepEqual(result.projects, {
    payments: { root: "services/payments" },
    search: { root: "tools/search" },
  });
});

test("workspace-init: --update keeps existing manifest entries relative on disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-workspace-init-"));
  try {
    for (const dir of ["a", "b"]) {
      fs.mkdirSync(path.join(root, dir));
      spawnSync("git", ["init", "-q"], { cwd: path.join(root, dir) });
    }
    const manifest_path = path.join(root, "craftsman.workspace.json");
    assert.equal(runInit({ projects: { a: "a" }, manifest_path }).status, 0);
    const update = runInit({ projects: { b: "b" }, update: true, manifest_path });
    assert.equal(update.status, 0, update.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(manifest_path, "utf8")), {
      version: 1,
      projects: { a: { root: "a" }, b: { root: "b" } },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildManifest: rejects empty or unsafe mappings", () => {
  assert.throws(() => buildManifest({ projects: {} }), /at least one/);
  assert.throws(() => buildManifest({ projects: { "bad id": "services/a" } }), /invalid project id/);
  assert.throws(() => buildManifest({ projects: { bad: "/tmp/project" } }), /relative root/);
});
