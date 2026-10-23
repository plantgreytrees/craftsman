// hooks/run.sh is the one launcher every hook goes through. With node missing, a safety hook
// must fail closed (exit 2) and an advisory hook must say it is off, once per session
// (ARCH-SAFETY-02, ARCH-SAFETY-04).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN_SH = path.join(ROOT, "hooks", "run.sh");
const SAFETY = ["pre-guard.mjs", "agent-mode-guard.mjs", "orchestrate-scope-guard.mjs"];
const ADVISORY = ["quality-gate.mjs", "stop-gate.mjs", "session-context.mjs", "tracker-sync.mjs", "telemetry.mjs", "builtin-skill-context.mjs"];

// A PATH holding sh and the few tools run.sh may call, and no node.
function pathWithoutNode() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-nonode-"));
  for (const tool of ["sh", "mkdir", "tr", "id", "dirname", "cat", "rm", "uname"]) {
    const found = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
    if (found) fs.symlinkSync(found, path.join(bin, tool));
  }
  return bin;
}

function launch(script, { env = {}, input = "{}", sh = "sh" } = {}) {
  return spawnSync(sh, [RUN_SH, script], { encoding: "utf8", input, env: { ...env } });
}

const skipWindows = process.platform === "win32" ? "run.sh is POSIX sh; the node-less PATH case is covered on Linux and macOS in CI" : false;

test("run.sh: node missing, every safety hook exits 2 and names the failure", { skip: skipWindows }, () => {
  const bin = pathWithoutNode();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-launch-"));
  try {
    for (const script of SAFETY) {
      const r = launch(`scripts/${script}`, { env: { PATH: bin, TMPDIR: tmp, CLAUDE_CODE_SESSION_ID: "s-safety" } });
      assert.equal(r.status, 2, `${script}: ${r.stderr}`);
      assert.match(r.stderr, /craftsman: node not found, guards cannot run/);
    }
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run.sh: node missing, an advisory hook exits 0 and warns once per session", { skip: skipWindows }, () => {
  const bin = pathWithoutNode();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-launch-"));
  try {
    const env = (sid) => ({ PATH: bin, TMPDIR: tmp, CLAUDE_CODE_SESSION_ID: sid });
    const text = (r) => r.stdout + r.stderr;
    for (const [i, script] of ADVISORY.entries()) {
      const sid = `s-advisory-${i}`;
      const first = launch(`scripts/${script}`, { env: env(sid) });
      assert.equal(first.status, 0, `${script}: ${first.stderr}`);
      assert.equal(text(first).split("craftsman disabled: node not found").length - 1, 1, `${script}: one warning on the first call`);
      const second = launch(`scripts/${script}`, { env: env(sid) });
      assert.equal(second.status, 0);
      assert.equal(text(second), "", `${script}: nothing on the second call`);
    }
    const other = launch("scripts/stop-gate.mjs", { env: env("another-session") });
    assert.match(other.stdout + other.stderr, /craftsman disabled: node not found/, "a new session warns again");
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run.sh: node present, runs the script with stdin forwarded and its exit code kept", () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plugin-"));
  try {
    fs.mkdirSync(path.join(plugin, "scripts"));
    fs.writeFileSync(path.join(plugin, "scripts", "echo-input.mjs"),
      'let s = ""; for await (const c of process.stdin) s += c; process.stdout.write("got:" + s); process.exit(3);\n');
    const r = launch("scripts/echo-input.mjs", { env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin }, input: '{"a":1}' });
    assert.equal(r.status, 3);
    assert.equal(r.stdout, 'got:{"a":1}');
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test("run.sh: a bare script name works too, and anything that is not a plain .mjs name is refused with exit 2", () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plugin-"));
  try {
    fs.mkdirSync(path.join(plugin, "scripts"));
    fs.writeFileSync(path.join(plugin, "scripts", "ok.mjs"), "process.exit(0);\n");
    const env = { ...process.env, CLAUDE_PLUGIN_ROOT: plugin };
    assert.equal(launch("ok.mjs", { env }).status, 0);
    for (const bad of ["", "../x.mjs", "scripts/../x.mjs", "a/b.mjs", "x.sh", "x.mjs;ls", ".hidden.mjs", "x y.mjs"]) {
      const r = launch(bad, { env });
      assert.equal(r.status, 2, `refused: ${JSON.stringify(bad)}`);
      assert.match(r.stderr, /invalid hook script/);
    }
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test("run.sh: POSIX sh only — parses under sh -n and uses no bash-only syntax", () => {
  assert.equal(spawnSync("sh", ["-n", RUN_SH], { encoding: "utf8" }).status, 0);
  const text = fs.readFileSync(RUN_SH, "utf8");
  assert.match(text, /^#!\/bin\/sh\n/);
  assert.doesNotMatch(text, /\[\[|\bfunction\s+\w+|<\(|\$\{[^}]*\/\/|\bsource\s/);
});

// ---- 14: the Read/Glob/Grep filter (ARCH-SAFETY-11) -------------------------------------------
// pre-guard has nothing to do for a Read, Glob or Grep unless a unit scope (or the scope-required flag) is on
// disk for the session, the call names a protected-looking path, or the project overrides protectedPaths.
// A fixture plugin whose pre-guard.mjs only records that node ran shows exactly when run.sh starts it.
function filterFixture() {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-filter-plugin-"));
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-filter-project-")));
  fs.mkdirSync(path.join(plugin, "scripts"));
  fs.writeFileSync(path.join(plugin, "scripts", "pre-guard.mjs"),
    'import fs from "node:fs"; let s = ""; for await (const c of process.stdin) s += c; fs.appendFileSync(process.env.RAN_LOG, s + "\\n"); process.exit(Number(process.env.GUARD_EXIT ?? 2));\n');
  const ran = path.join(project, "ran.log");
  const call = (payload, { env = {}, input = JSON.stringify(payload) } = {}) => spawnSync("sh", [RUN_SH, "scripts/pre-guard.mjs"], {
    cwd: project, input, encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PROJECT_DIR: project, RAN_LOG: ran, ...env },
  });
  const nodeRan = () => fs.existsSync(ran) && fs.readFileSync(ran, "utf8").trim() !== "";
  const reset = () => fs.rmSync(ran, { force: true });
  const cleanup = () => { fs.rmSync(plugin, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); };
  return { plugin, project, call, nodeRan, reset, cleanup };
}
const payload = (tool, input = {}, sid = "flt-1") => ({ session_id: sid, transcript_path: "/x/t.jsonl", cwd: "/x", hook_event_name: "PreToolUse", tool_name: tool, tool_input: input, tool_use_id: "toolu_1" });

// Merge of main: a session's scope files live in the MAIN checkout's .craftsman (shared through the git common dir). A linked
// worktree is a project whose .git is a FILE, and it need not sit inside the main checkout, so the filter cannot find the scope by
// walking up from it. It runs the guard for any linked worktree (ARCH-SAFETY-11).
test("run.sh filter: a linked worktree project always runs the guard on reads, whatever scope files the walk finds", { skip: skipWindows }, () => {
  const f = filterFixture();
  try {
    fs.writeFileSync(path.join(f.project, ".git"), "gitdir: /elsewhere/.git/worktrees/wt\n");
    for (const [tool, input] of [["Read", { file_path: "/etc/hostname" }], ["Glob", { pattern: "**/*" }], ["Grep", { pattern: "x", path: "/etc" }]]) {
      f.reset();
      f.call(payload(tool, input));
      assert.equal(f.nodeRan(), true, `${tool} in a linked worktree started node`);
    }
    // a session started in a subdirectory of the linked worktree is the same project
    fs.mkdirSync(path.join(f.project, "src"), { recursive: true });
    f.reset();
    f.call(payload("Read", { file_path: "/etc/hostname" }), { env: { CLAUDE_PROJECT_DIR: path.join(f.project, "src") } });
    assert.equal(f.nodeRan(), true, "Read from a subdirectory of a linked worktree started node");
    // the same project without the .git file (a plain checkout) still takes the cheap path
    fs.rmSync(path.join(f.project, ".git"), { force: true });
    f.reset();
    assert.equal(f.call(payload("Read", { file_path: "/p/src/a.js" })).status, 0);
    assert.equal(f.nodeRan(), false);
  } finally { f.cleanup(); }
});

test("run.sh filter: Read, Glob and Grep with no scope state skip node and pass", { skip: skipWindows }, () => {
  const f = filterFixture();
  try {
    for (const [tool, input] of [["Read", { file_path: "/p/src/a.js" }], ["Glob", { pattern: "src/**/*.js" }], ["Grep", { pattern: "TODO", path: "/p/src" }]]) {
      f.reset();
      const r = f.call(payload(tool, input));
      assert.equal(r.status, 0, `${tool}: ${r.stderr}`);
      assert.equal(f.nodeRan(), false, `${tool} did not start node`);
    }
  } finally { f.cleanup(); }
});

test("run.sh filter: Write, Edit, NotebookEdit and Bash always run the guard, and its exit code is kept", { skip: skipWindows }, () => {
  const f = filterFixture();
  try {
    for (const tool of ["Write", "Edit", "NotebookEdit", "Bash", "Task"]) {
      f.reset();
      const r = f.call(payload(tool, { file_path: "/p/a.js", command: "ls" }));
      assert.equal(r.status, 2, `${tool} runs the guard and keeps its exit code`);
      assert.equal(f.nodeRan(), true, tool);
    }
    f.reset();
    const forwarded = f.call(payload("Bash", { command: "echo hi" }), { env: { GUARD_EXIT: "0" } });
    assert.equal(forwarded.status, 0);
    assert.match(fs.readFileSync(path.join(f.project, "ran.log"), "utf8"), /"command":"echo hi"/, "stdin reaches the guard intact");
  } finally { f.cleanup(); }
});

test("run.sh filter: a scope or scope-required file for the session, here or in a parent project dir, runs the guard", { skip: skipWindows }, () => {
  const f = filterFixture();
  try {
    const read = payload("Read", { file_path: "/p/src/a.js" }, "flt-2");
    for (const name of ["scope.json", "scope-required", "scope@payments-0123456789abcdef.json", "scope-required@payments"]) {
      const dir = path.join(f.project, ".craftsman", "sessions", "flt-2");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), "{}");
      f.reset();
      assert.equal(f.call(read).status, 2, name);
      assert.equal(f.nodeRan(), true, name);
      fs.rmSync(path.join(dir, name));
    }
    f.reset();
    assert.equal(f.call(read).status, 0, "another session's scope does not count here");
    fs.mkdirSync(path.join(f.project, ".craftsman", "sessions", "flt-2"), { recursive: true });
    fs.writeFileSync(path.join(f.project, ".craftsman", "sessions", "flt-2", "scope.json"), "{}");
    const sub = path.join(f.project, "packages", "app");
    fs.mkdirSync(sub, { recursive: true });
    f.reset();
    const r = spawnSync("sh", [RUN_SH, "scripts/pre-guard.mjs"], { cwd: sub, input: JSON.stringify(read), encoding: "utf8",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: f.plugin, CLAUDE_PROJECT_DIR: sub, RAN_LOG: path.join(f.project, "ran.log") } });
    assert.equal(r.status, 2, "a project dir below the repo root still finds the root's scope state");
  } finally { f.cleanup(); }
});

// Round 5 (37.x): the filter must look in every file loadConfig merges, or a Read skips a guard the project asked for.
test("run.sh filter: protectedPaths in any config file loadConfig reads keeps the guard on reads (37.1, 37.2)", { skip: skipWindows }, () => {
  const core = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "lib", "core.mjs"), "utf8");
  const names = /export const PROJECT_CONFIG_FILES = (\[[^\]]*\])/.exec(core)?.[1];
  assert.ok(names, "found the list of project config files loadConfig merges");
  assert.match(core, /for \(const name of PROJECT_CONFIG_FILES\)/, "loadConfig reads exactly that list");
  const files = JSON.parse(names);
  assert.ok(files.length >= 2 && files.includes("craftsman.project.json"));
  for (const name of files) {
    const f = filterFixture();
    try {
      fs.writeFileSync(path.join(f.project, name), JSON.stringify({ protectedPaths: ["secrets/**"] }));
      f.reset();
      assert.equal(f.call(payload("Read", { file_path: "/p/secrets/key.txt" })).status, 2, `${name}: protectedPaths keeps the guard on reads`);
      assert.equal(f.nodeRan(), true, `${name}: the guard ran`);
    } finally { f.cleanup(); }
  }
});

test("run.sh filter: a protected-looking path, a project protectedPaths override, an odd session id or unreadable input runs the guard", { skip: skipWindows }, () => {
  const f = filterFixture();
  try {
    for (const file of ["/p/.env", "/p/.env.local", "/p/node_modules/x/index.js", "/p/package-lock.json", "/p/dist/app.js", "/p/vendor/lib.go", "/p/api.pb.go", "/p/app.min.js"]) {
      f.reset();
      assert.equal(f.call(payload("Read", { file_path: file })).status, 2, file);
      assert.equal(f.nodeRan(), true, file);
    }
    f.reset();
    assert.equal(f.call(payload("Grep", { pattern: "x", path: "/p/.env" })).status, 2, "Grep too");
    assert.equal(f.call(payload("Read", { file_path: "/p/a.js" }, "has.dot")).status, 2, "an id sidOf would rewrite is not looked up by the shell");
    assert.equal(f.call(null, { input: "not json" }).status, 2);
    assert.equal(f.call(null, { input: "" }).status, 2);
    fs.writeFileSync(path.join(f.project, "craftsman.config.json"), JSON.stringify({ protectedPaths: ["secrets/**"] }));
    f.reset();
    assert.equal(f.call(payload("Read", { file_path: "/p/secrets/key.txt" })).status, 2, "a project that sets protectedPaths keeps the guard on reads");
    fs.writeFileSync(path.join(f.project, "craftsman.config.json"), JSON.stringify({ maxFeedbackLines: 5 }));
    f.reset();
    assert.equal(f.call(payload("Read", { file_path: "/p/a.js" })).status, 0, "an unrelated config does not");
  } finally { f.cleanup(); }
});

test("run.sh filter: only pre-guard is filtered; every other hook still runs node", { skip: skipWindows }, () => {
  const f = filterFixture();
  try {
    fs.writeFileSync(path.join(f.plugin, "scripts", "quality-gate.mjs"), 'import fs from "node:fs"; fs.appendFileSync(process.env.RAN_LOG, "ran\\n"); process.exit(0);\n');
    const r = spawnSync("sh", [RUN_SH, "scripts/quality-gate.mjs"], { cwd: f.project, input: JSON.stringify(payload("Read", { file_path: "/p/a.js" })), encoding: "utf8",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: f.plugin, CLAUDE_PROJECT_DIR: f.project, RAN_LOG: path.join(f.project, "ran.log") } });
    assert.equal(r.status, 0);
    assert.equal(f.nodeRan(), true);
  } finally { f.cleanup(); }
});

// 14.2: the work the filter adds on the path it skips, measured through run.sh against a no-op hook.
// The budget is ~20 ms p95; CI machines are noisier, so it triples there. The numbers are printed.
test("run.sh filter: the skipped path adds under ~20 ms p95 over 200 runs against a no-op hook", { skip: skipWindows }, () => {
  const f = filterFixture();
  try {
    const body = JSON.stringify(payload("Read", { file_path: "/p/src/a.js" }));
    const time = (cmd, args, env) => { const t = process.hrtime.bigint(); spawnSync(cmd, args, { cwd: f.project, input: body, env }); return Number(process.hrtime.bigint() - t) / 1e6; };
    const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95) - 1];
    const env = { ...process.env, CLAUDE_PLUGIN_ROOT: f.plugin, CLAUDE_PROJECT_DIR: f.project, RAN_LOG: path.join(f.project, "ran.log") };
    for (let i = 0; i < 20; i++) { time("sh", ["-c", "cat >/dev/null"], env); time("sh", [RUN_SH, "scripts/pre-guard.mjs"], env); } // warm up
    const noop = []; const filtered = [];
    for (let i = 0; i < 200; i++) { noop.push(time("sh", ["-c", "cat >/dev/null"], env)); filtered.push(time("sh", [RUN_SH, "scripts/pre-guard.mjs"], env)); }
    const delta = p95(filtered) - p95(noop);
    const budget = 20 * (process.env.CI ? 3 : 1);
    console.log(`# run.sh filter timing: no-op p95 ${p95(noop).toFixed(1)} ms, filtered p95 ${p95(filtered).toFixed(1)} ms, delta ${delta.toFixed(1)} ms (budget ${budget} ms)`);
    assert.equal(f.nodeRan(), false, "none of the 200 runs started node");
    assert.ok(delta < budget, `filtered path adds ${delta.toFixed(1)} ms p95, over ${budget} ms`);
  } finally { f.cleanup(); }
});

// Scrutiny round: what the launcher does with a prompt, with an abnormal exit, and with its own protected list.
const PROMPT = JSON.stringify({ session_id: "p1", hook_event_name: "UserPromptSubmit", prompt: "/craftsman:plan x" });

test("run.sh: node missing, orchestrate-scope-guard on UserPromptSubmit must not erase the prompt; on any other event it still blocks", { skip: skipWindows }, () => {
  const bin = pathWithoutNode();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-launch-"));
  try {
    const env = { PATH: bin, TMPDIR: tmp, CLAUDE_CODE_SESSION_ID: "s-prompt" };
    const prompt = launch("scripts/orchestrate-scope-guard.mjs", { env, input: PROMPT });
    assert.equal(prompt.status, 0, prompt.stderr);
    assert.match(prompt.stdout, /"systemMessage":"[^"]*node not found/);
    const skill = launch("scripts/orchestrate-scope-guard.mjs", { env, input: JSON.stringify({ session_id: "p1", hook_event_name: "PostToolUse", tool_name: "Skill" }) });
    assert.equal(skill.status, 2, skill.stderr);
    assert.equal(launch("scripts/pre-guard.mjs", { env, input: PROMPT }).status, 2, "pre-guard has no prompt exemption");
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run.sh: a safety hook that dies on an unexpected exit code denies (2); 0 and 2 and an advisory hook's own code are kept", () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plugin-"));
  try {
    fs.mkdirSync(path.join(plugin, "scripts"));
    const put = (name, body) => fs.writeFileSync(path.join(plugin, "scripts", name), body);
    const run = (name, input = "{}") => launch(`scripts/${name}`, { env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin }, input });
    put("pre-guard.mjs", 'throw new Error("import-time failure");\n');
    assert.equal(run("pre-guard.mjs").status, 2, "an import-time throw exits 1 in node, the launcher makes it a denial");
    put("pre-guard.mjs", "process.exit(5);\n");
    assert.equal(run("pre-guard.mjs").status, 2);
    put("pre-guard.mjs", "process.exit(0);\n");
    assert.equal(run("pre-guard.mjs").status, 0);
    put("pre-guard.mjs", 'process.stderr.write("blocked"); process.exit(2);\n');
    const denied = run("pre-guard.mjs");
    assert.equal(denied.status, 2);
    assert.equal(denied.stderr, "blocked");
    put("agent-mode-guard.mjs", "process.exit(1);\n");
    assert.equal(run("agent-mode-guard.mjs").status, 2);
    put("stop-gate.mjs", "process.exit(1);\n");
    assert.equal(run("stop-gate.mjs").status, 1, "an advisory hook keeps its own code");
    put("orchestrate-scope-guard.mjs", 'throw new Error("boom");\n');
    const prompt = run("orchestrate-scope-guard.mjs", PROMPT);
    assert.equal(prompt.status, 0, "a crash on UserPromptSubmit must not erase the prompt");
    assert.match(prompt.stdout, /systemMessage/);
    assert.equal(run("orchestrate-scope-guard.mjs", JSON.stringify({ hook_event_name: "PostToolUse" })).status, 2);
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test("run.sh filter: every default protectedPaths pattern contains one of the substrings the filter runs the guard for", () => {
  const sh = fs.readFileSync(RUN_SH, "utf8");
  const block = sh.slice(sh.indexOf("case $tin in"), sh.indexOf("esac", sh.indexOf("case $tin in")));
  const needles = [...block.matchAll(/\*([^*|)\s]+)\*/g)].map((m) => m[1]);
  assert.ok(needles.length >= 10, `parsed the filter's substrings (${needles.length})`);
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "craftsman.config.json"), "utf8"));
  for (const pattern of cfg.protectedPaths) {
    const pieces = pattern.split(/\*+|\//).filter(Boolean);
    assert.ok(needles.some((n) => pieces.some((piece) => piece.includes(n))), `${pattern}: no filter substring is part of every path it matches (${needles})`);
  }
});

// Scrutiny round 2 (16.x): a failed prompt hook cannot erase the prompt even with node present, and a safety hook
// starts without NODE_OPTIONS (the settings `env` route would otherwise load code into node before the guard runs).
test("run.sh: with node present, orchestrate-scope-guard failing on UserPromptSubmit keeps the prompt; other hooks and events keep their codes (16.1)", () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plugin-"));
  try {
    fs.mkdirSync(path.join(plugin, "scripts"));
    const put = (name, body) => fs.writeFileSync(path.join(plugin, "scripts", name), body);
    const run = (name, input = "{}") => launch(`scripts/${name}`, { env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin }, input });
    const POST = JSON.stringify({ hook_event_name: "PostToolUse" });
    put("orchestrate-scope-guard.mjs", 'process.stderr.write("denied"); process.exit(2);\n');
    const prompt = run("orchestrate-scope-guard.mjs", PROMPT);
    assert.equal(prompt.status, 0, "exit 2 on UserPromptSubmit would erase the prompt");
    assert.match(prompt.stdout, /systemMessage[\s\S]*prompt was not checked/);
    const post = run("orchestrate-scope-guard.mjs", POST);
    assert.equal(post.status, 2, "the same fixture on another event still denies");
    assert.equal(post.stderr, "denied");
    put("orchestrate-scope-guard.mjs", "process.exit(0);\n");
    assert.equal(run("orchestrate-scope-guard.mjs", PROMPT).status, 0);
    for (const name of ["pre-guard.mjs", "agent-mode-guard.mjs"]) {
      put(name, 'process.stderr.write("denied"); process.exit(2);\n');
      assert.equal(run(name, PROMPT).status, 2, `${name} keeps exit 2`);
      assert.equal(run(name, POST).status, 2, `${name} keeps exit 2`);
    }
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test("run.sh: a safety hook starts without NODE_OPTIONS, an advisory hook keeps it (16.2)", () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plugin-"));
  try {
    fs.mkdirSync(path.join(plugin, "scripts"));
    const body = 'process.stdout.write("NO=" + (process.env.NODE_OPTIONS ?? "")); process.exit(0);\n';
    for (const name of [...SAFETY, "stop-gate.mjs"]) fs.writeFileSync(path.join(plugin, "scripts", name), body);
    const env = { ...process.env, CLAUDE_PLUGIN_ROOT: plugin, NODE_OPTIONS: "--max-old-space-size=64" };
    for (const name of SAFETY) {
      const r = launch(`scripts/${name}`, { env, input: JSON.stringify({ tool_name: "Bash" }) });
      assert.equal(r.status, 0, `${name}: ${r.stderr}`);
      assert.equal(r.stdout, "NO=", `${name} starts with NODE_OPTIONS cleared`);
    }
    const advisory = launch("scripts/stop-gate.mjs", { env, input: "{}" });
    assert.equal(advisory.stdout, "NO=--max-old-space-size=64", "an advisory hook is untouched");
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});
