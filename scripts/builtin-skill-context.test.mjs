import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(ROOT, "builtin-skill-context.mjs");

function run(dir, skill) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: dir,
    input: JSON.stringify({ session_id: "s1", tool_name: "Skill", tool_input: { skill } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

function tmpProject() {
  // A git root: a non-git CLAUDE_PROJECT_DIR is "above a repo" and leaves craftsman off.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-builtin-skill-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

test("builtin-skill-context: wraps built-in code-review with standards, ARCH rules and open criteria", () => {
  const dir = tmpProject();
  try {
    fs.mkdirSync(path.join(dir, "docs", "standards"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs", "architecture"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "standards", "errors.md"), "# errors\n");
    fs.writeFileSync(path.join(dir, "docs", "architecture", "tracker.rules.md"), "# rules\n");
    fs.writeFileSync(path.join(dir, "docs", "architecture", "tracker.md"), "# human doc\n");
    fs.writeFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [x] done one\n- [ ] [unit:u1] still open\n");
    const result = run(dir, "code-review");
    assert.equal(result.status, 0);
    const ctx = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(ctx.hookEventName, "PreToolUse");
    assert.match(ctx.additionalContext, /built-in \/code-review/);
    assert.match(ctx.additionalContext, /docs\/standards\/errors\.md/);
    assert.match(ctx.additionalContext, /docs\/architecture\/tracker\.rules\.md/);
    assert.doesNotMatch(ctx.additionalContext, /tracker\.md[,.]/, "only *.rules.md, never the human area doc");
    assert.match(ctx.additionalContext, /\[unit:u1\] still open/);
    assert.doesNotMatch(ctx.additionalContext, /done one/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("builtin-skill-context: simplify gets the scope and behaviour rule even with no docs", () => {
  const dir = tmpProject();
  try {
    const result = run(dir, "simplify");
    assert.equal(result.status, 0);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /scope manifest/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("builtin-skill-context: craftsman's own and unrelated skills pass through silently", () => {
  const dir = tmpProject();
  try {
    for (const skill of ["craftsman:scrutinise", "craftsman:code-review", "loop", ""]) {
      const result = run(dir, skill);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, "", `no context for ${skill || "(empty)"}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
