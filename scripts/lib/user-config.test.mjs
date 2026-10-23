// Machine-wide plugin options (plugin.json userConfig) -> config defaults.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyUserConfig } from "./user-config.mjs";
import { loadConfig } from "./core.mjs";

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

test("loadConfig: project config wins over the machine-wide value", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uc-"));
  const saved = { ...process.env };
  try {
    process.env.CLAUDE_PLUGIN_OPTION_AUTONOMYLEVEL = "attended";
    process.env.CLAUDE_PLUGIN_OPTION_REVIEWDEPTH = "deep";
    assert.equal(loadConfig({ root }).repoExec.approval.prLines, 100);
    assert.equal(loadConfig({ root }).planning.blindRederivation, "always");
    fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ repoExec: { approval: { prLines: 250 } } }));
    const cfg = loadConfig({ root });
    assert.equal(cfg.repoExec.approval.prLines, 250);
    assert.equal(cfg.planning.blindRederivation, "always");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the manifest defaults change nothing on a fresh install", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../../.claude-plugin/plugin.json", import.meta.url), "utf8"));
  const shipped = JSON.parse(fs.readFileSync(new URL("../../craftsman.config.json", import.meta.url), "utf8"));
  const exported = Object.fromEntries(Object.entries(manifest.userConfig).map(([k, v]) => [`CLAUDE_PLUGIN_OPTION_${k.toUpperCase()}`, String(v.default)]));
  assert.deepEqual(applyUserConfig(shipped, exported), shipped);
});
