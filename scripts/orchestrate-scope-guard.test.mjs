import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sidOf } from "./lib/core.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(ROOT, "orchestrate-scope-guard.mjs");

function run(dir, input) {
  return spawnSync(process.execPath, [GUARD], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

function tmpProject() {
  // A git root: a non-git CLAUDE_PROJECT_DIR is "above a repo" and leaves craftsman off.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scope-guard-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

// scope.mjs's requiredFile() resolves PROJECT_ROOT from core.mjs at import
// time in *this* process, so it can't track a spawned hook's own
// CLAUDE_PROJECT_DIR — mirror the marker path by hand instead.
function requiredFile(dir, input) {
  return path.join(dir, ".craftsman", "sessions", sidOf(input), "scope-required");
}

test("orchestrate-scope-guard: invoking /orchestrate marks scope required, even if the command forgets to", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", tool_name: "Skill", tool_input: { skill: "orchestrate", args: "docs/plans/example.md" } };
  try {
    const result = run(dir, input);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: the craftsman: namespaced form also marks scope required", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", tool_name: "Skill", tool_input: { skill: "craftsman:orchestrate", args: "docs/plans/example.md" } };
  try {
    run(dir, input);
    assert.equal(fs.existsSync(requiredFile(dir, input)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: a user-typed /orchestrate marks scope required (UserPromptSubmit, no tool call)", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "/orchestrate docs/plans/example.md" };
  try {
    const result = run(dir, input);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: a prompt that merely mentions /orchestrate does not arm the guard", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "why did /orchestrate block my edit?" };
  try {
    const result = run(dir, input);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: an unrelated slash command never touches the scope-required marker", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", tool_name: "Skill", tool_input: { skill: "plan", args: "add a feature" } };
  try {
    const result = run(dir, input);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// /plan writes acceptance.md, so only the planning session ever owned it and
// the executing session's Stop gate never enforced a single criterion.
test("orchestrate-scope-guard: invoking /orchestrate adopts the plan's acceptance criteria for this session", () => {
  const dir = tmpProject();
  const input = { session_id: "executor", prompt: "/orchestrate docs/plans/example.md" };
  try {
    fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [ ] [unit:u1] it works\n");
    const result = run(dir, input);
    assert.equal(result.status, 0);
    const ref = JSON.parse(fs.readFileSync(path.join(dir, ".craftsman", "sessions", sidOf(input), "acceptance.ref"), "utf8"));
    assert.match(ref.identity, /^[0-9a-f]{40}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: /scrutinise adopts the acceptance criteria but never arms scope-required", () => {
  const dir = tmpProject();
  const input = { session_id: "verifier", tool_name: "Skill", tool_input: { skill: "craftsman:scrutinise", args: "docs/plans/example.md" } };
  try {
    fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [ ] whole-plan criterion\n");
    assert.equal(run(dir, input).status, 0);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman", "sessions", sidOf(input), "acceptance.ref")), true);
    assert.equal(fs.existsSync(requiredFile(dir, input)), false, "scrutinise is review-only — no worktree scope requirement");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: a model invocation through the Skill tool arms /orchestrate too", () => {
  const dir = tmpProject();
  const input = { session_id: "s-skill", tool_name: "Skill", tool_input: { skill: "craftsman:orchestrate", args: "docs/plans/example.md" } };
  try {
    assert.equal(run(dir, input).status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: a different command that merely starts with the same name does not adopt", () => {
  const dir = tmpProject();
  const input = { session_id: "s-other", tool_name: "Skill", tool_input: { skill: "craftsman:scrutinise-deep" } };
  try {
    fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [ ] c\n");
    run(dir, input);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman", "sessions", sidOf(input), "acceptance.ref")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ARCH-AUTO-06: /auto is treated like /orchestrate — scope-required, acceptance
// ownership — and also arms the auto-active marker pre-guard reads (LAND-05).
const autoPayloads = {
  typed: { session_id: "auto-typed", prompt: "/auto autonomous-e2e-loop" },
  namespaced: { session_id: "auto-ns", prompt: "/craftsman:auto autonomous-e2e-loop" },
  skill: { session_id: "auto-skill", tool_name: "Skill", tool_input: { skill: "craftsman:auto", args: "autonomous-e2e-loop" } },
  "skill-command-field": { session_id: "auto-command", tool_name: "Skill", tool_input: { command: "/craftsman:auto autonomous-e2e-loop" } },
};
for (const [shape, input] of Object.entries(autoPayloads)) {
  test(`orchestrate-scope-guard: /auto (${shape}) arms scope-required, acceptance ownership and auto-active`, () => {
    const dir = tmpProject();
    try {
      fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [ ] [unit:u1] it works\n");
      assert.equal(run(dir, input).status, 0);
      const session = path.join(dir, ".craftsman", "sessions", sidOf(input));
      assert.equal(fs.existsSync(requiredFile(dir, input)), true, "scope-required armed");
      assert.equal(fs.existsSync(path.join(session, "acceptance.ref")), true, "acceptance adopted");
      assert.equal(fs.existsSync(path.join(session, "auto-active")), true, "auto-active armed");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

test("orchestrate-scope-guard: a prompt that merely mentions /auto, or /automate, arms nothing", () => {
  const dir = tmpProject();
  try {
    for (const prompt of ["please run /auto later", "/automate the thing", "/craftsman:autonomous"]) {
      const input = { session_id: "mention", prompt };
      assert.equal(run(dir, input).status, 0);
      assert.equal(fs.existsSync(requiredFile(dir, input)), false, prompt);
      assert.equal(fs.existsSync(path.join(dir, ".craftsman", "sessions", "mention", "auto-active")), false, prompt);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ARCH-AUTO-09: an epic slug sizes grants from, and re-points the marker to,
// the resolved feature plan — not the parent doc.
test("orchestrate-scope-guard: /auto on an epic slug resolving to two features grants and marks the first feature plan", () => {
  const dir = tmpProject();
  try {
    const plans = path.join(dir, "docs", "plans");
    fs.mkdirSync(plans, { recursive: true });
    fs.writeFileSync(path.join(plans, "big-epic.md"), "---\nslug: big-epic\nlevel: epic\nchildren: [feat-a, feat-b]\n---\n");
    fs.writeFileSync(path.join(plans, "feat-a.md"), "---\nslug: feat-a\nparent: big-epic\nunits:\n  - id: a1\n  - id: a2\n---\n");
    fs.writeFileSync(path.join(plans, "feat-b.md"), "---\nslug: feat-b\nparent: big-epic\nunits:\n  - id: b1\n---\n");
    const input = { session_id: "auto-epic", prompt: "/auto big-epic" };
    assert.equal(run(dir, input).status, 0);
    const session = path.join(dir, ".craftsman", "sessions", "auto-epic");
    assert.equal(JSON.parse(fs.readFileSync(path.join(session, "auto-active"), "utf8")).plan, "feat-a");
    const grants = fs.readdirSync(session).filter((f) => f.includes("runner"));
    assert.equal(grants.length, 1, grants.join());
    assert.equal(fs.readFileSync(path.join(session, grants[0]), "utf8").trim(), "16");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ARCH-AUTO-08: --level/--feature reach plan-index resolve; the grant is every
// resolved feature's units plus one extra per feature.
function epicProject() {
  const dir = tmpProject();
  const plans = path.join(dir, "docs", "plans");
  fs.mkdirSync(plans, { recursive: true });
  fs.writeFileSync(path.join(plans, "big-epic.md"), "---\nslug: big-epic\nlevel: epic\nchildren: [feat-a, feat-b]\n---\n");
  fs.writeFileSync(path.join(plans, "feat-a.md"), "---\nslug: feat-a\nparent: big-epic\nunits:\n  - id: a1\n  - id: a2\n---\n");
  fs.writeFileSync(path.join(plans, "feat-b.md"), "---\nslug: feat-b\nparent: big-epic\nunits:\n  - id: b1\n---\n");
  return dir;
}
function grantOf(dir, sid) {
  const session = path.join(dir, ".craftsman", "sessions", sid);
  const grants = fs.readdirSync(session).filter((f) => f.includes("runner"));
  assert.equal(grants.length, 1, grants.join());
  return Number(fs.readFileSync(path.join(session, grants[0]), "utf8").trim());
}
test("orchestrate-scope-guard: /auto --level epic over two features grants all units plus one per feature", () => {
  const dir = epicProject();
  try {
    for (const [sid, args] of [["lvl-sp", "--level epic big-epic"], ["lvl-eq", "big-epic --level=epic"]]) {
      assert.equal(run(dir, { session_id: sid, prompt: `/auto ${args}` }).status, 0);
      assert.equal(grantOf(dir, sid), 3 * 8 + 2, args);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, ".craftsman", "sessions", sid, "auto-active"), "utf8")).plan, "feat-a");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("orchestrate-scope-guard: --feature narrows the grant; a bare slug is unchanged", () => {
  const dir = epicProject();
  try {
    run(dir, { session_id: "ft", prompt: "/auto big-epic --level epic --feature feat-b" });
    assert.equal(grantOf(dir, "ft"), 8 + 1);
    run(dir, { session_id: "bare", prompt: "/auto big-epic" });
    assert.equal(grantOf(dir, "bare"), 16);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ARCH-SAFETY-02/03: a safety hook that cannot decide denies. An uncaught error used to exit 1,
// which Claude Code treats as a non-blocking failure, so the guard was silently off.
function failClosedCases(guard, script, dir) {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-badplugin-"));
  fs.writeFileSync(path.join(plugin, "craftsman.config.json"), "{ not json");
  const manifest = path.join(plugin, "workspace.json");
  fs.writeFileSync(manifest, "{ bad");
  // an invocation, so the guard goes on to read its config
  const payload = JSON.stringify({ session_id: "fail-closed", prompt: "/orchestrate docs/plans/example.md" });
  const cases = [
    ["bad JSON on stdin", "not json", {}],
    ["empty stdin", "", {}],
    ["a thrown error inside the guard", payload, { CRAFTSMAN_TEST_THROW: guard }],
    ["an unreadable default config", payload, { CLAUDE_PLUGIN_ROOT: plugin }],
    // projectContext() throws on a broken workspace manifest (ARCH-SAFETY-03); it used to exit 1 silently
    ["an invalid workspace manifest", payload, { CRAFTSMAN_WORKSPACE_MANIFEST: manifest }],
  ];
  try {
    for (const [label, input, env] of cases) {
      const r = spawnSync(process.execPath, [script], {
        cwd: dir, input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
      });
      assert.equal(r.status, 2, `${guard} denies on ${label}: ${r.stderr}`);
      assert.match(r.stderr, new RegExp(`craftsman: ${guard}`), `${guard} names itself on ${label}`);
    }
    // the throw hook only ever denies: another guard's name does nothing
    const other = spawnSync(process.execPath, [script], {
      cwd: dir, input: payload, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CRAFTSMAN_TEST_THROW: "someone-else" },
    });
    assert.notEqual(other.status, 2, "the test hook is scoped to one guard");
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
}

test("orchestrate-scope-guard: bad input, an exception or a broken default config denies and names the guard (6.1, 6.2)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-failclosed-osg-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    failClosedCases("orchestrate-scope-guard", path.join(path.dirname(fileURLToPath(import.meta.url)), "orchestrate-scope-guard.mjs"), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
