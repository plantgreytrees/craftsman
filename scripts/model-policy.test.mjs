// model-policy.mjs guards two things that used to drift apart silently:
// an agent's own `model:` frontmatter, and the model a *command's prose* tells
// the model to run that agent on. plan.md said `fable` while plan-reviewer.md
// declared `haiku` — both files individually valid, only the pair wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "model-policy.mjs");
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixture({ agent = "model: haiku", command }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-model-policy-"));
  fs.mkdirSync(path.join(dir, "agents"), { recursive: true });
  fs.mkdirSync(path.join(dir, "commands"), { recursive: true });
  fs.writeFileSync(path.join(dir, "agents", "plan-reviewer.md"), `---\nname: plan-reviewer\n${agent}\n---\nReview plans.\n`);
  fs.writeFileSync(path.join(dir, "commands", "plan.md"), `---\nmodel: sonnet\n---\n${command}\n`);
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
}

function withFixture(options, fn) {
  const dir = fixture(options);
  try { fn(run(dir)); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("model-policy: prose that runs an agent on a different model than it declares fails", () => {
  withFixture({ command: "Delegate `plan-reviewer` on `fable` with each unit's Background." }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /plan-reviewer.*fable.*declares haiku/);
  });
});

test("model-policy: prose that agrees with the agent's frontmatter passes", () => {
  withFixture({ command: "Delegate `plan-reviewer` on `haiku` with each unit's Background." }, (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

test("model-policy: an agent reference with no model beside it is left alone", () => {
  withFixture({ command: "Consolidate `plan-reviewer`'s ACCEPTANCE CRITERIA block into acceptance.md." }, (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

test("model-policy: an unsupported model in frontmatter still fails", () => {
  withFixture({ agent: "model: gpt-4", command: "Delegate `plan-reviewer` with the plan." }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsupported model gpt-4/);
  });
});

test("model-policy: this plugin's own commands and agents agree", () => {
  const result = run(PLUGIN_ROOT);
  assert.equal(result.status, 0, result.stderr);
});
