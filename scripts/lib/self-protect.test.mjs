import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SELF_SCOPED, SAFETY_CONFIG_KEYS, SAFETY_ENV, namesSelfScoped, safetyProjection } from "./self-protect.mjs";

test("self-protect: the self-scoped list is the hooks, the config and both settings files", () => {
  assert.deepEqual([...SELF_SCOPED], ["hooks/hooks.json", "craftsman.config.json", ".claude/settings.json", ".claude/settings.local.json"]);
});

test("self-protect: namesSelfScoped matches exact names, suffixes, directories and globs", () => {
  const hits = (entries) => namesSelfScoped(entries);
  assert.deepEqual(hits(["hooks/hooks.json"]), ["hooks/hooks.json"]);
  assert.deepEqual(hits(["pkg/hooks/hooks.json"]), ["hooks/hooks.json"]);
  assert.deepEqual(hits(["./craftsman.config.json"]), ["craftsman.config.json"]);
  assert.deepEqual(hits([".claude/settings.json"]), [".claude/settings.json"]);
  assert.deepEqual(hits(["**"]), [...SELF_SCOPED]);
  assert.deepEqual(hits([".claude/**"]), [".claude/settings.json", ".claude/settings.local.json"]);
  assert.deepEqual(hits([".claude/*"]), [".claude/settings.json", ".claude/settings.local.json"]);
  assert.deepEqual(hits([".claude"]), [".claude/settings.json", ".claude/settings.local.json"]);
  assert.deepEqual(hits(["*.json"]), ["craftsman.config.json"]);
  assert.deepEqual(hits(["hooks"]), ["hooks/hooks.json"]);
  assert.deepEqual(hits(["."]), [...SELF_SCOPED]);
});

test("self-protect: ordinary write entries name nothing", () => {
  for (const entry of ["src/a.ts", "scripts/pre-guard.mjs", "docs/plans/p.md", "scripts/*.mjs", "hooks/register.js", ".claudeignore"]) {
    assert.deepEqual(namesSelfScoped([entry]), [], entry);
  }
});

test("self-protect: every safety config key exists in the shipped config and the env pattern matches what it should", () => {
  const shipped = JSON.parse(fs.readFileSync(new URL("../../craftsman.config.json", import.meta.url), "utf8"));
  for (const key of SAFETY_CONFIG_KEYS) {
    const value = key.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), shipped);
    assert.notEqual(value, undefined, `${key} is a real key of craftsman.config.json`);
  }
  for (const name of ["NODE_OPTIONS", "NODE_PATH", "PATH", "CLAUDE_PLUGIN_ROOT", "CRAFTSMAN", "CRAFTSMAN_SAFETY", "craftsman_x"]) assert.match(name, SAFETY_ENV, name);
  for (const name of ["DEBUG", "MY_PATH", "NODE_ENV", "PATHEXT"]) assert.doesNotMatch(name, SAFETY_ENV, name);
});

test("self-protect: safetyProjection reads dotted keys and the settings env", () => {
  const cfg = safetyProjection("craftsman.config.json", { execution: { agentMode: "root-only", maxSubagents: 2 }, enabled: true });
  assert.equal(cfg["execution.agentMode"], "root-only");
  assert.equal(cfg.enabled, true);
  assert.equal(cfg["execution.engine"], null);
  const st = safetyProjection(".claude/settings.json", { env: { NODE_OPTIONS: "x", DEBUG: "1" } });
  assert.deepEqual(st.env, { NODE_OPTIONS: "x" });
});

test("self-protect: scope.mjs and pre-guard.mjs import the list; no second copy remains", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  for (const file of ["../scope.mjs", "../pre-guard.mjs"]) {
    const source = read(file);
    assert.match(source, /from "\.\/lib\/self-protect\.mjs"/, file);
    assert.doesNotMatch(source, /const SELF_SCOPED\s*=/, `${file} keeps no copy of the list`);
  }
  assert.doesNotMatch(read("../scope.mjs"), /"hooks\/hooks\.json",\s*"craftsman\.config\.json"/);
});
