import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
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

// 7.2: SessionStart says whether the guards are on, and if not, why (ARCH-SAFETY-04).
function startState(dir, { env = {}, setup } = {}) {
  spawnSync("git", ["init", "-q"], { cwd: dir });
  setup?.(dir);
  const childEnv = { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env };
  for (const key of ["CRAFTSMAN", "CRAFTSMAN_SAFETY", "CLAUDE_CODE_SESSION_ID"]) if (!(key in env)) delete childEnv[key];
  const r = spawnSync(process.execPath, [SESSION_CONTEXT], { cwd: dir, input: JSON.stringify({ session_id: "guard-state" }), encoding: "utf8", env: childEnv });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  return { message: out.systemMessage || "", context: out.hookSpecificOutput?.additionalContext || "" };
}

test("session-context: guards on is one short line of context and no user-facing message", () => {
  withProject((dir) => {
    const { message, context } = startState(dir);
    assert.match(context, /^craftsman guards: on\./m);
    assert.equal(message, "");
  });
});

for (const [name, reason, options] of [
  ["CRAFTSMAN=off", "CRAFTSMAN=off is set in the environment", { env: { CRAFTSMAN: "off" } }],
  [".craftsman/off", ".craftsman/off exists", { setup: (dir) => { fs.mkdirSync(path.join(dir, ".craftsman")); fs.writeFileSync(path.join(dir, ".craftsman", "off"), ""); } }],
  ["enabled:false", "enabled is false in craftsman.config.json", { setup: (dir) => fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ enabled: false })) }],
]) {
  test(`session-context: ${name} turns off the quality machinery only, and says the safety guards stay on`, () => {
    withProject((dir) => {
      const { message, context } = startState(dir, options);
      const escaped = reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(message, new RegExp(`craftsman quality, doc and tracker gates off: .*${escaped}.*safety guards stay on`));
      assert.match(context, /safety guards stay on/);
      assert.doesNotMatch(message + context, /craftsman guards off/);
    });
  });
}

test("session-context: CRAFTSMAN_SAFETY=off is the one thing reported as guards off", () => {
  withProject((dir) => {
    const { message, context } = startState(dir, { env: { CRAFTSMAN_SAFETY: "off" } });
    assert.match(message, /craftsman guards off: CRAFTSMAN_SAFETY=off is set in the environment/);
    assert.match(context, /craftsman guards off:/);
    assert.doesNotMatch(context, /craftsman guards: on/);
  });
});

test("session-context: a node-missing marker left by hooks/run.sh earlier in this session is reported", () => {
  withProject((dir) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-launcher-tmp-"));
    try {
      const marker = path.join(tmp, `craftsman-launcher-${process.getuid?.() ?? 0}`, "node-missing-guard-state");
      fs.mkdirSync(marker, { recursive: true });
      const { message } = startState(dir, { env: { TMPDIR: tmp } });
      assert.match(message, /craftsman guards off: .*node was missing earlier this session/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
