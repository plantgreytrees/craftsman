// ARCH-STATE-20: a language's `cwd` ("nearest:<marker>[,<marker>]") picks the directory its tools run in - the nearest
// marker directory from the edited file up to and including the context root, never above it, never from
// process.cwd(). `{file}`/`{dir}` are relative to it, a bin containing "/" is probed against it, cacheKey includes it,
// and a language without the key behaves exactly as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as core from "./core.mjs";

const QUALITY_GATE = fileURLToPath(new URL("../quality-gate.mjs", import.meta.url));
const CORE_SRC = fileURLToPath(new URL("./core.mjs", import.meta.url));

const scratch = (prefix = "tool-cwd-") => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
function put(root, rel, text = "x\n", mode) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  if (mode) fs.chmodSync(file, mode);
  return file;
}
const cleanEnv = () => {
  const env = { ...process.env };
  for (const k of ["CLAUDE_CODE_SESSION_ID", "CLAUDE_PROJECT_DIR", "CRAFTSMAN_WORKSPACE_MANIFEST"]) delete env[k];
  return env;
};

// A stub tool that prints the directory it runs in and the arguments it got, and leaves a ran.log there.
const STUB = `const fs = require("node:fs"), path = require("node:path");
const cwd = process.cwd();
fs.appendFileSync(path.join(cwd, "ran.log"), process.argv.slice(2).join(" ") + "\\n");
console.log(JSON.stringify({ stub: true, cwd, argv: process.argv.slice(2) }));
process.exit(1);
`;
const stubJson = (text) => text.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((o) => o && o.stub);

const lang = (cwd, extra = {}) => ({ name: "fx", extensions: [".fx"], ...(cwd === undefined ? {} : { cwd }), ...extra });

// ---------------------------------------------------------------- resolveToolCwd ---

test("resolveToolCwd: a language without a cwd key runs at the root, with no reason", () => {
  const root = scratch();
  const file = put(root, "svc/src/a.fx");
  put(root, "svc/package.json");
  assert.deepEqual(core.resolveToolCwd(file, lang(undefined), { root }), { cwd: root });
  assert.deepEqual(core.resolveToolCwd(file, null, { root }), { cwd: root });
});

test("resolveToolCwd: the nearest marker directory above the file wins", () => {
  const root = scratch();
  put(root, "svc/package.json");
  const deep = put(root, "svc/src/deep/b.fx");
  const flat = put(root, "svc/a.fx");
  assert.deepEqual(core.resolveToolCwd(deep, lang("nearest:package.json"), { root }), { cwd: path.join(root, "svc") });
  assert.deepEqual(core.resolveToolCwd(flat, lang("nearest:package.json"), { root }), { cwd: path.join(root, "svc") }, "the file's own directory counts");
});

test("resolveToolCwd: the nearest directory beats an earlier-listed marker further up; any listed marker matches within one", () => {
  const root = scratch();
  put(root, "pom.xml");
  put(root, "mod/build.gradle");
  const file = put(root, "mod/x.fx");
  const spec = lang("nearest:pom.xml,build.gradle");
  assert.deepEqual(core.resolveToolCwd(file, spec, { root }), { cwd: path.join(root, "mod") }, "nearest directory first, marker order second");
  put(root, "mod/pom.xml");
  assert.deepEqual(core.resolveToolCwd(file, spec, { root }), { cwd: path.join(root, "mod") }, "both markers in one directory: still that directory");
  assert.deepEqual(core.resolveToolCwd(file, lang("nearest:build.gradle , pom.xml"), { root }), { cwd: path.join(root, "mod") }, "spaces around a marker are ignored");
});

test("resolveToolCwd: no marker found falls back to the root with a reason", () => {
  const root = scratch();
  const file = put(root, "other/x.fx");
  const r = core.resolveToolCwd(file, lang("nearest:package.json"), { root });
  assert.equal(r.cwd, root);
  assert.match(r.reason, /no marker/);
});

test("resolveToolCwd: the root itself is searched, and nothing above it is", () => {
  const base = scratch();
  const root = path.join(base, "repo");
  const top = put(root, "top.fx");
  put(base, "package.json"); // a marker above the root: never reached
  const above = core.resolveToolCwd(top, lang("nearest:package.json"), { root });
  assert.equal(above.cwd, root);
  assert.match(above.reason, /no marker/);
  put(root, "package.json");
  assert.deepEqual(core.resolveToolCwd(top, lang("nearest:package.json"), { root }), { cwd: root }, "a root-level marker is a hit, not a fallback");
  assert.deepEqual(core.resolveToolCwd(put(root, "svc/a.fx"), lang("nearest:package.json"), { root }), { cwd: root }, "the root is the last directory tried");
});

test("resolveToolCwd: a malformed spec falls back to the root with a reason", () => {
  const root = scratch();
  put(root, "package.json");
  const file = put(root, "a.fx");
  for (const spec of ["", "nearest:", "nearest:,", "nearest:package.json,", "nearby:package.json", "package.json", "nearest:../package.json", "nearest:a/b", "nearest:..", 42, ["nearest:package.json"], {}]) {
    const r = core.resolveToolCwd(file, lang(spec), { root });
    assert.equal(r.cwd, root, JSON.stringify(spec));
    assert.match(r.reason, /malformed/, JSON.stringify(spec));
  }
});

test("resolveToolCwd: a marker directory that is a symlink out of the root falls back to the root", (t) => {
  const base = scratch();
  const root = path.join(base, "repo");
  const outside = path.join(base, "outside");
  put(outside, "package.json");
  fs.mkdirSync(root, { recursive: true });
  try { fs.symlinkSync(outside, path.join(root, "svc")); } catch { t.skip("symlinks unavailable"); return; }
  const file = path.join(root, "svc", "c.fx");
  fs.writeFileSync(file, "x\n");
  const r = core.resolveToolCwd(file, lang("nearest:package.json"), { root });
  assert.equal(r.cwd, root);
  assert.match(r.reason, /outside/);
});

test("resolveToolCwd: a symlink that stays inside the root is a hit", (t) => {
  const root = scratch();
  put(root, "real/package.json");
  try { fs.symlinkSync(path.join(root, "real"), path.join(root, "alias")); } catch { t.skip("symlinks unavailable"); return; }
  const file = put(root, "real/a.fx");
  assert.deepEqual(core.resolveToolCwd(path.join(root, "alias", "a.fx"), lang("nearest:package.json"), { root }), { cwd: path.join(root, "alias") });
  assert.ok(fs.existsSync(file));
});

test("resolveToolCwd: a file outside the root falls back to the root", () => {
  const base = scratch();
  const root = path.join(base, "repo");
  fs.mkdirSync(root, { recursive: true });
  put(base, "package.json");
  const file = put(base, "elsewhere/x.fx");
  const r = core.resolveToolCwd(file, lang("nearest:package.json"), { root });
  assert.equal(r.cwd, root);
  assert.match(r.reason, /outside/);
});

// A relative file is the context root's, never the process working directory's (ARCH-STATE-20). Each call runs in a child
// started in `cwd`, so the answer cannot lean on this test process's own directory.
function resolveFrom(cwd, root, file, spec) {
  const probe = `import * as core from ${JSON.stringify(pathToFileURL(CORE_SRC).href)};
const [root, file, spec] = JSON.parse(process.argv[1]);
process.stdout.write(JSON.stringify(core.resolveToolCwd(file, { cwd: spec }, { root })));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe, JSON.stringify([root, file, spec])], { cwd, encoding: "utf8", env: cleanEnv() });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("resolveToolCwd: a relative file resolves against the context root from any working directory, like its absolute spelling", () => {
  const base = scratch();
  const root = path.join(base, "repo");
  put(root, "svc/package.json");
  put(root, "svc2/package.json");
  const abs = put(root, "svc/src/deep/a.fx");
  const rel = path.relative(root, abs);
  const spec = "nearest:package.json";
  const want = { cwd: path.join(root, "svc") };
  const elsewhere = scratch("tool-cwd-elsewhere-");
  assert.deepEqual(resolveFrom(elsewhere, root, abs, spec), want, "absolute, from outside the root: as before");
  assert.deepEqual(resolveFrom(elsewhere, root, rel, spec), want, "relative, from a directory outside the root");
  assert.deepEqual(resolveFrom(path.join(root, "svc2"), root, rel, spec), want, "relative, from another service inside the root");
  assert.deepEqual(resolveFrom(path.join(root, "svc2"), root, abs, spec), want, "absolute, from another service inside the root: as before");
  assert.deepEqual(resolveFrom(root, root, rel, spec), want, "relative, from the root itself");
});

test("resolveToolCwd: a relative file that climbs out of the root is still outside it, whatever the working directory", () => {
  const base = scratch();
  const root = path.join(base, "repo");
  put(root, "package.json");
  put(base, "x.fx");
  const r = resolveFrom(root, root, "../x.fx", "nearest:package.json");
  assert.equal(r.cwd, root);
  assert.match(r.reason, /outside/);
});

// -------------------------------------------------------------------- tokenize ---

test("tokenize: without a tool cwd the token list is relative to the root, as before", () => {
  const root = scratch();
  const file = path.join(root, "svc", "src", "a.fx");
  const expected = ["tool", "--flag", path.relative(root, file), path.dirname(path.relative(root, file))];
  assert.deepEqual(core.tokenize("tool --flag {file} {dir}", file, { root }), expected);
  assert.deepEqual(core.tokenize("tool --flag {file} {dir}", file, { root }, null), expected, "an explicit null is the same");
});

test("tokenize: with a tool cwd {file} and {dir} are POSIX paths relative to it", () => {
  const root = scratch();
  const svc = path.join(root, "svc");
  assert.deepEqual(core.tokenize("tool {file} {dir}", path.join(svc, "src", "a.fx"), { root }, svc), ["tool", "src/a.fx", "src"]);
  assert.deepEqual(core.tokenize("tool {file} {dir}", path.join(svc, "a.fx"), { root }, svc), ["tool", "a.fx", "."]);
  assert.deepEqual(core.tokenize("tool {file}", path.join(svc, "my dir", "a b.fx"), { root }, svc), ["tool", "my dir/a b.fx"], "one argument still");
});

// ------------------------------------------------------------------- runChecks ---

function services() {
  const base = scratch();
  const root = path.join(base, "repo");
  put(root, "svc/package.json");
  put(root, "svc2/package.json");
  const stub = put(base, "stub.cjs", STUB);
  return { base, root, stub, context: { root, stateDir: path.join(root, ".craftsman") }, svc: path.join(root, "svc") };
}

test("runChecks: with cwd nearest:package.json the tool runs in the service, {file} and {dir} relative to it", async () => {
  const { root, stub, context, svc } = services();
  const file = put(root, "svc/src/a.fx");
  const r = await core.runChecks(file, lang("nearest:package.json", { check: [`node ${stub} {file} {dir}`] }), {}, context);
  assert.equal(r.failures.length, 1);
  const seen = stubJson(r.failures[0].out);
  assert.equal(seen.cwd, svc, "the spawn cwd is the marker directory");
  assert.deepEqual(seen.argv, ["src/a.fx", "src"]);
});

test("runChecks: without the cwd key the tool runs at the root, {file} and {dir} relative to it", async () => {
  const { root, stub, context } = services();
  const file = put(root, "svc/src/a.fx");
  const r = await core.runChecks(file, lang(undefined, { check: [`node ${stub} {file} {dir}`] }), {}, context);
  const seen = stubJson(r.failures[0].out);
  assert.equal(seen.cwd, root);
  assert.deepEqual(seen.argv, ["svc/src/a.fx", "svc/src"]);
});

test("runChecks: a format command runs in the resolved cwd too", async () => {
  const { root, stub, context, svc } = services();
  const file = put(root, "svc/src/a.fx");
  await core.runChecks(file, lang("nearest:package.json", { format: [`node ${stub} {file}`], check: [] }), {}, context);
  assert.equal(fs.readFileSync(path.join(svc, "ran.log"), "utf8"), "src/a.fx\n");
  assert.equal(fs.existsSync(path.join(root, "ran.log")), false, "nothing ran at the root");
});

test("runChecks: a relative bin is probed in the resolved cwd - present there it runs, absent it is skipped", async () => {
  const { root, context, svc } = services();
  put(svc, "tools/lint", "#!/bin/sh\necho \"lint in $(pwd -P) got $*\"\nexit 1\n", 0o755);
  const spec = lang("nearest:package.json", { check: ["./tools/lint {file}"] });
  const here = await core.runChecks(put(root, "svc/src/a.fx"), spec, {}, context);
  assert.deepEqual(here.skipped, [], "the bin exists under svc");
  assert.equal(here.failures.length, 1);
  assert.match(here.failures[0].out, new RegExp(`lint in ${svc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} got src/a\\.fx`));
  const there = await core.runChecks(put(root, "svc2/a.fx"), spec, {}, context);
  assert.deepEqual(there.skipped, ["./tools/lint"], "no such bin under svc2: unavailable, so skipped");
  assert.deepEqual(there.failures, []);
  assert.deepEqual(there.unavailable, []);
});

// -------------------------------------------------------------------- cacheKey ---

test("cacheKey: the same content under two resolved cwds does not share a key", () => {
  const { root, context } = services();
  const a = put(root, "svc/x.fx", "same\n");
  const b = put(root, "svc2/x.fx", "same\n");
  const cfg = { noisePatterns: [], ignore: [], baselineNewOnly: true };
  const nested = lang("nearest:package.json", { check: ["tool {file}"] });
  assert.notEqual(core.cacheKey(a, nested, cfg, context), core.cacheKey(b, nested, cfg, context));
  assert.equal(core.cacheKey(a, nested, cfg, context), core.cacheKey(a, nested, cfg, context), "deterministic");
});

test("cacheKey: a language without the cwd key keeps today's key, and ignores where the file is", () => {
  const { root, context } = services();
  const a = put(root, "svc/x.fx", "same\n");
  const b = put(root, "svc2/x.fx", "same\n");
  const cfg = { noisePatterns: ["^n"], ignore: ["**/i"], baselineNewOnly: true };
  const plain = lang(undefined, { check: ["tool {file}"], format: ["fmt {file}"], projectScoped: true });
  const legacy = crypto.createHash("sha1").update(fs.readFileSync(a)).update("fx").update(JSON.stringify(plain.check))
    .update(JSON.stringify(plain.format)).update("true").update(JSON.stringify({ n: cfg.noisePatterns, i: cfg.ignore, b: cfg.baselineNewOnly })).digest("hex");
  assert.equal(core.cacheKey(a, plain, cfg, context), legacy);
  assert.equal(core.cacheKey(a, plain, cfg), legacy, "the context is optional");
  assert.equal(core.cacheKey(a, plain, cfg, context), core.cacheKey(b, plain, cfg, context));
});

// ---------------------------------------------------------------- the hook, e2e ---

// A git repo whose `fixture` language (".fx" files) names `check` and, when given, `cwd`; the stub lives outside it.
function gateRepo({ check, cwd }) {
  const base = scratch("tool-cwd-gate-");
  const root = path.join(base, "repo");
  fs.mkdirSync(root, { recursive: true });
  for (const a of [["init", "-q"], ["config", "user.email", "t@e.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"]])
    spawnSync("git", a, { cwd: root });
  put(root, "README.md", "fixture\n");
  put(root, "craftsman.config.json", JSON.stringify({
    security: { enabled: false },
    stopGate: { requireAcceptanceCriteria: false },
    languages: { fixture: { extensions: [".fx"], check: [check.replace("STUB", put(base, "stub.cjs", STUB))], ...(cwd === undefined ? {} : { cwd }) } },
  }));
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  return { base, root };
}

function edit(root, sid, rel, content) {
  const file = put(root, rel, content);
  return spawnSync(process.execPath, [QUALITY_GATE], {
    cwd: root, encoding: "utf8", env: cleanEnv(),
    input: JSON.stringify({ session_id: sid, tool_name: "Edit", tool_input: { file_path: file } }),
  });
}

function gateEvents(root) {
  try {
    return fs.readFileSync(path.join(root, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.ev === "gate");
  } catch { return []; }
}

const TOOL = "node STUB {file} {dir}";
const PASS = "node -e 0";
const CRASH = 'node -e "process.kill(process.pid,\'SIGKILL\')"';
const NOTICE = /fell back to the project root/g;

test("quality-gate: a language with cwd nearest:package.json runs its tool in the service and the gate event carries the cwd", () => {
  const { root } = gateRepo({ check: TOOL, cwd: "nearest:package.json" });
  put(root, "svc/package.json");
  const r = edit(root, "tc-nested", "svc/src/a.fx", "x\n");
  assert.equal(r.status, 2, "the stub's finding blocks the edit");
  const seen = stubJson(r.stderr);
  assert.equal(seen.cwd, path.join(root, "svc"), "the tool ran in the service directory");
  assert.deepEqual(seen.argv, ["src/a.fx", "src"]);
  const [e] = gateEvents(root);
  assert.equal(e.result, "fail");
  assert.equal(e.cwd, "svc", "the root-relative cwd");
  assert.equal(r.stderr.match(NOTICE), null, "a hit is not a fallback");
});

test("quality-gate: a run at the root logs no cwd field", () => {
  const { root } = gateRepo({ check: TOOL, cwd: "nearest:package.json" });
  put(root, "package.json");
  const r = edit(root, "tc-root", "a.fx", "x\n");
  assert.equal(r.status, 2);
  assert.equal(stubJson(r.stderr).cwd, root);
  const [e] = gateEvents(root);
  assert.equal("cwd" in e, false);
  assert.equal(fs.existsSync(path.join(root, ".craftsman", "sessions", "tc-root", "tool-cwd-fallback")), false);
});

test("quality-gate: a cached pass and a pass-through event also name the nested cwd", () => {
  const { root } = gateRepo({ check: PASS, cwd: "nearest:package.json" });
  put(root, "svc/package.json");
  assert.equal(edit(root, "tc-cached", "svc/a.fx", "x\n").status, 0);
  assert.equal(edit(root, "tc-cached", "svc/a.fx", "x\n").status, 0);
  const gate = gateEvents(root);
  assert.deepEqual(gate.map((e) => e.result), ["pass", "cached"]);
  for (const e of gate) assert.equal(e.cwd, "svc", e.result);
});

test("quality-gate: the same file content in two services is not a cache hit", () => {
  const { root } = gateRepo({ check: PASS, cwd: "nearest:package.json" });
  put(root, "a/package.json");
  put(root, "b/package.json");
  assert.equal(edit(root, "tc-two", "a/x.fx", "same\n").status, 0);
  assert.equal(edit(root, "tc-two", "b/x.fx", "same\n").status, 0);
  assert.deepEqual(gateEvents(root).map((e) => [e.result, e.cwd]), [["pass", "a"], ["pass", "b"]]);
});

test("quality-gate: a spec that falls back to the root says so once per session across two failing edits", () => {
  const { root } = gateRepo({ check: TOOL, cwd: "nearest:package.json" }); // no package.json anywhere
  const first = edit(root, "tc-notice", "svc/a.fx", "one\n");
  const second = edit(root, "tc-notice", "svc/a.fx", "two\n");
  for (const r of [first, second]) {
    assert.equal(r.status, 2);
    assert.equal(stubJson(r.stderr).cwd, root, "the tool still ran, at the root");
  }
  const said = [first, second].map((r) => (r.stdout + r.stderr).match(NOTICE)?.length ?? 0);
  assert.deepEqual(said, [1, 0], "the first edit says it, the second does not");
  assert.match(first.stderr, /nearest:package\.json/);
  assert.match(first.stderr, /no marker/);
  assert.ok(fs.existsSync(path.join(root, ".craftsman", "sessions", "tc-notice", "tool-cwd-fallback")));
  assert.equal(gateEvents(root).some((e) => "cwd" in e), false, "a fallback is the root: no cwd field");
});

test("quality-gate: another session says the fallback again", () => {
  const { root } = gateRepo({ check: TOOL, cwd: "nearest:package.json" });
  const a = edit(root, "tc-sess-a", "a.fx", "one\n");
  const b = edit(root, "tc-sess-b", "a.fx", "two\n");
  for (const r of [a, b]) assert.equal(r.stderr.match(NOTICE)?.length, 1);
});

test("quality-gate: a passing edit says the fallback as a systemMessage, once", () => {
  const { root } = gateRepo({ check: PASS, cwd: "nearest:package.json" });
  const first = edit(root, "tc-pass", "a.fx", "one\n");
  const second = edit(root, "tc-pass", "a.fx", "two\n");
  assert.equal(first.status, 0);
  assert.match(JSON.parse(first.stdout).systemMessage, /fell back to the project root/);
  assert.equal(second.stdout, "");
});

test("quality-gate: a malformed spec falls back to the root and says so", () => {
  const { root } = gateRepo({ check: TOOL, cwd: "nearest:" });
  put(root, "svc/package.json");
  const r = edit(root, "tc-bad", "svc/a.fx", "x\n");
  assert.equal(r.status, 2);
  assert.equal(stubJson(r.stderr).cwd, root);
  assert.match(r.stderr, /malformed/);
  assert.equal(r.stderr.match(NOTICE)?.length, 1);
});

test("quality-gate: a crashed tool and a fallback share one systemMessage document", () => {
  const { root } = gateRepo({ check: CRASH, cwd: "nearest:package.json" });
  const r = edit(root, "tc-both", "a.fx", "x\n");
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout); // one JSON document, not two
  assert.match(out.systemMessage, /crashed and is unavailable/);
  assert.match(out.systemMessage, /fell back to the project root/);
});

test("quality-gate: a language without the cwd key runs at the root with no notice and no cwd field", () => {
  const { root } = gateRepo({ check: TOOL });
  put(root, "svc/package.json");
  const r = edit(root, "tc-plain", "svc/src/a.fx", "x\n");
  assert.equal(r.status, 2);
  const seen = stubJson(r.stderr);
  assert.equal(seen.cwd, root);
  assert.deepEqual(seen.argv, ["svc/src/a.fx", "svc/src"]);
  assert.equal(r.stderr.match(NOTICE), null);
  assert.equal("cwd" in gateEvents(root)[0], false);
});

// ------------------------------------------------------------ process.cwd() ban ---

test("no code path of the tool cwd reads process.cwd()", () => {
  const gate = fs.readFileSync(QUALITY_GATE, "utf8");
  assert.doesNotMatch(gate, /process\.cwd\(\)/, "quality-gate.mjs");
  const src = fs.readFileSync(CORE_SRC, "utf8");
  for (const name of ["resolveToolCwd", "tokenize", "runOne", "runChecks", "cacheKey"]) {
    const m = new RegExp(`(?:export )?(?:async )?function ${name}\\b[\\s\\S]*?\\n}\\n`).exec(src);
    assert.ok(m, `${name} found in core.mjs`);
    assert.doesNotMatch(m[0], /process\.cwd\(\)/, name);
  }
});
