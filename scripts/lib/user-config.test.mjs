// Machine-wide plugin options (plugin.json userConfig) -> config defaults.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyUserConfig } from "./user-config.mjs";
import { spawnSync } from "node:child_process";

const defaults = () => ({
  repoExec: { approval: { required: true, prLines: 400 } },
  planning: { blindRederivation: "never" },
  docs: { budgets: { enforce: true } },
});
const env = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`CLAUDE_PLUGIN_OPTION_${k}`, v]));

test("AUTONOMYLEVEL maps to repoExec.approval.prLines", () => {
  for (const [v, n] of [["attended", 100], ["standard", 400], ["unattended", 1000]]) {
    const out = applyUserConfig(defaults(), env({ AUTONOMYLEVEL: v }));
    assert.equal(out.repoExec.approval.prLines, n);
    assert.equal(out.repoExec.approval.required, true);
  }
});

test("REVIEWDEPTH maps to planning.blindRederivation", () => {
  for (const [v, m] of [["light", "never"], ["standard", "auto"], ["deep", "always"]]) {
    assert.equal(applyUserConfig(defaults(), env({ REVIEWDEPTH: v })).planning.blindRederivation, m);
  }
});

test("BUDGETSENFORCE maps true/false to docs.budgets.enforce", () => {
  assert.equal(applyUserConfig(defaults(), env({ BUDGETSENFORCE: "false" })).docs.budgets.enforce, false);
  assert.equal(applyUserConfig(defaults(), env({ BUDGETSENFORCE: "true" })).docs.budgets.enforce, true);
});

test("MODELTIER is reserved and changes nothing", () => {
  assert.deepEqual(applyUserConfig(defaults(), env({ MODELTIER: "opus" })), defaults());
});

test("unset and unknown values leave defaults and never throw", () => {
  assert.deepEqual(applyUserConfig(defaults(), {}), defaults());
  assert.deepEqual(applyUserConfig(defaults(), env({ AUTONOMYLEVEL: "wild", REVIEWDEPTH: "", BUDGETSENFORCE: "maybe" })), defaults());
  assert.doesNotThrow(() => applyUserConfig({}, env({ AUTONOMYLEVEL: "attended" })));
});

test("does not mutate its input", () => {
  const d = defaults();
  applyUserConfig(d, env({ AUTONOMYLEVEL: "attended" }));
  assert.deepEqual(d, defaults());
});

// loadConfig for a project at `root`, run in a node whose cwd is `root` so core's PROJECT_ROOT is `root` and no workspace-root layer is
// added (ARCH-STATE-19). In this process PROJECT_ROOT is the plugin checkout, whose own craftsman.config.json would sit over the user config.
function loadConfigAt(root, userEnv) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith("CLAUDE_PLUGIN_OPTION_") || ["CLAUDE_PLUGIN_ROOT", "CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID", "CRAFTSMAN_WORKSPACE_MANIFEST"].includes(k)) delete env[k];
  }
  const src = `import { loadConfig } from ${JSON.stringify(new URL("./core.mjs", import.meta.url).href)};\nprocess.stdout.write(JSON.stringify(loadConfig({ root: process.cwd() })));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", src], { cwd: root, env: { ...env, ...userEnv }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("loadConfig: project config wins over the machine-wide value", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "uc-")));
  const user = { CLAUDE_PLUGIN_OPTION_AUTONOMYLEVEL: "attended", CLAUDE_PLUGIN_OPTION_REVIEWDEPTH: "deep" };
  try {
    assert.equal(loadConfigAt(root, user).repoExec.approval.prLines, 100);
    assert.equal(loadConfigAt(root, user).planning.blindRederivation, "always");
    fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ repoExec: { approval: { prLines: 250 } } }));
    const cfg = loadConfigAt(root, user);
    assert.equal(cfg.repoExec.approval.prLines, 250);
    assert.equal(cfg.planning.blindRederivation, "always");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the manifest defaults change nothing on a fresh install", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../../.claude-plugin/plugin.json", import.meta.url), "utf8"));
  const shipped = JSON.parse(fs.readFileSync(new URL("../../craftsman.config.json", import.meta.url), "utf8"));
  const exported = Object.fromEntries(Object.entries(manifest.userConfig).map(([k, v]) => [`CLAUDE_PLUGIN_OPTION_${k.toUpperCase()}`, String(v.default)]));
  assert.deepEqual(applyUserConfig(shipped, exported), shipped);
});
