import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyInitPlan, buildInitPlan, claudeIgnorePatterns, renderInitDiff } from "./init.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-init-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest" }, devDependencies: { typescript: "latest" } }));
  fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({
    enabled: true,
    timeoutMs: 9999,
    stopGate: { commands: { "package.json": "npm test --silent" } },
    customRule: { enabled: true },
  }));
  return root;
}

test("init preserves project overrides while optimizing legacy defaults", () => {
  const root = fixture();
  const plan = buildInitPlan(root, { checkTools: false });

  assert.deepEqual(plan.detected.languages, ["typescript"]);
  assert.equal(plan.testCommands["package.json"], "npm test --silent");
  assert.equal(plan.config.timeoutMs, 9999);
  assert.deepEqual(plan.config.customRule, { enabled: true });
  assert.equal(plan.config.enabled, undefined);
  assert.equal(plan.required.claudeContext.present, false);
  assert.equal(plan.required.gitignore.present, false);
});

test("init repairs missing structure and is idempotent", () => {
  const root = fixture();
  applyInitPlan(buildInitPlan(root, { checkTools: false }));
  const first = fs.readFileSync(path.join(root, "craftsman.config.json"), "utf8");
  const second = applyInitPlan(buildInitPlan(root, { checkTools: false }));

  assert.equal(fs.readFileSync(path.join(root, "craftsman.config.json"), "utf8"), first);
  assert.equal(second.required.claudeContext.present, true);
  assert.equal(second.required.claudeIgnore.present, true);
  assert.equal(second.required.gitignore.present, true);
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^\.craftsman\/$/m);
  const claudeIgnore = fs.readFileSync(path.join(root, ".claudeignore"), "utf8");
  assert.match(claudeIgnore, /# Craftsman managed \.claudeignore/);
  assert.match(claudeIgnore, /node_modules\//);
  assert.match(claudeIgnore, /\.next\//);
});

test("init adds language-specific cache exclusions", () => {
  const patterns = claudeIgnorePatterns({ languages: ["python", "rust", "csharp"] });
  assert.ok(patterns.includes(".ruff_cache/"));
  assert.ok(patterns.includes("target/"));
  assert.ok(patterns.includes("TestResults/"));
});

test("init refreshes only its managed Claude-ignore block", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, ".claudeignore"), "# Project rule\nsecret-fixture.txt\n\n# Craftsman managed .claudeignore\nold-pattern\n# End Craftsman managed .claudeignore\n");
  applyInitPlan(buildInitPlan(root, { checkTools: false }));
  const claudeIgnore = fs.readFileSync(path.join(root, ".claudeignore"), "utf8");

  assert.match(claudeIgnore, /secret-fixture\.txt/);
  assert.doesNotMatch(claudeIgnore, /old-pattern/);
  assert.equal((claudeIgnore.match(/# Craftsman managed \.claudeignore/g) || []).length, 1);
});

test("init follows the lockfile package manager", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  assert.equal(buildInitPlan(root, { checkTools: false }).testCommands["package.json"], "pnpm test");
});

test("init exposes a diff and backs up existing managed files", () => {
  const root = fixture();
  const plan = buildInitPlan(root, { checkTools: false });
  assert.equal(plan.ready, false);
  assert.match(renderInitDiff(plan), /--- craftsman\.config\.json/);

  const result = applyInitPlan(plan);
  assert.ok(result.backupDir);
  assert.ok(fs.existsSync(path.join(result.backupDir, "craftsman.config.json")));
  assert.equal(buildInitPlan(root, { checkTools: false }).ready, true);
});
