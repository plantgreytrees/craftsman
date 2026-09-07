import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gitTrackedFiles, loadConfig, loadWorkspaceManifest, projectContext, resolveSelectedProject } from "./lib/core.mjs";

function fixture(projects) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-workspace-"));
  for (const entry of Object.values(projects)) {
    const projectRoot = path.join(root, entry.root);
    fs.mkdirSync(projectRoot, { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: projectRoot });
  }
  const file = path.join(root, "craftsman.workspace.json");
  fs.writeFileSync(file, JSON.stringify({ version: 1, projects }));
  return { root, file };
}

function withManifest(file, callback) {
  const previous = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = file;
  try { return callback(); }
  finally {
    if (previous === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
    else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = previous;
  }
}

test("workspace manifest: resolves only explicitly named projects", () => {
  const fixtureData = fixture({ payments: { root: "services/payments" }, search: { root: "tools/search" } });
  try {
    withManifest(fixtureData.file, () => {
      const manifest = loadWorkspaceManifest();
      assert.equal(Object.keys(manifest.projects).length, 2);
      const selected = resolveSelectedProject("payments");
      assert.equal(selected.id, "payments");
      assert.equal(selected.root, path.join(fixtureData.root, "services/payments"));
    });
  } finally { fs.rmSync(fixtureData.root, { recursive: true, force: true }); }
});

test("workspace manifest: rejects traversal and duplicate resolved roots", () => {
  const traversal = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-workspace-"));
  const traversalFile = path.join(traversal, "craftsman.workspace.json");
  fs.writeFileSync(traversalFile, JSON.stringify({ version: 1, projects: { bad: { root: "../outside" } } }));
  try { assert.throws(() => withManifest(traversalFile, loadWorkspaceManifest), /escapes|does not exist/); }
  finally { fs.rmSync(traversal, { recursive: true, force: true }); }

  const duplicate = fixture({ a: { root: "same" }, b: { root: "same" } });
  try { assert.throws(() => withManifest(duplicate.file, loadWorkspaceManifest), /share a root/); }
  finally { fs.rmSync(duplicate.root, { recursive: true, force: true }); }
});

test("workspace manifest: legacy mode rejects named projects without a manifest", () => {
  const previous = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = path.join(os.tmpdir(), "missing-craftsman-workspace.json");
  try { assert.throws(() => resolveSelectedProject("payments"), /no workspace manifest/); }
  finally {
    if (previous === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
    else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = previous;
  }
});

test("selected project context: config and Git files stay project-local", async () => {
  const fixtureData = fixture({ one: { root: "one" }, two: { root: "two" } });
  try {
    spawnSync("git", ["init", "-q"], { cwd: path.join(fixtureData.root, "one") });
    spawnSync("git", ["init", "-q"], { cwd: path.join(fixtureData.root, "two") });
    fs.writeFileSync(path.join(fixtureData.root, "one", "one.txt"), "one\n");
    fs.writeFileSync(path.join(fixtureData.root, "two", "two.txt"), "two\n");
    fs.writeFileSync(path.join(fixtureData.root, "one", "craftsman.config.json"), JSON.stringify({ stopGate: { totalBudgetMs: 111 } }));
    fs.writeFileSync(path.join(fixtureData.root, "two", "craftsman.config.json"), JSON.stringify({ stopGate: { totalBudgetMs: 222 } }));
    const previous = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
    process.env.CRAFTSMAN_WORKSPACE_MANIFEST = fixtureData.file;
    try {
      const one = projectContext("one");
      const two = projectContext("two");
      assert.equal(loadConfig(one).stopGate.totalBudgetMs, 111);
      assert.equal(loadConfig(two).stopGate.totalBudgetMs, 222);
      const oneFiles = await gitTrackedFiles({ fresh: true, context: one });
      const twoFiles = await gitTrackedFiles({ fresh: true, context: two });
      assert.ok(oneFiles.includes("one.txt"));
      assert.ok(twoFiles.includes("two.txt"));
      assert.notEqual(one.stateDir, two.stateDir);
    } finally {
      if (previous === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
      else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = previous;
    }
  } finally { fs.rmSync(fixtureData.root, { recursive: true, force: true }); }
});
