// Cheap wiring check for the prompt-driven half of the plugin: commands and
// agents reference other files by literal path
// ("${CLAUDE_PLUGIN_ROOT}/skills/.../SKILL.md") and by name (`agent-name`).
// Nothing enforces those references stay correct as the file set grows —
// this test is the deterministic backstop instead of relying on getting it
// right by eye every time an agent/skill is added, renamed, or removed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

const promptFiles = [
  ...walk(path.join(PLUGIN_ROOT, "commands")),
  ...walk(path.join(PLUGIN_ROOT, "agents")),
].filter((f) => f.endsWith(".md"));

test("wiring: every ${CLAUDE_PLUGIN_ROOT}/... path referenced in commands/agents resolves to a real file", () => {
  const missing = [];
  for (const file of promptFiles) {
    const text = fs.readFileSync(file, "utf8");
    const re = /\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_\-./]+\.md)/g;
    for (const match of text.matchAll(re)) {
      const target = path.join(PLUGIN_ROOT, match[1]);
      if (!fs.existsSync(target)) missing.push(`${path.relative(PLUGIN_ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("wiring: every scripts/*.mjs referenced from commands/agents exists", () => {
  const missing = [];
  for (const file of promptFiles) {
    const text = fs.readFileSync(file, "utf8");
    const re = /\$\{CLAUDE_PLUGIN_ROOT\}\/(scripts\/[A-Za-z0-9_\-./]+\.mjs)/g;
    for (const match of text.matchAll(re)) {
      const target = path.join(PLUGIN_ROOT, match[1]);
      if (!fs.existsSync(target)) missing.push(`${path.relative(PLUGIN_ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(missing, []);
});

const hooksConfig = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "hooks", "hooks.json"), "utf8"));

function hookScripts() {
  const found = [];
  for (const [event, entries] of Object.entries(hooksConfig.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        const match = hook.command.match(/scripts\/([A-Za-z0-9_\-.]+\.mjs)/);
        if (match) found.push({ event, script: match[1] });
      }
    }
  }
  return found;
}

test("wiring: every script referenced from hooks.json exists", () => {
  const missing = hookScripts()
    .filter(({ script }) => !fs.existsSync(path.join(PLUGIN_ROOT, "scripts", script)))
    .map(({ event, script }) => `${event}: ${script}`);
  assert.deepEqual(missing, []);
});

// /compact and /clear are built-in CLI commands: the model cannot invoke them
// (SlashCommand/Skill only reach custom commands) and no hook can trigger a
// compaction. A gate that blocks tool use "until /compact runs" therefore always
// ends with the session stopped, waiting for the user to type it — which the
// old compact-gate.mjs did after every unit. Context resets are left to Claude
// Code's own auto-compact; SessionStart restores the hand-off afterwards.
test("wiring: no script blocks tool use pending a /compact the model cannot run", () => {
  const offenders = fs.readdirSync(path.join(PLUGIN_ROOT, "scripts"))
    .filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"))
    .filter((f) => /compact-required|requireCompact\s*\(/.test(
      fs.readFileSync(path.join(PLUGIN_ROOT, "scripts", f), "utf8")));
  assert.deepEqual(offenders, []);
});

test("wiring: every agent file is referenced by name from at least one command", () => {
  const agentDir = path.join(PLUGIN_ROOT, "agents");
  const agentNames = fs.readdirSync(agentDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  const commandText = walk(path.join(PLUGIN_ROOT, "commands")).filter((f) => f.endsWith(".md"))
    .map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const unreferenced = agentNames.filter((name) => !commandText.includes(`\`${name}\``));
  assert.deepEqual(unreferenced, []);
});

// ARCH-ENGINE-03: a workflow script only orchestrates. No filesystem, shell,
// module loading or clock, and every agent() call carries its result schema
// (ARCH-ENGINE-06) at the call site, where a reviewer can see it.
function agentCalls(src) {
  const calls = [];
  for (const match of src.matchAll(/\bagent\(/g)) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < src.length; end++) {
      if (src[end] === "(") depth++;
      else if (src[end] === ")" && --depth === 0) break;
    }
    calls.push(src.slice(match.index, end + 1));
  }
  return calls;
}
function lintWorkflow(src) {
  const banned = [
    [/\bfs\b/, "fs"], [/child_process/, "child_process"], [/\bimport\s*\(/, "import()"],
    [/^\s*import\s/m, "static import"], [/\brequire\s*\(/, "require()"],
    [/Date\.now/, "Date.now"], [/Math\.random/, "Math.random"], [/new\s+Date\b/, "new Date"],
  ];
  const problems = banned.filter(([pattern]) => pattern.test(src)).map(([, name]) => name);
  for (const call of agentCalls(src)) if (!/\bschema\s*:/.test(call)) problems.push(`agent() without schema: ${call.slice(0, 60)}`);
  return problems;
}

test("wiring: every workflows/*.js only orchestrates, and every agent() call passes a schema (ARCH-ENGINE-03)", () => {
  const dir = path.join(PLUGIN_ROOT, "workflows");
  const scripts = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(scripts.includes("run.js"), "the engine's workflow ships");
  for (const file of scripts) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    assert.ok(agentCalls(src).length > 0, `${file} dispatches through agent()`);
    assert.deepEqual(lintWorkflow(src), [], file);
  }
});

test("wiring: the workflow lint fails a script that touches the filesystem, the clock, or drops a schema", () => {
  const bad = [
    "import fs from 'node:fs'\nawait agent('x', { schema: S })",
    "const cp = await import('node:child_process')",
    "const t = Date.now()",
    "const r = Math.random()",
    "const d = new Date()",
    "await agent('do it', { label: 'no schema' })",
  ];
  for (const src of bad) assert.notDeepEqual(lintWorkflow(src), [], src);
  assert.deepEqual(lintWorkflow("await agent(brief('a', u), { label: 'x', schema: RESULT })"), []);
});

test("wiring: both engines follow agents/unit-runner.md and fall back to subagent, never silently root (ARCH-ENGINE-01/04)", () => {
  const config = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "craftsman.config.json"), "utf8"));
  assert.equal(config.execution.engine, "workflow");
  assert.ok(["workflow", "subagent", "root"].includes(config.execution.engine));
  assert.equal(config.execution.unitContextBytes, 122880);
  for (const file of ["commands/_shared-execution.md", "commands/auto.md"]) {
    const text = fs.readFileSync(path.join(PLUGIN_ROOT, file), "utf8");
    assert.match(text, /agents\/unit-runner\.md/, file);
    assert.match(text, /workflows\/run\.js/, file);
    assert.match(text, /`workflow` \(default\)/, file);
    assert.match(text, /Workflow unavailable → `subagent`[^.]*never silently `root`/, file);
  }
});

test("wiring: sync-docs points at _sync-docs-prune, which keeps the archive/prune safeguards (ARCH-DOCS-04/05)", () => {
  const main = fs.readFileSync(path.join(PLUGIN_ROOT, "commands/sync-docs.md"), "utf8");
  const prune = fs.readFileSync(path.join(PLUGIN_ROOT, "commands/_sync-docs-prune.md"), "utf8");
  assert.match(main, /--archive\b.*--prune/);
  assert.match(main, /_sync-docs-prune\.md/);
  assert.match(prune, /--archive/);
  assert.match(prune, /--prune/);
  assert.match(prune, /doc-retire\.mjs/);
  assert.match(prune, /"plan":"docs\/plans\/<slug>\.md"/);
  assert.match(prune, /action `status`, not `lookup`/);
  assert.match(prune, /Dry run first/);
  assert.match(prune, /at most 15 docs/);
  assert.match(prune, /Skip list.*ledger row, a claim or a hand-off/);
  assert.match(prune, /only when the user names it/);
  assert.match(prune, /index heading/);
  assert.match(prune, /`\/goal` or any pre-approval does \*\*not\*\* cover/);
});

test("wiring: trimmed loadable docs stay at or below 95% of their size cap (ARCH-SLIM-06)", () => {
  const caps = {
    "commands/_shared-execution.md": 13500,
    "commands/sync-docs.md": 10000,
    "commands/plan.md": 10000,
    "commands/orchestrate.md": 10000,
    "commands/_architecture.md": 4000,
    "agents/unit-runner.md": 3800,
  };
  for (const [file, cap] of Object.entries(caps)) {
    const size = fs.statSync(path.join(PLUGIN_ROOT, file)).size;
    assert.ok(size <= cap * 0.95, `${file}: ${size} > ${cap * 0.95}`);
  }
});

// 4.0: a hook matcher or allowed-tools entry that names a tool Claude Code no longer has
// never fires (matchers) or is ignored (allowed-tools), so the guard it was meant to be
// silently covers nothing. `Task` is kept: it is the older name of `Agent`, which the
// agent-mode guard still matches for older Claude Code versions.
const CURRENT_TOOLS = new Set([
  "Read", "Glob", "Grep", "Write", "Edit", "NotebookEdit", "Bash", "Task", "Agent", "Workflow", "Skill",
  "AskUserQuestion", "WebFetch", "WebSearch", "EnterWorktree", "ExitWorktree", "TaskCreate", "TaskUpdate",
]);
const isCurrentTool = (name) => CURRENT_TOOLS.has(name) || name.startsWith("mcp__");

test("wiring: every hooks.json matcher token is a current tool name", () => {
  const stale = [];
  for (const [event, entries] of Object.entries(hooksConfig.hooks)) {
    for (const entry of entries) {
      for (const token of String(entry.matcher || "").split("|").filter(Boolean)) {
        if (!isCurrentTool(token)) stale.push(`${event}: ${token}`);
      }
    }
  }
  assert.deepEqual(stale, []);
});

test("wiring: every allowed-tools entry in commands and tools entry in agents is a current tool name", () => {
  const stale = [];
  for (const file of promptFiles) {
    const front = fs.readFileSync(file, "utf8").split(/^---$/m)[1] || "";
    const line = front.split("\n").find((l) => /^(allowed-tools|tools):/.test(l));
    if (!line) continue;
    for (const token of line.replace(/^[a-z-]+:\s*/, "").split(",").map((t) => t.trim()).filter(Boolean)) {
      if (!isCurrentTool(token)) stale.push(`${path.relative(PLUGIN_ROOT, file)}: ${token}`);
    }
  }
  assert.deepEqual(stale, []);
});

test("wiring: no tracked file outside docs/ideas, docs/plans and the changelog names a removed tool", () => {
  const dead = ["Multi" + "Edit", "Slash" + "Command", "Todo" + "Write"];
  const files = spawnSync("git", ["ls-files"], { cwd: PLUGIN_ROOT, encoding: "utf8" }).stdout.split("\n").filter(Boolean)
    .filter((f) => !/^(docs\/ideas\/|docs\/plans\/|CHANGELOG\.md$|scripts\/wiring\.test\.mjs$)/.test(f))
    .filter((f) => fs.existsSync(path.join(PLUGIN_ROOT, f)));
  const offenders = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(PLUGIN_ROOT, f), "utf8");
    for (const name of dead) if (text.includes(name)) offenders.push(`${f}: ${name}`);
  }
  assert.deepEqual(offenders, []);
});

// 5.2: every hook goes through the launcher, so a missing node is loud, never silent.
const allHooks = Object.entries(hooksConfig.hooks).flatMap(([event, entries]) =>
  entries.flatMap((entry) => entry.hooks.map((hook) => ({ event, matcher: entry.matcher, hook }))));

test("wiring: every hooks.json command runs through hooks/run.sh with one existing script", () => {
  const bad = allHooks.filter(({ hook }) => !/^sh "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/run\.sh" scripts\/[A-Za-z0-9_.-]+\.mjs$/.test(hook.command));
  assert.deepEqual(bad.map(({ event, hook }) => `${event}: ${hook.command}`), []);
});

test("wiring: onFailure block is on the pre-guard and agent-mode-guard entries only, never on Stop", () => {
  const blocking = allHooks.filter(({ hook }) => hook.onFailure === "block").map(({ hook }) => hook.command.match(/scripts\/([\w.-]+)/)[1]).sort();
  assert.deepEqual(blocking, ["agent-mode-guard.mjs", "pre-guard.mjs"]);
  assert.deepEqual(allHooks.filter(({ event, hook }) => event === "Stop" && "onFailure" in hook), []);
});

// 9.3: SessionEnd carries the unpushed-work report; ARCH-STATE-07 still forbids SubagentStop.
test("wiring: a SessionEnd hook runs session-end.mjs with no matcher, and there is no SubagentStop", () => {
  const entries = hooksConfig.hooks.SessionEnd || [];
  assert.equal(entries.length, 1);
  assert.equal("matcher" in entries[0], false);
  const [hook] = entries[0].hooks;
  assert.match(hook.command, /run\.sh" scripts\/session-end\.mjs$/);
  assert.equal(hook.timeout, 20);
  assert.equal("SubagentStop" in hooksConfig.hooks, false);
});
