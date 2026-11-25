// ARCH-SAFETY-05: quoted separators, variable command words and sed w/W cannot hide a write of craftsman state.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GUARD = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "pre-guard.mjs",
);

function run(command) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-writes-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    return spawnSync(process.execPath, [GUARD], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({
        session_id: "writestest",
        tool_name: "Bash",
        tool_input: { command },
      }),
    }).status;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const BLOCKED = [
  "sed -e 's/a/b/;s/c/d/' -i .claude/settings.json",
  "sed 's/a/b/;s/c/d/' -i craftsman.config.json",
  "sed '1d;2d' -i hooks/hooks.json",
  "perl -pe 's/a/b/;' -i hooks/hooks.json",
  "sed -e '/x/{s/a/b/;}' --in-place=.bak craftsman.config.json",
  "sed 's/a/b/;s/c/d/' -i .craftsman/off",
  "x=sed; $x -i 's/x/y/' .claude/settings.json",
  "x=sed; \"$x\" -i 's/x/y/' .claude/settings.json",
  "x=sed; ${x} --in-place 's/x/y/' .claude/settings.json",
  "p=perl; $p -pi -e 's/x/y/' .claude/settings.json",
  "sed 's/a/b/w.claude/settings.json' x",
  "sed 's/a/b/whooks/hooks.json' x",
  "sed -n 'W craftsman.config.json' x",
  "sed -n 'Whooks/hooks.json' x",
  "sed -n '1Wcraftsman.config.json' x",
];
for (const command of BLOCKED)
  test(`blocked: ${command}`, () => assert.equal(run(command), 2));

for (const command of [
  "sed -n 1,5p README.md",
  'grep -n "sed -i" scripts/x.mjs; cat craftsman.config.json',
]) {
  test(`allowed: ${command}`, () => assert.equal(run(command), 0));
}

// The doc-guard refusal names the fix that applies: a session that already ran a doc-writing command is told to re-grant,
// not to hand the change to /plan (ARCH-STATE-16: the exit code and the decision are unchanged).
function runDocWrite(tool, toolInput, { recorded = null, unitScope = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-docguard-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    fs.writeFileSync(
      path.join(dir, "craftsman.config.json"),
      JSON.stringify({ docWriteGuard: { enabled: true, docPaths: ["docs/**"] } }),
    );
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "notes.md"), "# notes\n");
    if (recorded) {
      const sdir = path.join(dir, ".craftsman", "sessions", "docguardtest");
      fs.mkdirSync(sdir, { recursive: true });
      fs.writeFileSync(
        path.join(sdir, "commands.json"),
        JSON.stringify({ [recorded]: { via: "skill", at: new Date().toISOString() } }) + "\n",
      );
    }
    let cwd = dir;
    if (unitScope) {
      // A live unit scope: manifest in the session dir, worktree_path an existing directory holding the same
      // guarded doc, the call running inside it (ARCH-STATE-18).
      const wt = path.join(dir, ".worktrees", "unit");
      fs.mkdirSync(path.join(wt, "docs"), { recursive: true });
      fs.writeFileSync(path.join(wt, "docs", "notes.md"), "# notes\n");
      fs.copyFileSync(path.join(dir, "craftsman.config.json"), path.join(wt, "craftsman.config.json"));
      spawnSync("git", ["init", "-q"], { cwd: wt });
      cwd = wt;
      const sdir = path.join(dir, ".craftsman", "sessions", "docguardtest");
      fs.mkdirSync(sdir, { recursive: true });
      fs.writeFileSync(
        path.join(sdir, "scope-aaaaaaaaaaaaaaaa.json"),
        JSON.stringify({
          plan: "docs/plans/p.md", unit: "unit", project: ".", project_root: wt, worktree_path: wt,
          scope: { read: [], docs: [], write: ["docs/notes.md"] }, arch: [],
        }) + "\n",
      );
    }
    const r = spawnSync(process.execPath, [GUARD], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({
        session_id: "docguardtest",
        tool_name: tool,
        tool_input: toolInput,
      }),
    });
    return { status: r.status, stderr: r.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const docWrite = (opts) =>
  runDocWrite("Write", { file_path: "docs/notes.md", content: "x" }, opts);

test("doc-guard deny after a recorded doc writer names the re-grant, not /plan", () => {
  const r = docWrite({ recorded: "orchestrate" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /doc-write\.mjs" on/);
  assert.doesNotMatch(r.stderr, /Hand the change to/);
});

test("doc-guard deny with no recorded doc writer keeps the /craftsman:plan redirect", () => {
  const r = docWrite();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Hand the change to \/craftsman:plan/);
});

test("Bash doc-guard ask after a recorded doc writer names the re-grant, not /plan", () => {
  const r = runDocWrite("Bash", { command: "rm docs/notes.md" }, { recorded: "plan" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /doc-write\.mjs" on/);
  assert.doesNotMatch(r.stderr, /Hand the change to/);
});

test("doc-guard deny with a recorded doc writer AND an active unit scope keeps the /plan redirect, not the re-grant", () => {
  const w = docWrite({ recorded: "orchestrate", unitScope: true });
  assert.equal(w.status, 2);
  assert.match(w.stderr, /Hand the change to \/craftsman:plan/);
  assert.doesNotMatch(w.stderr, /already ran a doc-writing command/);
  const b = runDocWrite("Bash", { command: "rm docs/notes.md" }, { recorded: "plan", unitScope: true });
  assert.equal(b.status, 2);
  assert.match(b.stderr, /Hand the change to \/craftsman:plan/);
  assert.doesNotMatch(b.stderr, /already ran a doc-writing command/);
});

test("Bash doc-guard ask with no recorded doc writer keeps the /craftsman:plan redirect", () => {
  const r = runDocWrite("Bash", { command: "rm docs/notes.md" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Hand the change to \/craftsman:plan/);
});
