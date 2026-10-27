import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyInitPlan, buildInitPlan, buildUpdatePlan, claudeIgnorePatterns, pluginVersion, renderInitDiff } from "./init.mjs";
import * as initMod from "./init.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

test("init keeps declared stop-gate commands verbatim, an empty map included", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "Makefile"), "test:\n\tpytest\n");
  fs.writeFileSync(path.join(root, "pyproject.toml"), "");
  fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ stopGate: { commands: { "pyproject.toml": "scripts/run.sh pytest -q" } } }));
  assert.deepEqual(buildInitPlan(root, { checkTools: false }).config.stopGate.commands, { "pyproject.toml": "scripts/run.sh pytest -q" });

  fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ stopGate: { commands: {} } }));
  assert.deepEqual(buildInitPlan(root, { checkTools: false }).config.stopGate.commands, {});

  fs.writeFileSync(path.join(root, "craftsman.config.json"), "{}");
  assert.equal(buildInitPlan(root, { checkTools: false }).config.stopGate.commands["pyproject.toml"], "make test");
});

test("a CI test step only fills the marker whose tool it runs, quoted arguments intact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-init-"));
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), [
    "jobs:", "  test:", "    steps:", "      - name: Run tests",
    "        run: dotnet test tests/tests_unit --nologo --logger \"trx;LogFileName=results.trx\"",
    "      - run: |", "          cd api", "          python -m pytest -q tests",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "App.sln"), "");
  fs.writeFileSync(path.join(root, "pyproject.toml"), "");
  fs.writeFileSync(path.join(root, "Cargo.toml"), "");
  const { testCommands } = buildInitPlan(root, { checkTools: false });

  assert.equal(testCommands["*.sln"], "dotnet test tests/tests_unit --nologo --logger \"trx;LogFileName=results.trx\"");
  assert.equal(testCommands["pyproject.toml"], "python -m pytest -q tests");
  assert.equal(testCommands["Cargo.toml"], "cargo test --quiet");
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

test("init's post-write report keeps the plan's tool probe instead of listing every tool missing", () => {
  const root = fixture();
  const plan = buildInitPlan(root, { checkTools: false });
  plan.tools = { installed: ["ruff", "gitleaks"], missing: ["hadolint"] };
  assert.deepEqual(applyInitPlan(plan).tools, { installed: ["ruff", "gitleaks"], missing: ["hadolint"] });
});

test("init audits but refuses to write inside the plugin's own source repo", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".claude-plugin"));
  fs.writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "craftsman" }));
  const before = fs.readFileSync(path.join(root, "craftsman.config.json"), "utf8");
  const plan = buildInitPlan(root, { checkTools: false });

  assert.equal(plan.pluginSource, true);
  assert.ok(plan.changes.length > 0);
  assert.throws(() => applyInitPlan(plan), /plugin's own source/);
  assert.equal(fs.readFileSync(path.join(root, "craftsman.config.json"), "utf8"), before);
  assert.equal(fs.existsSync(path.join(root, ".craftsman", "init-backups")), false);

  fs.writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "other-plugin" }));
  assert.equal(buildInitPlan(root, { checkTools: false }).pluginSource, false);
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

test("init update audits the shipped plugin and refreshes project surfaces", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, "docs", "plans"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "plans", "active.md"), "---\nslug: active\nclassification: in-scope\n---\n\n- [ ] 1.1 pending work\n");
  fs.writeFileSync(path.join(root, "docs", "plans", "done.md"), "---\nslug: done\nclassification: in-scope\n---\n\ncompleted\n");
  fs.writeFileSync(path.join(root, "docs", "plans", "TRACKER.md"), "| 1 | [active](./active.md) | work | JS | normal | IN_PROGRESS | active | 2026-09-07 |\n| 2 | [done](./done.md) | work | JS | normal | MERGED | done | 2026-09-01 |\n");
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "CLAUDE.md"), "# Project-owned context\n");
  const plan = buildUpdatePlan(root, { checkTools: false });

  assert.equal(plan.mode, "update");
  assert.equal(plan.update.pluginMissing.length, 0);
  assert.deepEqual(plan.update.pluginSyntaxErrors, []);
  assert.deepEqual(plan.update.pluginJsonErrors, []);
  assert.equal(plan.update.pluginHealthy, true);
  assert.ok(plan.update.pluginFiles > 10);
  assert.ok(plan.update.pluginFileList.includes(".claude-plugin/marketplace.json"));
  assert.ok(plan.update.pluginVersion);
  assert.deepEqual(plan.update.architecture, { dir: "docs/architecture", rulesDocs: 0, unmanagedDocs: 0, next: "/architect --backfill — create rules from legacy docs, plans and code" });
  assert.ok(plan.update.projectChanges.includes(path.join(root, ".claudeignore")));
  assert.deepEqual(plan.update.planOrder, ["docs/plans/active.md", "docs/plans/done.md"]);
  assert.deepEqual(plan.update.planChanges, [path.join(root, "docs/plans/active.md"), path.join(root, "docs/plans/done.md")]);

  const result = applyInitPlan(plan);
  assert.match(fs.readFileSync(path.join(root, ".claude", "CLAUDE.md"), "utf8"), /Project-owned context/);
  const versionRe = new RegExp(`craftsman_version: ${plan.update.pluginVersion.split("+")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  assert.match(fs.readFileSync(path.join(root, "docs", "plans", "active.md"), "utf8"), versionRe);
  assert.match(fs.readFileSync(path.join(root, "docs", "plans", "active.md"), "utf8"), /pending work/);
  assert.match(fs.readFileSync(path.join(root, "docs", "plans", "done.md"), "utf8"), versionRe);
  assert.equal(result.ready, true);
});

test("pluginVersion: release from metadata, plus the cache directory's commit when installed", () => {
  assert.equal(pluginVersion({ metadata: { release: "2.2.0" } }, "/repo/craftsman"), "2.2.0");
  assert.equal(pluginVersion({ metadata: { release: "2.2.0" } }, "/cache/craftsman/3f2a9c1d0b4e"), "2.2.0+3f2a9c1d0b4e");
  assert.equal(pluginVersion({ version: "2.1.0" }, "/cache/craftsman/2.1.0"), "2.1.0");
  assert.equal(pluginVersion({}, "/cache/craftsman/3f2a9c1d0b4e"), "3f2a9c1d0b4e");
  assert.equal(pluginVersion({}, "/repo/craftsman"), null);
});

test("init update stamps level: feature into canonical plans only, and a second run is a no-op", () => {
  const root = fixture();
  const dir = path.join(root, "docs", "plans");
  fs.mkdirSync(dir, { recursive: true });
  const canonical = "---\nslug: canon\nscope_id: canon-1\n---\n\n- [ ] 1.1 work\n";
  const legacy = "# Legacy plan\n\n| 1 | hand-written row | PENDING |\n";
  const handoff = "# Hand-off: Craftsman Plugin Enhancements\n\nscope_id: keep\n";
  const leveled = "---\nslug: epic-one\nlevel: epic\n---\n";
  fs.writeFileSync(path.join(dir, "canon.md"), canonical);
  fs.writeFileSync(path.join(dir, "legacy.md"), legacy);
  fs.writeFileSync(path.join(dir, "plugin-enhancements-handoff.md"), handoff);
  fs.writeFileSync(path.join(dir, "epic-one.md"), leveled);

  const plan = buildUpdatePlan(root, { checkTools: false });
  assert.deepEqual(plan.update.planChanges.map((f) => path.basename(f)).sort(), ["canon.md", "epic-one.md"]);
  applyInitPlan(plan);

  const stamped = fs.readFileSync(path.join(dir, "canon.md"), "utf8");
  assert.match(stamped, /^level: feature$/m);
  assert.match(stamped, /^scope_id: canon-1$/m);
  assert.equal(fs.readFileSync(path.join(dir, "legacy.md"), "utf8"), legacy);
  assert.equal(fs.readFileSync(path.join(dir, "plugin-enhancements-handoff.md"), "utf8"), handoff);
  assert.equal(fs.readFileSync(path.join(dir, "epic-one.md"), "utf8").includes("level: feature"), false);

  assert.deepEqual(buildUpdatePlan(root, { checkTools: false }).update.planChanges, []);
});

test("init update treats a FEATURE_MERGED tracker row as active", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, "docs", "plans"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "plans", "feat.md"), "---\nslug: feat\nclassification: in-scope\n---\n\n- [x] 1.1 done\n");
  fs.writeFileSync(path.join(root, "docs", "plans", "TRACKER.md"), "| 1 | [feat](./feat.md) | work | JS | normal | FEATURE_MERGED | feat | 2026-09-07 |\n");
  const audit = buildUpdatePlan(root, { checkTools: false }).update.planAudit.find((p) => p.slug === "feat");
  assert.deepEqual(audit.statuses, ["FEATURE_MERGED"]);
  assert.equal(audit.active, true);
});

// 13.1 / ARCH-SAFETY-10: init offers to merge sandbox settings into the project's .claude/settings.json.
// It shows the diff first, merges and never overwrites, and writes nothing until it is told to.
const INIT = fileURLToPath(new URL("./init.mjs", import.meta.url));
const settingsPath = (root) => path.join(root, ".claude", "settings.json");
const initCli = (root, flag) => spawnSync(process.execPath, [INIT, flag], { cwd: root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });

test("init --settings-diff shows the merge and writes nothing; declining leaves the file byte-identical", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".claude"));
  const original = JSON.stringify({ model: "opus", permissions: { allow: ["Bash(npm test)"] } }, null, 2) + "\n";
  fs.writeFileSync(settingsPath(root), original);
  const r = initCli(root, "--settings-diff");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\+ sandbox\.enabled: true/);
  assert.doesNotMatch(r.stdout, /rm -r/);
  assert.match(r.stdout, /\+ permissions\.ask: Bash\(git push --force \*\)/);
  assert.equal(fs.readFileSync(settingsPath(root), "utf8"), original, "a preview never writes");
  assert.equal(fs.existsSync(path.join(root, ".craftsman", "init-backups")), false);
});

test("init --settings-write merges into an existing file, keeps every key and array, and backs the old file up", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".claude"));
  fs.writeFileSync(settingsPath(root), JSON.stringify({ model: "opus", permissions: { allow: ["Bash(npm test)"], ask: ["Bash(sudo *)"] } }, null, 2));
  const r = initCli(root, "--settings-write");
  assert.equal(r.status, 0, r.stderr);
  const next = JSON.parse(fs.readFileSync(settingsPath(root), "utf8"));
  assert.equal(next.model, "opus");
  assert.deepEqual(next.permissions.allow, ["Bash(npm test)"]);
  assert.equal(next.permissions.ask.filter((rule) => rule === "Bash(sudo *)").length, 1);
  assert.equal(next.sandbox.enabled, true);
  const backups = fs.readdirSync(path.join(root, ".craftsman", "init-backups"));
  assert.equal(backups.length, 1);
  assert.match(fs.readFileSync(path.join(root, ".craftsman", "init-backups", backups[0], ".claude", "settings.json"), "utf8"), /"model": "opus"/);
  // idempotent: nothing left to add, so nothing is written and no second backup appears
  assert.match(initCli(root, "--settings-write").stdout, /nothing to add/);
  assert.equal(fs.readdirSync(path.join(root, ".craftsman", "init-backups")).length, 1);
});

test("init --settings-write creates .claude/settings.json when there is none", () => {
  const root = fixture();
  assert.equal(initCli(root, "--settings-write").status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath(root), "utf8")).sandbox, { enabled: true });
});

test("init settings merge aborts on invalid JSON and leaves the file untouched", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".claude"));
  fs.writeFileSync(settingsPath(root), "{ not json");
  for (const flag of ["--settings-diff", "--settings-write"]) {
    const r = initCli(root, flag);
    assert.equal(r.status, 2, flag);
    assert.match(r.stderr, /settings\.json/);
  }
  assert.equal(fs.readFileSync(settingsPath(root), "utf8"), "{ not json");
});

test("init: the settings merge and the other modes are mutually exclusive", () => {
  const root = fixture();
  const r = spawnSync(process.execPath, [INIT, "--settings-write", "--write"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /choose only one/);
  assert.equal(typeof initMod.previewSandboxSettings, "function");
});

// Round 5 (38.2): the architecture dir comes from the merged project config, so craftsman.project.json applies.
test("init update reads architecture.dir from craftsman.project.json too (38.2)", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "craftsman.project.json"), JSON.stringify({ architecture: { dir: "docs/arch-from-override" } }));
  const plan = buildUpdatePlan(root, { checkTools: false });
  assert.equal(plan.update.architecture.dir, "docs/arch-from-override");
});

test("init update scaffolds a tiny craftsman-loop rule only when absent and writes no justfile, pre-commit or CI file", () => {
  const root = fixture();
  const rule = path.join(root, ".claude", "rules", "craftsman-loop.md");
  const plan = buildUpdatePlan(root, { checkTools: false });
  assert.ok(plan.changes.includes(rule));
  assert.ok(Buffer.byteLength(plan.files[rule]) <= 200);
  assert.equal(buildInitPlan(root, { checkTools: false }).changes.includes(rule), false);
  applyInitPlan(plan);
  assert.ok(fs.existsSync(rule));
  for (const f of ["justfile", ".pre-commit-config.yaml", ".github"]) assert.equal(fs.existsSync(path.join(root, f)), false);
  assert.equal(buildUpdatePlan(root, { checkTools: false }).changes.includes(rule), false);
  fs.writeFileSync(rule, "mine\n");
  applyInitPlan(buildUpdatePlan(root, { checkTools: false }));
  assert.equal(fs.readFileSync(rule, "utf8"), "mine\n");
});
