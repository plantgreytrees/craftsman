// The fixes-and-safety docs: every new config key has a safe default and a README row, the README says what is
// enforced where and by which off switch, the version line follows the changelog, and the safety rules are
// complete and listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const config = JSON.parse(read("craftsman.config.json"));
const readme = read("README.md");
const safetySection = readme.match(/^## Safety\n([\s\S]*?)(?=^## )/m)?.[1] ?? "";

// 21.0: every key the safety steps added ships with its safe default (today's behaviour unless a step said otherwise).
const NEW_KEYS = [
  ["stopGate.blockOnUnpushed", (c) => c.stopGate?.blockOnUnpushed, false],
  ["stopGate.markdownTests", (c) => c.stopGate?.markdownTests, []],
  ["worktrees.sweepClaudeWorktrees", (c) => c.worktrees?.sweepClaudeWorktrees, false],
];

test("every config key the safety steps added is in craftsman.config.json with its safe default", () => {
  for (const [key, get, expected] of NEW_KEYS) assert.deepEqual(get(config), expected, key);
  const disposable = config.worktrees?.disposable;
  assert.ok(Array.isArray(disposable) && disposable.length > 0, "worktrees.disposable");
  for (const dir of ["node_modules", "dist", "build", "target", "coverage", ".cache"]) assert.ok(disposable.some((p) => p.includes(`/${dir}/`)), `${dir} is disposable`);
  assert.ok(!disposable.some((p) => /\.env|\.db|\/data\//.test(p)), "nothing that looks like local data is disposable");
});

test("README has a Safety section with a row for every new key, env var and recovery step", () => {
  assert.ok(safetySection.length > 500, "README has a ## Safety section");
  for (const needle of ["stopGate.blockOnUnpushed", "stopGate.markdownTests", "worktrees.disposable", "worktrees.sweepClaudeWorktrees", "CRAFTSMAN_SAFETY", "CRAFTSMAN=off",
    ".craftsman/sweep-log.jsonl", "git branch <name> <sha>", "goal-token", "--settings-diff", "sandbox", "node is missing"]) {
    assert.ok(safetySection.includes(needle), `README Safety mentions ${needle}`);
  }
});

test("README names the minimum Claude Code versions and says which features are feature-detected", () => {
  assert.match(safetySection, /\| `onFailure` hook field \|[^|\n]*\| 2\.1\.295 \|/);
  assert.match(safetySection, /feature-detected, never version-matched/);
  assert.match(safetySection, /2\.1\.306/);
});

test("README never says CRAFTSMAN=off or /craftsman:toggle off turns everything off", () => {
  assert.doesNotMatch(readme, /Turn everything off with/);
  assert.match(readme, /safety guards stay on/);
});

test("README's version line is the newest CHANGELOG release", () => {
  const release = read("CHANGELOG.md").match(/^## \[(\d+\.\d+\.\d+)\]/m)[1];
  assert.equal(readme.match(/^\*\*v(\d+\.\d+\.\d+)\*\*/m)?.[1], release);
});

test("/craftsman:toggle says CRAFTSMAN=off switches off the quality side only, and the safety switch is CRAFTSMAN_SAFETY", () => {
  for (const rel of ["commands/toggle.md", "scripts/toggle.mjs"]) {
    const text = read(rel);
    assert.doesNotMatch(text, /disables everything|also disables everything/i, rel);
    assert.match(text, /CRAFTSMAN_SAFETY/, rel);
  }
});

test("safety.rules.md holds ARCH-SAFETY-01 through 11, each decided with a check and a cite, and safety.md has a row for each", () => {
  const rules = read("docs/architecture/safety.rules.md");
  const human = read("docs/architecture/safety.md");
  for (let n = 1; n <= 11; n++) {
    const id = `ARCH-SAFETY-${String(n).padStart(2, "0")}`;
    const line = rules.split("\n").find((l) => l.includes(`**${id}**`));
    assert.ok(line, `${id} in safety.rules.md`);
    assert.match(line, /\[decided\]/, id);
    assert.match(line, /— check: .+ — cite: \S+:\d+/, `${id} has a check and a cite`);
    assert.ok(human.includes(`| ${id} |`), `${id} in safety.md`);
  }
});

test("docs/architecture/README.md lists the safety area", () => {
  assert.match(read("docs/architecture/README.md"), /\[safety\]\(\.\/safety\.md\)/);
});

// The fixes-and-safety entries shipped in 2.3.0.
test("CHANGELOG 2.3.0 has one entry per feature area, including the steps 24-26 reconciliation", () => {
  const unreleased = read("CHANGELOG.md").match(/^## \[2\.3\.0\][^\n]*\n([\s\S]*?)(?=^## \[)/m)[1];
  assert.match(unreleased, /### Fixed/);
  assert.match(unreleased, /### Added/);
  assert.match(unreleased, /guard-failclosed|steps? 24/i);
  for (const area of ["launcher", "sweep", "goal", "sandbox", "unpushed", "release"]) assert.match(unreleased, new RegExp(area, "i"), area);
});
