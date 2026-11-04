// ARCH-STATE-19: loadConfig layers PROJECT_ROOT's project config files (the workspace root's) under a differing context
// root's own, in the order defaults, user config, workspace root, project. A project `null` drops an inherited entry,
// `{}` changes nothing, equal roots add no layer, a malformed inherited file is ignored with the warning, and
// `{workspaceRoot}` is PROJECT_ROOT in every configured command. PROJECT_ROOT is fixed when core.mjs loads, so each
// layering case runs core in a child node whose cwd is a scratch workspace root.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as core from "./core.mjs";

const CORE_URL = new URL("./core.mjs", import.meta.url).href;
const DEFAULTS = JSON.parse(fs.readFileSync(new URL("../../craftsman.config.json", import.meta.url), "utf8"));

const scratch = (prefix = "config-layering-") => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
function put(dir, name, value) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), typeof value === "string" ? value : JSON.stringify(value));
}
// A workspace root with one sub-project directory, ready for config files.
function layout(prefix) {
  const ws = scratch(prefix);
  const sub = path.join(ws, "svc");
  fs.mkdirSync(sub);
  return { ws, sub };
}
function childEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith("CLAUDE_PLUGIN_OPTION_") || ["CLAUDE_PLUGIN_ROOT", "CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID", "CRAFTSMAN_WORKSPACE_MANIFEST", "CRAFTSMAN", "CRAFTSMAN_SAFETY"].includes(k)) delete env[k];
  }
  return { ...env, ...extra };
}
// Runs `body` as a module with `core` imported and `out(value)` to answer, in a node whose cwd is `ws`, so core's
// PROJECT_ROOT is `ws`. Returns { value, stderr }.
function inWorkspace(ws, body, env = {}) {
  const src = `import * as core from ${JSON.stringify(CORE_URL)};\nconst out = (v) => process.stdout.write("\\n@@" + JSON.stringify(v) + "\\n");\n${body}`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", src], { cwd: ws, env: childEnv(env), encoding: "utf8" });
  assert.equal(r.status, 0, `child failed: ${r.stderr}`);
  const line = r.stdout.split("\n").find((l) => l.startsWith("@@"));
  return { value: line === undefined ? undefined : JSON.parse(line.slice(2)), stderr: r.stderr };
}
const loaded = (ws, sub, env) => inWorkspace(ws, `out(core.loadConfig({ root: ${JSON.stringify(sub)} }))`, env);
const cfgIn = (ws, sub, env) => loaded(ws, sub, env).value;

test("the layers, lowest to highest: defaults, user config, workspace root, project", () => {
  const { ws, sub } = layout();
  const user = { CLAUDE_PLUGIN_OPTION_AUTONOMYLEVEL: "attended" }; // repoExec.approval.prLines 100
  const prLines = (env) => cfgIn(ws, sub, env).repoExec.approval.prLines;
  assert.equal(prLines({}), DEFAULTS.repoExec.approval.prLines, "defaults alone");
  assert.equal(prLines(user), 100, "user config over the defaults");
  put(ws, "craftsman.config.json", { repoExec: { approval: { prLines: 250 } } });
  assert.equal(prLines(user), 250, "the workspace root over user config");
  assert.equal(prLines({}), 250, "the workspace root over the defaults");
  put(sub, "craftsman.config.json", { repoExec: { approval: { prLines: 300 } } });
  assert.equal(prLines(user), 300, "the project over the workspace root");
});

test("within a root craftsman.project.json goes over craftsman.config.json; the whole workspace layer sits under the project's", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.config.json", { timeoutMs: 3, maxFeedbackLines: 30 });
  put(ws, "craftsman.project.json", { timeoutMs: 5 });
  assert.deepEqual([cfgIn(ws, sub).timeoutMs, cfgIn(ws, sub).maxFeedbackLines], [5, 30], "list order inside the workspace root");
  put(sub, "craftsman.config.json", { timeoutMs: 7 });
  assert.equal(cfgIn(ws, sub).timeoutMs, 7, "the project's first file beats the workspace root's second");
  put(sub, "craftsman.project.json", { timeoutMs: 9 });
  assert.equal(cfgIn(ws, sub).timeoutMs, 9, "and the project's second file beats its first");
  assert.equal(cfgIn(ws, sub).maxFeedbackLines, 30, "a key only the workspace root names survives");
});

test("the project wins key by key; keys it does not name keep the workspace root's value", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.config.json", { stopGate: { markdownTests: ["A.md"], requireAcceptanceCriteria: false }, timeoutMs: 11 });
  put(sub, "craftsman.config.json", { stopGate: { markdownTests: ["B.md"] } });
  const cfg = cfgIn(ws, sub);
  assert.deepEqual(cfg.stopGate.markdownTests, ["B.md"], "the project's value wins");
  assert.equal(cfg.stopGate.requireAcceptanceCriteria, false, "inherited from the workspace root");
  assert.equal(cfg.stopGate.enabled, DEFAULTS.stopGate.enabled, "the shipped default under both");
  assert.equal(cfg.timeoutMs, 11, "a top-level key the project never names");
});

test("a project null drops an inherited entry; the siblings stay", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.config.json", { timeoutMs: 11, stopGate: { markdownTests: ["A.md"], requireAcceptanceCriteria: false } });
  put(sub, "craftsman.config.json", { timeoutMs: null, stopGate: { markdownTests: null } });
  const cfg = cfgIn(ws, sub);
  assert.equal(cfg.timeoutMs, null, "a top-level inherited key is dropped");
  assert.equal(cfg.stopGate.markdownTests, null, "a nested inherited entry is dropped");
  assert.equal(cfg.stopGate.requireAcceptanceCriteria, false, "its sibling is still inherited");
});

test("a project {} changes nothing: the config is the workspace root's, as if the file were absent", () => {
  const { ws, sub } = layout();
  const quiet = path.join(ws, "quiet");
  put(ws, "craftsman.config.json", { timeoutMs: 11, stopGate: { markdownTests: ["A.md"] } });
  put(sub, "craftsman.config.json", {});
  put(sub, "craftsman.project.json", { stopGate: {} });
  fs.mkdirSync(quiet);
  const empty = cfgIn(ws, sub);
  assert.deepEqual(empty, cfgIn(ws, quiet), "same as a project with no files");
  assert.equal(empty.timeoutMs, 11, "and that is the workspace root's value, not the defaults'");
  assert.deepEqual(empty.stopGate.markdownTests, ["A.md"]);
});

test("an empty workspace-root file changes nothing either", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.config.json", {});
  put(ws, "craftsman.project.json", {});
  put(sub, "craftsman.config.json", { timeoutMs: 13 });
  assert.deepEqual(cfgIn(ws, sub), core.deepMerge(DEFAULTS, { timeoutMs: 13 }));
});

test("a missing file adds nothing: no workspace-root files leaves the project's over the defaults", () => {
  const { ws, sub } = layout();
  put(sub, "craftsman.project.json", { timeoutMs: 17 });
  assert.deepEqual(cfgIn(ws, sub), core.deepMerge(DEFAULTS, { timeoutMs: 17 }));
  const bare = layout().sub;
  assert.deepEqual(cfgIn(path.dirname(bare), bare), DEFAULTS, "no file anywhere: the defaults");
});

test("only the workspace root's second file name is inherited too", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.project.json", { timeoutMs: 19 });
  assert.equal(cfgIn(ws, sub).timeoutMs, 19);
});

test("equal roots add no layer: one malformed file warns once, a differing root twice", (t) => {
  const { ws, sub } = layout();
  const alias = path.join(scratch(), "alias");
  let aliased = true;
  try { fs.symlinkSync(ws, alias); } catch { aliased = false; }
  put(ws, "craftsman.config.json", "{ not json");
  put(sub, "craftsman.config.json", "{ not json");
  const contexts = { none: null, same: { root: ws }, respelled: { root: `${ws}${path.sep}.${path.sep}` }, differing: { root: sub } };
  if (aliased) contexts.alias = { root: alias };
  else t.diagnostic("symlinks unavailable: the alias case is skipped");
  const { value } = inWorkspace(ws, `
    const seen = [];
    process.stderr.write = (chunk) => { seen.push(String(chunk)); return true; };
    const counts = {};
    for (const [key, context] of Object.entries(${JSON.stringify(contexts)})) {
      seen.length = 0;
      core.loadConfig(context);
      counts[key] = seen.filter((l) => l.includes("ignoring malformed")).length;
    }
    out(counts);`);
  assert.equal(value.none, 1, "no context: the workspace root's own file, once");
  assert.equal(value.same, 1, "the same root: once");
  assert.equal(value.respelled, 1, "the same root spelled with a trailing /./: once");
  if (aliased) assert.equal(value.alias, 1, "a symlink to the same directory is the same root: once");
  assert.equal(value.differing, 2, "a differing root: the workspace root's file and its own");
});

test("a malformed inherited file is ignored with the warning; the rest still layers", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.config.json", "{ not json");
  put(ws, "craftsman.project.json", { timeoutMs: 23 });
  put(sub, "craftsman.config.json", { maxFeedbackLines: 29 });
  const { value: cfg, stderr } = loaded(ws, sub);
  assert.equal(cfg.timeoutMs, 23, "the workspace root's other file still applies");
  assert.equal(cfg.maxFeedbackLines, 29, "and so does the project's");
  assert.match(stderr, /ignoring malformed .*craftsman\.config\.json/, "the warning names the file");
  assert.ok(stderr.includes(path.join(ws, "craftsman.config.json")), "and says it is the workspace root's");
  assert.ok(!stderr.includes("craftsman.project.json"), "the valid file is not mentioned");
});

test("a malformed project file keeps the warning it always had", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.config.json", { timeoutMs: 31 });
  put(sub, "craftsman.project.json", "{ not json");
  const { value: cfg, stderr } = loaded(ws, sub);
  assert.equal(cfg.timeoutMs, 31, "ignored, so the inherited value stands");
  assert.match(stderr, /ignoring malformed \.\/craftsman\.project\.json/);
});

test("it never walks to a parent or scans a sibling: only PROJECT_ROOT and the context root are read", () => {
  const { ws } = layout();
  const mid = path.join(ws, "mid");
  const sub = path.join(mid, "svc");
  fs.mkdirSync(sub, { recursive: true });
  put(ws, "craftsman.config.json", { timeoutMs: 37 });
  put(mid, "craftsman.config.json", { maxFeedbackLines: 41 });
  put(path.join(ws, "other"), "craftsman.config.json", { stopGate: { testTimeoutMs: 43 } });
  const cfg = cfgIn(ws, sub);
  assert.equal(cfg.timeoutMs, 37, "the workspace root applies");
  assert.equal(cfg.maxFeedbackLines, DEFAULTS.maxFeedbackLines, "the directory between does not");
  assert.equal(cfg.stopGate.testTimeoutMs, DEFAULTS.stopGate.testTimeoutMs, "a sibling does not");
});

test("PROJECT_CONFIG_FILES gains no name", () => {
  assert.deepEqual(core.PROJECT_CONFIG_FILES, ["craftsman.config.json", "craftsman.project.json"]);
});

test("{workspaceRoot} is PROJECT_ROOT in tokenize and splitCmd", () => {
  const root = core.PROJECT_ROOT;
  const file = path.join(root, "svc", "a.py");
  const cmd = "python3 {workspaceRoot}/scripts/x.py {file}";
  assert.deepEqual(core.tokenize(cmd, file, { root: path.join(root, "svc") }), ["python3", `${root}/scripts/x.py`, "a.py"], "per-file, with a context");
  assert.deepEqual(core.tokenize(cmd, file), ["python3", `${root}/scripts/x.py`, path.relative(root, file)], "per-file, without one");
  assert.deepEqual(core.splitCmd(cmd), ["python3", `${root}/scripts/x.py`, "{file}"], "a plain command: {file} stays, {workspaceRoot} expands");
  assert.deepEqual(core.splitCmd("tool {workspaceRoot} {workspaceRoot}/b"), ["tool", root, `${root}/b`], "every occurrence");
  assert.deepEqual(core.splitCmd("tool {workspace} {workspaceRoots}"), ["tool", "{workspace}", "{workspaceRoots}"], "only the exact placeholder");
});

test("{workspaceRoot} stays one argument for a root with spaces or replacement patterns in its name", () => {
  const ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "config layering $& $$ ")));
  const { value } = inWorkspace(ws, `
    const file = core.PROJECT_ROOT + "/svc/a.py";
    out({
      root: core.PROJECT_ROOT,
      split: core.splitCmd('sh {workspaceRoot}/x.sh {dir}'),
      quoted: core.splitCmd('sh "{workspaceRoot}/my dir/x.sh"'),
      per: core.tokenize('sh {workspaceRoot}/x.sh {file}', file, { root: core.PROJECT_ROOT + "/svc" }),
    });`);
  assert.equal(value.root, ws);
  assert.deepEqual(value.split, ["sh", `${ws}/x.sh`, "{dir}"]);
  assert.deepEqual(value.quoted, ["sh", `${ws}/my dir/x.sh`]);
  assert.deepEqual(value.per, ["sh", `${ws}/x.sh`, "a.py"]);
});

test("guardState names the workspace root's file when it holds the enabled switch", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.project.json", { enabled: false });
  const { value } = inWorkspace(ws, `
    const context = { root: ${JSON.stringify(sub)} };
    out(core.guardState({ cfg: core.loadConfig(context), context, env: {}, tmp: ${JSON.stringify(ws)}, sid: "cl" }));`);
  assert.deepEqual(value.quality, [`enabled is false in ${path.join(ws, "craftsman.project.json")}`]);
  assert.deepEqual(value.safety, []);
});

test("guardState still names the project's own file by its bare name, and both when both hold it", () => {
  const { ws, sub } = layout();
  put(sub, "craftsman.config.json", { enabled: false });
  const state = (dir) => inWorkspace(ws, `
    const context = { root: ${JSON.stringify(dir)} };
    out(core.guardState({ cfg: core.loadConfig(context), context, env: {}, tmp: ${JSON.stringify(ws)}, sid: "cl" }));`).value.quality;
  assert.deepEqual(state(sub), ["enabled is false in craftsman.config.json"]);
  put(ws, "craftsman.config.json", { enabled: false });
  assert.deepEqual(state(sub), [`enabled is false in ${path.join(ws, "craftsman.config.json")} and craftsman.config.json`]);
  assert.deepEqual(state(ws), ["enabled is false in craftsman.config.json"], "the workspace root itself: its own file, not an inherited one");
});

test("a project that turns enabled back on is not reported as disabled", () => {
  const { ws, sub } = layout();
  put(ws, "craftsman.config.json", { enabled: false });
  put(sub, "craftsman.config.json", { enabled: true });
  const { value } = inWorkspace(ws, `
    const context = { root: ${JSON.stringify(sub)} };
    const cfg = core.loadConfig(context);
    out({ enabled: cfg.enabled, quality: core.guardState({ cfg, context, env: {}, tmp: ${JSON.stringify(ws)}, sid: "cl" }).quality });`);
  assert.equal(value.enabled, true);
  assert.deepEqual(value.quality, []);
});
