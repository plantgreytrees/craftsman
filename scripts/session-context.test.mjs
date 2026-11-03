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
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(`${dir}-remote.git`, { recursive: true, force: true }); }
}

test("session-context: a session opened above a repo, with no workspace manifest, is off with one notice", () => {
  withProject((dir) => {
    fs.mkdirSync(path.join(dir, "repo"));
    spawnSync("git", ["init", "-q"], { cwd: path.join(dir, "repo") });
    const result = run(SESSION_CONTEXT, dir, { session_id: "above" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^craftsman off: .* is not a git repository/);
    assert.match(result.stdout, /the quality, doc and tracker gates are off; the safety guards stay on/);
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
    // merged means merged into a pushed remote-tracking base (ARCH-SAFETY-07)
    const bare = `${dir}-remote.git`;
    spawnSync("git", ["init", "-q", "--bare", bare]);
    git(dir, "remote", "add", "origin", bare);
    git(dir, "push", "-q", "-u", "origin", "main");
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

// ARCH-AUTO-11: SessionStart re-arms scope-required on resume only for a hand-off that still lists
// units to run; a closing hand-off (nothing left) used to lock a later /architect out of every Read.
function resumeMarker(dir, sid, handoff) {
  const session = path.join(dir, ".craftsman", "sessions", sid);
  fs.mkdirSync(session, { recursive: true });
  if (handoff) fs.writeFileSync(path.join(session, "handoff.json"), JSON.stringify(handoff));
  const result = run(SESSION_CONTEXT, dir, { session_id: sid });
  assert.equal(result.status, 0, result.stderr);
  return fs.existsSync(path.join(session, "scope-required"));
}

test("session-context: a hand-off listing remaining units re-arms scope-required (ARCH-AUTO-11)", () => {
  withProject((dir) => {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const handoff = { plan: "p", unit: "u1", next_action: "go", completed_units: [], remaining_units: ["u2"] };
    assert.equal(resumeMarker(dir, "resume-open", handoff), true);
  });
});

const closing = { plan: "p", unit: "u1", next_action: "done", completed_units: ["u1"] };
for (const [name, handoff] of [
  ["a closing hand-off (remaining_units is empty)", { ...closing, remaining_units: [] }],
  ["a hand-off without the remaining_units field", closing],
  ["a hand-off whose remaining_units is not an array", { ...closing, remaining_units: "u2" }],
  ["no hand-off at all", null],
]) {
  test(`session-context: ${name} arms nothing (ARCH-AUTO-11)`, () => {
    withProject((dir) => {
      spawnSync("git", ["init", "-q"], { cwd: dir });
      assert.equal(resumeMarker(dir, "resume-none", handoff), false);
    });
  });
}

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

// Round 5 (38.1): the reason names the file the value came from.
for (const [files, expected, unexpected] of [
  [{ "craftsman.project.json": { enabled: false } }, "enabled is false in craftsman.project.json", /craftsman\.config\.json/],
  [{ "craftsman.config.json": { enabled: false }, "craftsman.project.json": { enabled: false } }, "enabled is false in craftsman.config.json and craftsman.project.json", null],
]) {
  test(`session-context: enabled:false from ${Object.keys(files).join(" and ")} is attributed to ${Object.keys(files).length > 1 ? "both files" : "that file"} (38.1)`, () => {
    withProject((dir) => {
      const { message } = startState(dir, { setup: (d) => { for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(d, name), JSON.stringify(value)); } });
      assert.ok(message.includes(expected), `${expected} in: ${message}`);
      if (unexpected) assert.doesNotMatch(message, unexpected);
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

// 13.2: one line when the sandbox is enabled in no settings scope (ARCH-SAFETY-01 leaves those protections to it).
function sandboxNotice(setup) {
  let notice = "";
  withProject((dir) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-sandbox-home-"));
    const managed = path.join(home, "managed");
    fs.mkdirSync(managed);
    try {
      const { context } = startState(dir, {
        setup: (d) => setup?.({ dir: d, home, managed }),
        env: { CLAUDE_CONFIG_DIR: path.join(home, "user"), HOME: home, CRAFTSMAN_MANAGED_SETTINGS_DIR: managed },
      });
      notice = context.split("\n").filter((l) => /sandbox/i.test(l)).join("\n");
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
  return notice;
}

test("session-context: one line says the sandbox is enabled in no settings scope", () => {
  const notice = sandboxNotice();
  assert.match(notice, /the Claude Code sandbox is not enabled in any settings scope/);
  assert.match(notice, /\/craftsman:init/);
  assert.equal(notice.split("\n").length, 1);
});

test("session-context: no sandbox line when project settings, user settings or a managed file enable it", () => {
  const enable = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ sandbox: { enabled: true } })); };
  assert.equal(sandboxNotice(({ dir }) => enable(path.join(dir, ".claude", "settings.json"))), "");
  assert.equal(sandboxNotice(({ home }) => enable(path.join(home, "user", "settings.json"))), "");
  assert.equal(sandboxNotice(({ managed }) => enable(path.join(managed, "managed-settings.json"))), "");
});

// A sandbox that is on but half-configured pushes git, docker and registry calls into unsandboxed
// retries that auto mode refuses: SessionStart names what is missing, in one line.
function enableSandbox(dir, extra = {}) {
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ sandbox: { enabled: true, ...extra } }));
}

test("session-context: sandbox on with a git host that is not allowed gets one gap line naming the host", () => {
  const notice = sandboxNotice(({ dir }) => {
    enableSandbox(dir);
    spawnSync("git", ["remote", "add", "origin", "https://github.com/o/r.git"], { cwd: dir });
  });
  assert.match(notice, /^craftsman: the Claude Code sandbox is on, but github\.com is not in sandbox\.network\.allowedDomains/);
  assert.match(notice, /dangerouslyDisableSandbox/);
  assert.equal(notice.split("\n").length, 1);
});

test("session-context: sandbox on with compose files and no docker exclusion, and a malformed exclusion, are named too", () => {
  const notice = sandboxNotice(({ dir }) => {
    enableSandbox(dir, { excludedCommands: ["build/, docs/plans/, src/**"] });
    fs.writeFileSync(path.join(dir, "docker-compose.yml"), "services: {}\n");
  });
  assert.match(notice, /docker/);
  assert.match(notice, /build\/, docs\/plans\//);
  assert.equal(notice.split("\n").length, 1);
});

test("session-context: no gap line when the sandbox is on and the host, docker and exclusions are in order", () => {
  assert.equal(sandboxNotice(({ dir }) => {
    enableSandbox(dir, { network: { allowedDomains: ["github.com"] }, excludedCommands: ["docker compose *"] });
    spawnSync("git", ["remote", "add", "origin", "git@github.com:o/r.git"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "compose.yaml"), "services: {}\n");
  }), "");
  assert.equal(sandboxNotice(({ dir }) => enableSandbox(dir)), "", "no remote and no compose file: nothing to report");
});

// 13.3a: SessionStart records the hash of every guarded doc.
test("session-context: SessionStart snapshots the hash of every guarded doc", () => {
  withProject((dir) => {
    startState(dir, {
      setup: (d) => {
        fs.mkdirSync(path.join(d, "docs", "plans"), { recursive: true });
        fs.writeFileSync(path.join(d, "docs", "plans", "a.md"), "# a\n");
        fs.mkdirSync(path.join(d, "docs", "architecture"), { recursive: true });
        fs.writeFileSync(path.join(d, "docs", "architecture", "x.rules.md"), "# x\n");
        fs.writeFileSync(path.join(d, "app.js"), "1\n");
      },
    });
    const snap = JSON.parse(fs.readFileSync(path.join(dir, ".craftsman", "sessions", "guard-state", "doc-snapshot.json"), "utf8"));
    assert.deepEqual(Object.keys(snap.docs).sort(), ["docs/architecture/x.rules.md", "docs/plans/a.md"]);
    assert.match(snap.docs["docs/plans/a.md"], /^[0-9a-f]{40}$/);
    assert.equal("status" in snap, false, "nothing in the snapshot that Stop never reads");
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

test("ARCH-APPROVAL-05: SessionStart names approved-but-unlanded runs in one line, and only then", () => {
  withProject((dir) => {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const ctx = () => JSON.parse(run(SESSION_CONTEXT, dir, { session_id: "appr" }).stdout).hookSpecificOutput.additionalContext;
    assert.doesNotMatch(ctx(), /APPROVED, NOT LANDED/);
    const d = path.join(dir, ".craftsman", "approvals");
    fs.mkdirSync(d, { recursive: true });
    const rec = (run, status) => fs.writeFileSync(path.join(d, `${run}.json`), JSON.stringify({ run, plan: "p", status, choice: "merge", url: "u" }));
    rec("p-a", "decided");
    rec("p-b", "landed");
    rec("p-c", "requested");
    const lines = ctx().split("\n").filter((l) => l.includes("APPROVED, NOT LANDED"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /p-a/);
    assert.doesNotMatch(lines[0], /p-b|p-c/);
  });
});

// One predicate (handoffArmsScope, lib/core.mjs) decides arming for SessionStart and for account-switch adopt;
// two inline copies are how adopt came to arm a closing hand-off that SessionStart left alone.
test("handoffArmsScope: true only for a hand-off whose remaining_units is a non-empty array (ARCH-AUTO-11)", async () => {
  const { handoffArmsScope } = await import("./lib/core.mjs");
  for (const [handoff, armed] of [
    [{ remaining_units: ["u2"] }, true],
    [{ remaining_units: [] }, false],
    [{}, false],
    [{ remaining_units: "u2" }, false],
    [{ remaining_units: null }, false],
    [{ remaining_units: { length: 1 } }, false],
    [null, false],
    [undefined, false],
  ]) {
    assert.equal(handoffArmsScope(handoff), armed, JSON.stringify(handoff));
  }
});

test("session-context and account-switch both arm through handoffArmsScope, with no inline copy (ARCH-AUTO-11)", () => {
  for (const file of ["session-context.mjs", "account-switch.mjs"]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, /import\s*\{[^}]*\bhandoffArmsScope\b[^}]*\}\s*from "\.\/lib\/core\.mjs"/, `${file} imports it`);
    assert.match(source, /\bhandoffArmsScope\(/, `${file} calls it`);
    assert.doesNotMatch(source, /remaining_units\??\.length/, `${file} keeps no inline copy of the rule`);
  }
});
