import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findGateCommand } from "./gate-command.mjs";
import { deepMerge } from "./core.mjs";

const defaults = { stopGate: { commands: { justfile: "just check", "package.json": "npm test --silent", "go.mod": "go test ./..." } } };
const tree = (...files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-cmd-"));
  for (const f of files) fs.writeFileSync(path.join(dir, f), "{}");
  return dir;
};
const has = (...targets) => ({ onPath: () => true, justTargets: () => targets });

test("gate-command: a project config declaring only package.json still resolves past a justfile with no check recipe", () => {
  const cfg = deepMerge(defaults, { stopGate: { commands: { "package.json": "pnpm -s test" } } });
  const dir = tree("package.json", "justfile");
  assert.equal(findGateCommand(dir, cfg, has("build")), "pnpm -s test");
});

test("gate-command: a missing just binary falls through", () => {
  const dir = tree("package.json", "justfile");
  assert.equal(findGateCommand(dir, defaults, { onPath: (b) => b !== "just", justTargets: () => ["check"] }), "npm test --silent");
});

test("gate-command: a null or empty marker is skipped, not returned", () => {
  const dir = tree("package.json", "go.mod");
  assert.equal(findGateCommand(dir, deepMerge(defaults, { stopGate: { commands: { justfile: null, "package.json": null } } }), has()), "go test ./...");
  assert.equal(findGateCommand(dir, deepMerge(defaults, { stopGate: { commands: { "package.json": "" } } }), has()), "go test ./...");
  assert.equal(findGateCommand(tree("package.json"), deepMerge(defaults, { stopGate: { commands: { "package.json": null } } }), has()), null);
});

test("gate-command: a justfile whose just --summary lists check resolves to just check", () => {
  const dir = tree("package.json", "justfile");
  assert.equal(findGateCommand(dir, defaults, has("build", "check")), "just check");
});

test("gate-command: nothing detected is null", () => {
  assert.equal(findGateCommand(tree(), defaults, has("check")), null);
});
