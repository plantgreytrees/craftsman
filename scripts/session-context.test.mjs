import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Target 3072; set to the measured size and only lowered from here.
const CAP_BYTES = 3072;
const SESSION_CONTEXT = path.join(ROOT, "session-context.mjs");

function run(script, dir, input) {
  return spawnSync(process.execPath, [script], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

function withProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-session-context-"));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("session-context: a session opened above a repo, with no workspace manifest, is off with one notice", () => {
  withProject((dir) => {
    fs.mkdirSync(path.join(dir, "repo"));
    spawnSync("git", ["init", "-q"], { cwd: path.join(dir, "repo") });
    const result = run(SESSION_CONTEXT, dir, { session_id: "above" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^craftsman off: .* is not a git repository/);
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman")), false, "no state is written for an unanchored root");
  });
});

test("session-context: SessionStart pins the root for Bash-run scripts", () => {
  withProject((dir) => {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const sid = `pin-session-${process.pid}`;
    const pin = path.join(os.tmpdir(), "craftsman-roots", sid);
    try {
      assert.equal(run(SESSION_CONTEXT, dir, { session_id: sid }).status, 0);
      assert.equal(fs.readFileSync(pin, "utf8").trim(), path.resolve(dir));
    } finally { fs.rmSync(pin, { force: true }); }
  });
});

test("session-context: SessionStart removes merged, clean leftover worktrees and keeps dirty ones", () => {
  withProject((dir) => {
    const git = (cwd, ...args) => {
      const r = spawnSync("git", args, { cwd, encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    };
    git(dir, "init", "-q", "-b", "main");
    git(dir, "-c", "user.email=t@e", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
    const clean = path.join(dir, ".worktrees", "clean");
    const dirty = path.join(dir, ".worktrees", "dirty");
    git(dir, "worktree", "add", "-q", "-b", "feat/clean", clean);
    git(dir, "worktree", "add", "-q", "-b", "feat/dirty", dirty);
    fs.writeFileSync(path.join(dirty, "wip.txt"), "wip\n");

    const result = run(SESSION_CONTEXT, dir, { session_id: "sweeper" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(clean), false, "merged clean worktree must be removed at SessionStart");
    assert.equal(fs.existsSync(dirty), true, "a worktree with uncommitted changes is never removed");
    assert.match(result.stdout, /WORKTREES SWEPT/);
  });
});

test("session-context: the HAND-OFF line carries the plan's level and adds no line", () => {
  withProject((dir) => {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "big-epic.md"), "---\nslug: big-epic\nlevel: epic\n---\n");
    const session = path.join(dir, ".craftsman", "sessions", "lvl");
    fs.mkdirSync(session, { recursive: true });
    const handoff = (plan) => fs.writeFileSync(path.join(session, "handoff.json"), JSON.stringify({ plan, unit: "u", next_action: "go", completed_units: [], remaining_units: [] }));
    const context = () => JSON.parse(run(SESSION_CONTEXT, dir, { session_id: "lvl" }).stdout).hookSpecificOutput.additionalContext;
    handoff("big-epic");
    const withLevel = context();
    assert.match(withLevel, /HAND-OFF RESTORED .*: plan big-epic \(epic\); unit u;/);
    handoff("unindexed");
    const bare = context();
    assert.match(bare, /plan unindexed; unit u;/);
    assert.equal(withLevel.split("\n").length, bare.split("\n").length, "no new lines");
  });
});

test("ARCH-SLIM-10: the SessionStart additionalContext stays under its byte cap", () => {
  withProject((dir) => {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const out = JSON.parse(run(SESSION_CONTEXT, dir, { session_id: "cap" }).stdout);
    const bytes = Buffer.byteLength(out.hookSpecificOutput.additionalContext);
    assert.ok(bytes <= CAP_BYTES, `additionalContext is ${bytes} bytes, cap ${CAP_BYTES}`);
  });
});
