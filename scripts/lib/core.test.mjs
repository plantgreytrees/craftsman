// Unit tests for scripts/lib/core.mjs — pure-logic helpers, plus a few
// integration-style checks (markerPresent, cacheKey) against this repo's own
// real git/filesystem state, since PROJECT_ROOT resolves deterministically to
// this checkout wherever `node --test` is actually invoked from.
// Uses Node's built-in test runner (no external dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  globToRe, deepMerge, normLine, tokenize, splitCmd, filterAttributed, extractSig,
  markerPresent, isIgnored, detectLang, cacheKey, sidOf, PROJECT_ROOT,
  renderKnownIssuesDoc, gitTrackedFiles, pruneSessions, recordFailure, topRules,
  writeRootPin, rootPinPath, resolveProjectRoot, agentGrantFile, grantRunnerDispatches, spendRunnerDispatch,
  acceptanceCriteria, featureCriteria, runnerDispatchCount, hasDocWriteGrant,
} from "./core.mjs";
import * as coreNs from "./core.mjs";
import { writeBaseline, filterBaseline } from "./core.mjs";

test("globToRe: ** crosses path segments", () => {
  const re = globToRe("**/node_modules/**");
  assert.equal(re.test("a/b/node_modules/c"), true);
});

test("globToRe: single * does not cross a /", () => {
  const re = globToRe("*.js");
  assert.equal(re.test("a/b.js"), false);
  assert.equal(re.test("b.js"), true);
});

test("globToRe: ? matches exactly one character", () => {
  const re = globToRe("a?c");
  assert.equal(re.test("abc"), true);
  assert.equal(re.test("ac"), false);
  assert.equal(re.test("abbc"), false);
});

test("globToRe: {a,b} alternation matches either branch", () => {
  const re = globToRe("*.{js,ts}");
  assert.equal(re.test("x.js"), true);
  assert.equal(re.test("x.ts"), true);
  assert.equal(re.test("x.py"), false);
});

test("globToRe: literal regex metacharacters are escaped", () => {
  const re = globToRe("a.b");
  assert.equal(re.test("aXb"), false);
  assert.equal(re.test("a.b"), true);
});

test("deepMerge: nested object keys merge recursively", () => {
  const base = { a: { x: 1, y: 2 } };
  const override = { a: { y: 3 } };
  assert.deepEqual(deepMerge(base, override), { a: { x: 1, y: 3 } });
});

test("deepMerge: array in override replaces base array wholesale", () => {
  const base = { a: [1, 2, 3] };
  const override = { a: [4] };
  assert.deepEqual(deepMerge(base, override), { a: [4] });
});

test("deepMerge: scalar override replaces scalar base", () => {
  const base = { a: 1 };
  const override = { a: 2 };
  assert.deepEqual(deepMerge(base, override), { a: 2 });
});

test("normLine: strips :N and :N:M line/col suffixes to :N", () => {
  assert.equal(normLine("foo.py:42:7: error"), "foo.py:N: error");
  assert.equal(normLine("foo.py:42: error"), "foo.py:N: error");
});

test("normLine: collapses runs of whitespace to a single space", () => {
  assert.equal(normLine("foo   bar\t\tbaz"), "foo bar baz");
});

test("normLine: trims leading/trailing whitespace", () => {
  assert.equal(normLine("  foo.py:1: error  "), "foo.py:N: error");
});

test("tokenize: a {file} value containing a space stays one argument", () => {
  const file = path.join(PROJECT_ROOT, "src/My Feature/thing.py");
  const parts = tokenize("eslint --fix {file}", file);
  assert.deepEqual(parts, ["eslint", "--fix", "src/My Feature/thing.py"]);
});

test("tokenize: {dir} substitutes the parent directory, also as one argument", () => {
  const file = path.join(PROJECT_ROOT, "pkg with space/mod.go");
  const parts = tokenize("go vet ./{dir}", file);
  assert.deepEqual(parts, ["go", "vet", "./pkg with space"]);
});

test("tokenize: quoted tokens in the template are unquoted before substitution", () => {
  const file = path.join(PROJECT_ROOT, "a.rb");
  const parts = tokenize('rubocop --format "emacs" {file}', file);
  assert.deepEqual(parts, ["rubocop", "--format", "emacs", "a.rb"]);
});

test("splitCmd: a quoted argument with an embedded space stays one token", () => {
  assert.deepEqual(splitCmd("pytest -q -k 'test something'"), ["pytest", "-q", "-k", "test something"]);
});

test("splitCmd: a plain unquoted command still splits on whitespace", () => {
  assert.deepEqual(splitCmd("gitleaks dir . --no-banner --redact"), ["gitleaks", "dir", ".", "--no-banner", "--redact"]);
});

test("filterAttributed: keeps only lines whose leading path matches the edited file", () => {
  const lines = [
    "src/lib.rs:10:5: warning: unused variable",
    "src/other.rs:3:1: warning: dead code",
    "note: this is a continuation with no path prefix",
  ];
  assert.deepEqual(filterAttributed(lines, "src/lib.rs"), ["src/lib.rs:10:5: warning: unused variable"]);
});

test("filterAttributed: a go-vet-style leading \"./\" doesn't defeat the match", () => {
  const lines = ["./pkg/handler.go:12:3: message", "./pkg/other.go:5:1: message"];
  assert.deepEqual(filterAttributed(lines, "pkg/handler.go"), ["./pkg/handler.go:12:3: message"]);
});

test("filterAttributed: matches by path suffix when a tool resolves relative to a different base", () => {
  const lines = ["handler.go:12:3: message reported package-relative"];
  assert.deepEqual(filterAttributed(lines, "pkg/handler.go"), lines);
});

test("filterAttributed: a line with no path:line prefix is dropped, not kept as ungrounded context", () => {
  assert.deepEqual(filterAttributed(["  --> just an arrow, no path"], "src/lib.rs"), []);
});

const ESLINT_JSON = JSON.stringify([{
  filePath: "/p/src/x.js",
  messages: [
    { ruleId: "prefer-const", severity: 2, message: "'y' is never reassigned.", line: 1, column: 1 },
    { ruleId: "react/jsx-key", severity: 1, message: "missing key.", line: 2, column: 2 },
    { ruleId: null, severity: 2, message: "Parsing error: Unexpected token", line: 3, column: 4 },
  ],
}]);
const ESLINT_LINES = [
  "/p/src/x.js:1:1: 'y' is never reassigned. [Error/prefer-const]",
  "/p/src/x.js:2:2: missing key. [Warning/react/jsx-key]",
  "/p/src/x.js:3:4: Parsing error: Unexpected token [Error]",
];

test("parseEslintJson: turns eslint --format json into path:line:col: message [Severity/rule] lines", () => {
  assert.deepEqual(coreNs.parseEslintJson(ESLINT_JSON), ESLINT_LINES);
});

test("parseEslintJson: extractSig on a converted line is the rule id, scoped rules whole", () => {
  const [a, b] = coreNs.parseEslintJson(ESLINT_JSON);
  assert.equal(extractSig("eslint", a), "prefer-const");
  assert.equal(extractSig("eslint", b), "react/jsx-key");
});

test("parseEslintJson: unparseable or non-array output is null, an empty result is []", () => {
  assert.equal(coreNs.parseEslintJson("Oops, something went wrong!"), null);
  assert.equal(coreNs.parseEslintJson('{"not":"an array"}'), null);
  assert.deepEqual(coreNs.parseEslintJson("[]"), []);
});

test("parseEslintJson: the baseline new-issues-only result matches the old unix-format fixture", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-eslint-base-"));
  try {
    const ctx = { stateDir: dir };
    writeBaseline("/p/src/x.js", ESLINT_LINES.slice(0, 2), ctx);
    const fromJson = filterBaseline("/p/src/x.js", coreNs.parseEslintJson(ESLINT_JSON), ctx);
    const fromUnix = filterBaseline("/p/src/x.js", ESLINT_LINES, ctx);
    assert.deepEqual(fromJson, fromUnix);
    assert.deepEqual(fromJson, [ESLINT_LINES[2]]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("shipped config: every eslint check asks for json, never the removed unix formatter", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../../craftsman.config.json", import.meta.url), "utf8"));
  const cmds = Object.values(cfg.languages).flatMap((l) => l.check || []).filter((c) => c.startsWith("eslint"));
  assert.ok(cmds.length >= 4);
  for (const c of cmds) assert.match(c, /--format json/, c);
});

// A fake `eslint` on PATH: prints $FAKE_ESLINT_OUT, appends to $FAKE_ESLINT_LOG, exits $FAKE_ESLINT_EXIT.
function fakeEslintDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-fake-eslint-"));
  const bin = path.join(dir, "eslint");
  fs.writeFileSync(bin, '#!/bin/sh\necho x >> "$FAKE_ESLINT_LOG"\nprintf %s "$FAKE_ESLINT_OUT"\nexit ${FAKE_ESLINT_EXIT:-0}\n');
  fs.chmodSync(bin, 0o755);
  return dir;
}
function fakeEnv(extra) {
  const env = cleanEnv(extra);
  for (const k of ["CLAUDE_PLUGIN_ROOT", "CRAFTSMAN"]) delete env[k];
  return env;
}
const CORE_URL = pathToFileURL(fileURLToPath(new URL("./core.mjs", import.meta.url))).href;

function runChecksWithFake(exit, out) {
  const bins = fakeEslintDir();
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-rc-"));
  try {
    const code = `const m = await import(${JSON.stringify(CORE_URL)});
      const lang = { name: "javascript", check: ["eslint --no-color --format json {file}"] };
      const r = await m.runChecks(${JSON.stringify(path.join(proj, "a.js"))}, lang, {}, { root: ${JSON.stringify(proj)}, stateDir: ${JSON.stringify(proj + "/.craftsman")} });
      console.log(JSON.stringify(r));`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: proj, encoding: "utf8",
      env: fakeEnv({ PATH: `${bins}${path.delimiter}${process.env.PATH}`, FAKE_ESLINT_OUT: out, FAKE_ESLINT_EXIT: String(exit), FAKE_ESLINT_LOG: path.join(proj, "eslint.log") }),
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  } finally {
    fs.rmSync(bins, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  }
}

test("runChecks: eslint exit 1 with JSON findings becomes failure lines", () => {
  const r = runChecksWithFake(1, ESLINT_JSON);
  assert.equal(r.failures.length, 1);
  assert.deepEqual(r.failures[0].out.split("\n"), ESLINT_LINES);
  assert.deepEqual(r.unavailable || [], []);
});

test("runChecks: eslint exit 2 (crash) is unavailable, never a finding", () => {
  const r = runChecksWithFake(2, "Oops! Something went wrong! :(");
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.unavailable, ["eslint"]);
});

test("runChecks: unparseable output on exit 1 is unavailable, never a finding", () => {
  const r = runChecksWithFake(1, "not json at all");
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.unavailable, ["eslint"]);
});

test("quality-gate: an eslint crash twice gives one notice, zero findings, no block, one tool run", () => {
  const bins = fakeEslintDir();
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-qg-"));
  try {
    const git = (...a) => spawnSync("git", a, { cwd: proj, encoding: "utf8" });
    git("init", "-q");
    fs.writeFileSync(path.join(proj, "a.js"), "const a = 1;\n");
    const log = path.join(proj, "eslint.log");
    const env = fakeEnv({ PATH: `${bins}${path.delimiter}${process.env.PATH}`, FAKE_ESLINT_OUT: "crash", FAKE_ESLINT_EXIT: "2", FAKE_ESLINT_LOG: log });
    const gate = fileURLToPath(new URL("../quality-gate.mjs", import.meta.url));
    const run = () => spawnSync(process.execPath, [gate], {
      cwd: proj, encoding: "utf8", env,
      input: JSON.stringify({ session_id: "qg-crash", tool_name: "Edit", tool_input: { file_path: path.join(proj, "a.js") } }),
    });
    const first = run();
    fs.writeFileSync(path.join(proj, "a.js"), "const a = 2;\n"); // new content: not served from the pass cache
    const second = run();
    for (const r of [first, second]) {
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, "", "a crash is never a finding the model must fix");
    }
    assert.match(first.stdout, /eslint/);
    assert.match(first.stdout, /unavailable/);
    assert.equal(second.stdout, "", "reported once per session");
    assert.equal(fs.readFileSync(log, "utf8").split("\n").filter(Boolean).length, 1, "the failure is cached for the session");
  } finally {
    fs.rmSync(bins, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  }
});

test("extractSig: a bare trailing (rule-id), as some other formatters emit, is also recognized", () => {
  assert.equal(extractSig("stylelint", "src/x.css:1:1  error  Expected a leading zero  (number-leading-zero)"), "number-leading-zero");
});

test("extractSig: a leading tool code (ruff/mypy-style) is captured", () => {
  assert.equal(extractSig("ruff", "x.py:1:1: E501 line too long (92 > 88 characters)"), "E501");
});

test("extractSig: falls back to the generic uppercase/digit-suffixed pattern", () => {
  assert.equal(extractSig("sometool", "CS0246: type or namespace not found"), "CS0246");
});

test("sidOf: strips characters outside [A-Za-z0-9_-] and caps length", () => {
  assert.equal(sidOf({ session_id: "abc/def ghi" }), "abc_def_ghi");
  assert.equal(sidOf({ session_id: "x".repeat(100) }).length, 64);
});

test("sidOf: missing or empty session_id falls back to \"shared\"", () => {
  assert.equal(sidOf({}), "shared");
  assert.equal(sidOf({ session_id: "" }), "shared");
});

test("pruneSessions: removes stale sessions from the selected project state directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-prune-"));
  const context = { stateDir: path.join(root, ".craftsman") };
  const stale = path.join(context.stateDir, "sessions", "old-session");
  fs.mkdirSync(stale, { recursive: true });
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(stale, old, old);
  try {
    pruneSessions(1_000, context);
    assert.equal(fs.existsSync(stale), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("detectLang: matches by extension, first language block wins", () => {
  const cfg = { languages: { python: { extensions: [".py"] }, javascript: { extensions: [".js"] } } };
  assert.equal(detectLang("/repo/a.py", cfg).name, "python");
  assert.equal(detectLang("/repo/a.js", cfg).name, "javascript");
  assert.equal(detectLang("/repo/a.rs", cfg), null);
});

test("detectLang: matches by exact filename for extension-less markers like Dockerfile", () => {
  const cfg = { languages: { dockerfile: { extensions: [], filenames: ["Dockerfile"] } } };
  assert.equal(detectLang("/repo/Dockerfile", cfg).name, "dockerfile");
  assert.equal(detectLang("/repo/services/api/Dockerfile", cfg).name, "dockerfile");
  assert.equal(detectLang("/repo/Dockerfile.dev", cfg), null);
});

test("detectLang: matches by project-relative path glob, scoped by context.root", () => {
  const cfg = { languages: { kubernetes: { extensions: [], paths: ["**/k8s/**/*.yaml", "**/k8s/**/*.yml"] } } };
  const context = { root: "/repo" };
  assert.equal(detectLang("/repo/deploy/k8s/service.yaml", cfg, context).name, "kubernetes");
  assert.equal(detectLang("/repo/docs/notes.yaml", cfg, context), null);
});

test("isIgnored: matches a project-relative path against an ignore glob", () => {
  const cfg = { ignore: ["**/node_modules/**"] };
  const ignoredFile = path.join(PROJECT_ROOT, "node_modules/foo/bar.js");
  const realFile = path.join(PROJECT_ROOT, "scripts/lib/core.mjs");
  assert.equal(isIgnored(ignoredFile, cfg, null), true);
  assert.equal(isIgnored(realFile, cfg, null), false);
});

test("cacheKey: identical inputs are deterministic; a changed config busts the key", () => {
  const file = path.join(PROJECT_ROOT, "does-not-exist-on-disk.py");
  const lang = { name: "python", check: ["ruff check {file}"] };
  const cfgA = { noisePatterns: ["^x"], ignore: [], baselineNewOnly: true };
  const cfgB = { noisePatterns: ["^y"], ignore: [], baselineNewOnly: true };
  assert.equal(cacheKey(file, lang, cfgA), cacheKey(file, lang, cfgA));
  assert.notEqual(cacheKey(file, lang, cfgA), cacheKey(file, lang, cfgB));

  const langFormatA = { name: "python", check: ["ruff check {file}"], format: ["black {file}"] };
  const langFormatB = { name: "python", check: ["ruff check {file}"], format: ["autopep8 {file}"] };
  assert.notEqual(cacheKey(file, langFormatA, cfgA), cacheKey(file, langFormatB, cfgA));

  const langScopedA = { name: "python", check: ["ruff check {file}"], projectScoped: true };
  const langScopedB = { name: "python", check: ["ruff check {file}"], projectScoped: false };
  assert.notEqual(cacheKey(file, langScopedA, cfgA), cacheKey(file, langScopedB, cfgA));
});

test("markerPresent: finds a literal marker at the project root via git ls-files", async () => {
  assert.equal(await markerPresent("craftsman.config.json"), true);
});

test("markerPresent: a glob marker matches at any depth", async () => {
  assert.equal(await markerPresent("*.json"), true);
});

test("markerPresent: a marker that doesn't exist anywhere in the repo returns false", async () => {
  assert.equal(await markerPresent("this-file-does-not-exist.xyz"), false);
});

test("gitTrackedFiles: sees an untracked-but-not-ignored scratch file", async () => {
  const scratch = path.join(PROJECT_ROOT, "craftsman-core-test-scratch.tmp");
  fs.writeFileSync(scratch, "scratch");
  try {
    const files = await gitTrackedFiles({ fresh: true });
    assert.ok(files.includes("craftsman-core-test-scratch.tmp"), "untracked scratch file should be listed");
  } finally {
    fs.rmSync(scratch, { force: true });
    await gitTrackedFiles({ fresh: true });
  }
});

test("renderKnownIssuesDoc: empty entries renders a clean-state message, no table", () => {
  const doc = renderKnownIssuesDoc([], "2026-01-01");
  assert.match(doc, /No pre-existing issues found/);
  assert.doesNotMatch(doc, /\| File \|/);
});

test("renderKnownIssuesDoc: sorts rows worst-first by finding count", () => {
  const doc = renderKnownIssuesDoc([
    { rel: "a.py", lang: "python", tools: ["ruff"], count: 2, sample: "a" },
    { rel: "b.py", lang: "python", tools: ["ruff"], count: 9, sample: "b" },
  ], "2026-01-01");
  const aIdx = doc.indexOf("`a.py`");
  const bIdx = doc.indexOf("`b.py`");
  assert.ok(bIdx > 0 && aIdx > bIdx, "b.py (9 findings) should appear before a.py (2 findings)");
});

test("renderKnownIssuesDoc: a \"|\" in a sample is escaped so it can't break the table", () => {
  const doc = renderKnownIssuesDoc([
    { rel: "x.rs", lang: "rust", tools: ["clippy"], count: 1, sample: "message | with a pipe" },
  ], "2026-01-01");
  const row = doc.split("\n").find((l) => l.includes("x.rs"));
  assert.ok(row.includes("message \\| with a pipe"), "the pipe inside the sample must be backslash-escaped");
});

test("renderKnownIssuesDoc: a long sample is truncated, not left to overflow the row", () => {
  const doc = renderKnownIssuesDoc([
    { rel: "x.go", lang: "go", tools: ["staticcheck"], count: 1, sample: "x".repeat(300) },
  ], "2026-01-01");
  const row = doc.split("\n").find((l) => l.includes("`x.go`"));
  assert.ok(row.length < 300, "row should be far shorter than the raw 300-char sample");
  assert.match(row, /…/);
});

test("renderKnownIssuesDoc: reports the total file and finding counts in the summary line", () => {
  const doc = renderKnownIssuesDoc([
    { rel: "a.py", lang: "python", tools: ["ruff"], count: 3, sample: "a" },
    { rel: "b.py", lang: "python", tools: ["ruff"], count: 5, sample: "b" },
  ], "2026-01-01");
  assert.match(doc, /2 file\(s\), 8 finding\(s\) total/);
});

// craftsman.config.json ships `learnedRules.enabled` and EXTENDING.md documents
// the block, but both functions used to ignore the flag entirely: turning it
// off still collected failures and still narrated them at session start.
test("learnedRules: an absent enabled flag means on, so existing configs are unaffected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-rules-"));
  try {
    const context = { stateDir: dir };
    const cfg = { learnedRules: { minOccurrences: 1 } };
    recordFailure("ts", "eslint", "a.ts:1:1: oops [Error/no-undef]", cfg, context);
    assert.equal(topRules(cfg, context).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("learnedRules: enabled:false stops recordFailure writing anything at all", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-rules-"));
  try {
    const context = { stateDir: dir };
    const cfg = { learnedRules: { enabled: false, minOccurrences: 1 } };
    recordFailure("ts", "eslint", "a.ts:1:1: oops [Error/no-undef]", cfg, context);
    assert.equal(fs.existsSync(path.join(dir, "learned-rules.json")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("learnedRules: enabled:false surfaces nothing even when rules were collected earlier", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-rules-"));
  try {
    const context = { stateDir: dir };
    recordFailure("ts", "eslint", "a.ts:1:1: oops [Error/no-undef]", { learnedRules: { minOccurrences: 1 } }, context);
    assert.equal(topRules({ learnedRules: { minOccurrences: 1 } }, context).length, 1);
    assert.deepEqual(topRules({ learnedRules: { enabled: false, minOccurrences: 1 } }, context), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------- root pinning (ARCH-STATE-01) ---
const CORE = fileURLToPath(new URL("./core.mjs", import.meta.url));
const HOOKS_JSON = path.join(path.dirname(CORE), "..", "..", "hooks", "hooks.json");
const initRepo = (cwd) => spawnSync("git", ["init", "-q"], { cwd, encoding: "utf8" });
function printRoot(cwd, env) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e",
    `const m = await import(${JSON.stringify(pathToFileURL(CORE).href)}); ` +
    `console.log(JSON.stringify({ root: m.PROJECT_ROOT, source: m.ROOT_SOURCE, enabled: m.enabled({}, null) }));`,
  ], { cwd, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_PROJECT_DIR;
  delete env.CRAFTSMAN_WORKSPACE_MANIFEST;
  return { ...env, ...extra };
}

// ARCH-AUTO-06, ARCH-LAND-05: the /auto marker is live only while its run is.
test("autoActive: live for a fresh or open plan; lapsed when aged out, finished or legacy", () => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-marker-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: repo });
    const events = [
      { key: ".::docs/plans/open.md::u1", plan: "docs/plans/open.md", unit: "u1", status: "PENDING" },
      { key: ".::docs/plans/open.md::u2", plan: "docs/plans/open.md", unit: "u2", status: "PENDING" },
      { key: ".::docs/plans/open.md::u2", plan: "docs/plans/open.md", unit: "u2", status: "MERGED", evidence: "x" },
      { key: ".::docs/plans/done.md::u1", plan: "docs/plans/done.md", unit: "u1", status: "PENDING" },
      { key: ".::docs/plans/done.md::u1", plan: "docs/plans/done.md", unit: "u1", status: "PARKED", evidence: "x" },
      { key: ".::bare::u1", plan: "bare", unit: "u1", status: "MERGED", evidence: "x" }, // a bare-slug row counts
    ];
    fs.mkdirSync(path.join(repo, ".craftsman", "tracker"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".craftsman", "tracker", "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `const m = await import(${JSON.stringify(pathToFileURL(CORE).href)}); ` +
      `const old = new Date(Date.now() - m.AUTO_MARKER_MAX_AGE_MS - 1000).toISOString(); ` +
      `m.writeAutoMarker("fresh", "unplanned"); m.writeAutoMarker("open", "open"); m.writeAutoMarker("done", "done"); ` +
      `m.writeAutoMarker("aged", "open", old); m.writeAutoMarker("bare", "bare"); ` +
      `m.writeAutoMarker("legacy", "open"); const fs = await import("node:fs"); fs.writeFileSync(m.autoMarkerFile("legacy"), "2026-10-09T00:00:00.000Z\\n"); ` +
      `const sids = ["fresh", "open", "done", "aged", "legacy", "absent", "bare"]; ` +
      `console.log(JSON.stringify([sids.map((sid) => m.autoActive(sid)), sids.map((sid) => m.autoForceBlock(sid))]));`,
    ], { cwd: repo, env: cleanEnv({ CLAUDE_PROJECT_DIR: repo }), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const [active, forceBlock] = JSON.parse(result.stdout);
    assert.deepEqual(active, [true, true, false, false, false, false, false],
      "fresh (no rows yet) and open are live; parked, aged, legacy, absent and landed are not");
    assert.deepEqual(forceBlock, [true, true, true, false, false, false, false],
      "the force block also holds while rows are PARKED for Phase C");
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test("PROJECT_ROOT: identical from five different cwds under one CLAUDE_PROJECT_DIR", () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-root-")));
  try {
    const repo = path.join(base, "repo");
    const other = path.join(base, "other");
    // A repo nested inside the project — a unit worktree or a submodule —
    // is where cwd-first resolution used to split state (idea R6).
    const nested = path.join(repo, ".worktrees", "unit-1");
    fs.mkdirSync(path.join(repo, "src", "deep"), { recursive: true });
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(other);
    initRepo(repo);
    initRepo(nested);
    initRepo(other);
    const env = cleanEnv({ CLAUDE_PROJECT_DIR: repo });
    const roots = [repo, path.join(repo, "src", "deep"), nested, other, base].map((cwd) => printRoot(cwd, env).root);
    assert.deepEqual(roots, [repo, repo, repo, repo, repo]);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test("PROJECT_ROOT: a Bash-run script with no CLAUDE_PROJECT_DIR follows the session pin, not cwd", () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-pin-")));
  const sid = `pin-test-${process.pid}`;
  try {
    const repo = path.join(base, "repo");
    const other = path.join(base, "other");
    fs.mkdirSync(path.join(repo, "sub"), { recursive: true });
    fs.mkdirSync(other);
    initRepo(repo);
    initRepo(other);
    writeRootPin(sid, repo);
    const env = cleanEnv({ CLAUDE_CODE_SESSION_ID: sid });
    assert.deepEqual(printRoot(path.join(repo, "sub"), env), { root: repo, source: "session-pin", enabled: true });
    assert.equal(printRoot(base, env).root, repo, "a non-git cwd above the repo still gets the pinned root");
    // A different repository (a test fixture, another checkout) keeps its own root.
    assert.equal(printRoot(other, env).root, other);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(rootPinPath(sid), { force: true });
  }
});

test("PROJECT_ROOT: a symlinked pin or a group/world-writable craftsman-roots dir is ignored", () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-pin-trust-")));
  const tmp = path.join(base, "tmp");
  const sid = "pin-trust";
  const resolve = () => resolveProjectRoot({ env: { CLAUDE_CODE_SESSION_ID: sid }, cwd: base, tmp });
  try {
    const repo = path.join(base, "repo");
    fs.mkdirSync(repo);
    initRepo(repo);
    assert.equal(writeRootPin(sid, repo, tmp), rootPinPath(sid, tmp));
    assert.deepEqual(resolve(), { root: repo, source: "session-pin" }, "control: a private pin is trusted");

    const planted = path.join(base, "planted");
    fs.writeFileSync(planted, `${repo}\n`);
    fs.rmSync(rootPinPath(sid, tmp));
    fs.symlinkSync(planted, rootPinPath(sid, tmp));
    assert.equal(resolve().source, "cwd", "a symlinked pin is not followed");

    fs.rmSync(rootPinPath(sid, tmp));
    assert.ok(writeRootPin(sid, repo, tmp));
    fs.chmodSync(path.dirname(rootPinPath(sid, tmp)), 0o777);
    assert.equal(resolve().source, "cwd", "a world-writable roots dir is not trusted");
    assert.equal(writeRootPin(sid, repo, tmp), null, "nor written into");
    fs.chmodSync(path.dirname(rootPinPath(sid, tmp)), 0o770);
    assert.equal(resolve().source, "cwd", "nor a group-writable one");
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test("spendRunnerDispatch: a 2-count grant spends twice then denies, and waits out a concurrent holder", async () => {
  const sid = `spend-retry-${process.pid}`;
  const grant = agentGrantFile("runner", sid);
  try {
    grantRunnerDispatches(2, sid);
    assert.deepEqual([spendRunnerDispatch(sid), spendRunnerDispatch(sid), spendRunnerDispatch(sid)], [true, true, false]);

    // Another spender holds the grant (renamed to its .spent- file) for 50ms.
    grantRunnerDispatches(1, sid);
    const holder = spawn(process.execPath, ["-e", `
      const fs = require("node:fs");
      const [grant, held] = [${JSON.stringify(grant)}, ${JSON.stringify(`${grant}.spent-holder`)}];
      fs.renameSync(grant, held);
      process.stdout.write("held\\n");
      setTimeout(() => fs.renameSync(held, grant), 50);
    `], { stdio: ["ignore", "pipe", "inherit"] });
    await new Promise((resolve) => holder.stdout.once("data", resolve));
    const exited = new Promise((resolve) => holder.once("exit", resolve));
    assert.equal(spendRunnerDispatch(sid), true, "the spend waits for the holder rather than denying");
    await exited;
    assert.equal(spendRunnerDispatch(sid), false, "and took the only dispatch");
  } finally { fs.rmSync(path.dirname(grant), { recursive: true, force: true }); }
});

test("PROJECT_ROOT: a non-git CLAUDE_PROJECT_DIR is off without a workspace manifest, on with one", () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-above-")));
  try {
    fs.mkdirSync(path.join(base, "repo"));
    initRepo(path.join(base, "repo"));
    const env = cleanEnv({ CLAUDE_PROJECT_DIR: base });
    assert.deepEqual(printRoot(path.join(base, "repo"), env), { root: base, source: "project-dir", enabled: false });
    fs.writeFileSync(path.join(base, "craftsman.workspace.json"), JSON.stringify({ version: 1, projects: { repo: { root: "repo" } } }));
    assert.deepEqual(printRoot(path.join(base, "repo"), env), { root: base, source: "project-dir", enabled: true });
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test("hooks never resolve a project from process.cwd()", () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).hooks;
  const scripts = new Set(Object.values(hooks).flat().flatMap((entry) => entry.hooks)
    .map((hook) => /scripts\/([\w-]+\.mjs)/.exec(hook.command)?.[1]).filter(Boolean));
  assert.ok(scripts.size > 3);
  for (const script of scripts) {
    const source = fs.readFileSync(path.join(path.dirname(CORE), "..", script), "utf8");
    assert.doesNotMatch(source, /(projectContext|resolveSelectedProject|resolveProjectRoot|gitTop)\([^)]*process\.cwd\(\)/, script);
  }
});

test("ARCH-STATE-07: craftsman registers no SubagentStop hook", () => {
  assert.equal("SubagentStop" in JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).hooks, false);
});

// plan-hierarchy config keys (ARCH-ENGINE-12, ARCH-ENGINE-18)
const CFG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "craftsman.config.json");

test("config: hierarchy key defaults, and project config overrides them", () => {
  const c = JSON.parse(fs.readFileSync(CFG, "utf8"));
  assert.deepEqual(
    [c.planning.featureBranches, c.planning.featureUnitCap, c.tracker.publish, c.execution.maxSubagents, c.execution.maxSessions],
    [false, 8, "push", 0, 1]); // maxSubagents 0 = root-only
  const m = deepMerge(c, { planning: { featureBranches: true, featureUnitCap: 3 }, tracker: { publish: "pr" },
    execution: { maxSubagents: 2, maxSessions: 4 } });
  assert.deepEqual(
    [m.planning.featureBranches, m.planning.featureUnitCap, m.tracker.publish, m.execution.maxSubagents, m.execution.maxSessions],
    [true, 3, "pr", 2, 4]);
  assert.equal(m.tracker.nudgeLines, 300);
});

test("config: execution.maxSessions is reserved, read by nothing yet", () => {
  const root = path.dirname(CFG), hits = [];
  const walk = (d) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(f); }
    else if (!/\.test\.m?[jt]s$/.test(e.name) && fs.readFileSync(f, "utf8").includes("maxSessions")) hits.push(f);
  });
  for (const d of ["scripts", "hooks", "workflows", "commands", "agents", "skills"]) walk(path.join(root, d));
  assert.deepEqual(hits, []);
});

// ARCH-TRACKER-08: feature-tagged, untagged and mixed criteria.
const FC_TEXT = [
  "- [ ] [feature:a] gate a", "- [x] [feature:b] gate b", "- [ ] untagged", "- [ ] [unit:u1] unit only",
  "- [ ] [unit:u2] [feature:a] both",
].join("\n");
test("featureCriteria: tagged lines gate only their feature", () => {
  assert.equal(acceptanceCriteria(FC_TEXT)[0].feature, "a");
  assert.deepEqual(featureCriteria(FC_TEXT, "b").map((c) => c.line), ["- [x] [feature:b] gate b"]);
});
test("featureCriteria: untagged lines gate only the last feature", () => {
  assert.deepEqual(featureCriteria("- [ ] x\n- [ ] y", "a", false), []);
  assert.deepEqual(featureCriteria("- [ ] x\n- [ ] y", "z", true).map((c) => c.line), ["- [ ] x", "- [ ] y"]);
});
test("featureCriteria: mixed lines - last feature gets its tagged plus untagged, not unit-only", () => {
  assert.deepEqual(featureCriteria(FC_TEXT, "a", false).map((c) => c.line), ["- [ ] [feature:a] gate a", "- [ ] [unit:u2] [feature:a] both"]);
  assert.deepEqual(featureCriteria(FC_TEXT, "a", true).map((c) => c.line), ["- [ ] [feature:a] gate a", "- [ ] untagged", "- [ ] [unit:u2] [feature:a] both"]);
  assert.equal(acceptanceCriteria(FC_TEXT)[4].unit, "u2");
});

// ARCH-AUTO-08, ARCH-AUTO-09
function autoRun(events, docs, markers, expr) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-feat-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: repo });
    fs.mkdirSync(path.join(repo, ".craftsman", "tracker"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".craftsman", "tracker", "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    fs.mkdirSync(path.join(repo, "docs", "plans"), { recursive: true });
    for (const [name, text] of Object.entries(docs)) fs.writeFileSync(path.join(repo, "docs", "plans", `${name}.md`), text);
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `const m = await import(${JSON.stringify(pathToFileURL(CORE).href)}); ` +
      markers.map(([sid, plan]) => `m.writeAutoMarker(${JSON.stringify(sid)}, ${JSON.stringify(plan)}); `).join("") + expr,
    ], { cwd: repo, env: cleanEnv({ CLAUDE_PROJECT_DIR: repo }), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
}
test("autoActive/autoForceBlock: FEATURE_MERGED is open; grant adds +1 per feature", () => {
  const ev = (status) => [{ key: "k", plan: "docs/plans/p.md", unit: "u", status }];
  const [active, force] = autoRun(ev("FEATURE_MERGED"), {}, [["s", "p"]], `console.log(JSON.stringify([m.autoActive("s"), m.autoForceBlock("s")]));`);
  assert.equal(active, true);
  assert.equal(force, true);
  const [landedActive, landedForce] = autoRun(ev("COMPLETE"), {}, [["s", "p"]], `console.log(JSON.stringify([m.autoActive("s"), m.autoForceBlock("s")]));`);
  assert.equal(landedActive, false);
  assert.equal(landedForce, false);
  assert.equal(runnerDispatchCount(2, 0), 16);
  assert.equal(runnerDispatchCount(2, 3), 19);
});
test("autoActive: an epic slug resolves through plan-index; COMPLETE children release the marker", () => {
  const docs = {
    epic: "---\nslug: epic\nlevel: epic\nchildren: [story]\n---\n# e\n",
    story: "---\nslug: story\nlevel: story\nparent: epic\n---\n# s\n",
  };
  const row = (status) => [{ key: "k", plan: "docs/plans/story.md", unit: "u", status }];
  const expr = `console.log(JSON.stringify([m.autoActive("s"), m.autoForceBlock("s")]));`;
  assert.deepEqual(autoRun(row("COMPLETE"), docs, [["s", "epic"]], expr), [false, false]);
  assert.deepEqual(autoRun(row("PENDING"), docs, [["s", "epic"]], expr), [true, true]);
});

test("hasDocWriteGrant: pending grant, session grant and none", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-grant-"));
  try {
    const ctx = { root: dir, grantStateDir: dir };
    assert.equal(hasDocWriteGrant({ sid: "s1" }, ctx), false);
    fs.writeFileSync(path.join(dir, "doc-write-pending"), "x");
    assert.equal(hasDocWriteGrant({ sid: "s1" }, ctx), true);
    assert.equal(fs.existsSync(path.join(dir, "sessions", "s1", "doc-write")), false, "read-only by default");
    assert.equal(hasDocWriteGrant({ sid: "s1", claim: true }, ctx), true);
    assert.equal(fs.existsSync(path.join(dir, "sessions", "s1", "doc-write")), true, "claim writes the session marker");
    fs.rmSync(path.join(dir, "doc-write-pending"));
    assert.equal(hasDocWriteGrant({ sid: "s1" }, ctx), true, "session marker alone grants");
    assert.equal(hasDocWriteGrant({ sid: "s2" }, ctx), false, "other session has none");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 7.1: an advisory hook still fails open on bad input, but never silently (ARCH-SAFETY-04).
test("advisorySkipped: one visible notice per hook per session, then silence", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-advisory-"));
  try {
    const code = `const m = await import(${JSON.stringify(CORE_URL)});
      process.stdout.write(JSON.stringify([m.advisorySkipped("quality-gate", "bad input"), m.advisorySkipped("quality-gate", "bad input"), m.advisorySkipped("stop-gate", "bad input")]));`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: proj, encoding: "utf8", env: { ...fakeEnv({ CLAUDE_CODE_SESSION_ID: "advisory-unit" }) },
    });
    assert.equal(r.status, 0, r.stderr);
    const notices = r.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l).systemMessage);
    assert.deepEqual(notices, ["craftsman: quality-gate skipped (bad input), advisory only", "craftsman: stop-gate skipped (bad input), advisory only"]);
  } finally {
    fs.rmSync(proj, { recursive: true, force: true });
  }
});

for (const script of ["quality-gate.mjs", "stop-gate.mjs", "builtin-skill-context.mjs"]) {
  test(`${script}: bad JSON twice is exit 0 and exactly one notice`, () => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-advisory-spawn-"));
    try {
      spawnSync("git", ["init", "-q"], { cwd: proj });
      const file = fileURLToPath(new URL(`../${script}`, import.meta.url));
      const run = () => spawnSync(process.execPath, [file], { cwd: proj, input: "not json", encoding: "utf8", env: fakeEnv({ CLAUDE_CODE_SESSION_ID: `advisory-${script}` }) });
      const first = run();
      const second = run();
      for (const r of [first, second]) assert.equal(r.status, 0, r.stderr);
      const name = script.replace(/\.mjs$/, "");
      assert.equal(first.stdout.split(`craftsman: ${name} skipped (bad input), advisory only`).length - 1, 1);
      assert.equal(second.stdout + second.stderr, "", "silent after the first notice");
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
}

// the SessionStart guard-state reasons, as a pure function
test("guardState: separates what turns safety off from what turns only the quality machinery off", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-guardstate-"));
  try {
    const ctx = { root: dir, offFlag: path.join(dir, "off") };
    assert.deepEqual(coreNs.guardState({ cfg: {}, context: ctx, env: {}, tmp: dir, sid: "g1" }), { safety: [], quality: [] });
    fs.writeFileSync(path.join(dir, "off"), "");
    const all = coreNs.guardState({ cfg: { enabled: false }, context: ctx, env: { CRAFTSMAN: "0", CRAFTSMAN_SAFETY: "off" }, tmp: dir, sid: "g1" });
    assert.deepEqual(all.safety, ["CRAFTSMAN_SAFETY=off is set in the environment"]);
    assert.equal(all.quality.length, 3);
    const marker = path.join(dir, `craftsman-launcher-${process.getuid?.() ?? 0}`, "node-missing-g2");
    fs.mkdirSync(marker, { recursive: true });
    const none = { root: dir, offFlag: path.join(dir, "none") };
    assert.deepEqual(coreNs.guardState({ cfg: {}, context: none, env: {}, tmp: dir, sid: "g2" }).safety,
      ["node was missing earlier this session (hooks/run.sh left its marker)"]);
    assert.deepEqual(coreNs.guardState({ cfg: {}, context: none, env: {}, tmp: dir, sid: "has.dot" }).safety, [],
      "a session id run.sh would not accept is the shared marker, not this session's");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 8.2: the safety side has one off switch, and it is the user's environment.
test("safetyEnabled: only CRAFTSMAN_SAFETY=off turns it off; CRAFTSMAN=off does not", () => {
  assert.equal(coreNs.safetyEnabled({}), true);
  assert.equal(coreNs.safetyEnabled({ CRAFTSMAN: "off" }), true);
  assert.equal(coreNs.safetyEnabled({ CRAFTSMAN: "0" }), true);
  assert.equal(coreNs.safetyEnabled({ CRAFTSMAN_SAFETY: "off" }), false);
  assert.equal(coreNs.safetyEnabled({ CRAFTSMAN_SAFETY: "OFF" }), false);
  assert.equal(coreNs.safetyEnabled({ CRAFTSMAN_SAFETY: "on" }), true);
});

test("recordCommand / commandInvoked: per session, by command, by route, and not past the ttl", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-commands-"));
  try {
    const context = { stateDir: dir };
    assert.equal(coreNs.commandInvoked("s1", ["plan"], { context }), false);
    coreNs.recordCommand("s1", "plan", "skill", context);
    assert.equal(coreNs.commandInvoked("s1", ["plan", "orchestrate"], { context }), true);
    assert.equal(coreNs.commandInvoked("s1", ["plan"], { context, via: "prompt" }), false, "route matters");
    assert.equal(coreNs.commandInvoked("s1", ["toggle"], { context }), false, "command matters");
    assert.equal(coreNs.commandInvoked("s2", ["plan"], { context }), false, "session matters");
    coreNs.recordCommand("s1", "plan", "prompt", context);
    assert.equal(coreNs.commandInvoked("s1", ["plan"], { context, via: "prompt" }), true);
    assert.equal(coreNs.commandInvoked("s1", ["plan"], { context, now: Date.now() + 2 * 3600 * 1000, ttlMs: 3600000 }), false, "ttl");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 11.1: not being in a git repo turns the quality machinery off and leaves safety on.
test("safetyEnabled vs enabled: a non-git project root leaves safety on and the quality side off, and logEvent writes nothing", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-core-nongit-")));
  try {
    const code = `const m = await import(${JSON.stringify(CORE_URL)});
      m.logEvent({ ev: "probe" });
      console.log(JSON.stringify({ safety: m.safetyEnabled({}), quality: m.enabled({}, null), off: m.safetyEnabled({ CRAFTSMAN_SAFETY: "off" }) }));`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: dir, encoding: "utf8", env: fakeEnv({ CLAUDE_PROJECT_DIR: dir }) });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { safety: true, quality: false, off: false });
    assert.equal(fs.existsSync(path.join(dir, ".craftsman")), false, "no events.jsonl for an unanchored root");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("RECORDED_COMMANDS: the doc writers, toggle and instruction (goal tokens are minted after /instruction)", () => {
  assert.ok(coreNs.RECORDED_COMMANDS.includes("instruction"));
  assert.ok(coreNs.RECORDED_COMMANDS.includes("toggle"));
  for (const name of coreNs.DOC_WRITER_COMMANDS) assert.ok(coreNs.RECORDED_COMMANDS.includes(name), name);
  assert.equal(coreNs.DOC_WRITER_COMMANDS.includes("instruction"), false, "/instruction writes nothing under docs/");
});

// A directory is not a marker: `mkdir` can create one without writing a file,
// so a grant or an off flag must be a regular file (ARCH-STATE-06, ARCH-SAFETY-05).
test("a directory is neither a doc-write grant nor an off flag", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-isfile-"));
  try {
    const ctx = { root: dir, grantStateDir: dir, offFlag: path.join(dir, "off") };
    fs.mkdirSync(path.join(dir, "doc-write-pending"));
    assert.equal(hasDocWriteGrant({ sid: "s1" }, ctx), false, "a pending directory grants nothing");
    fs.mkdirSync(path.join(dir, "sessions", "s1", "doc-write"), { recursive: true });
    assert.equal(hasDocWriteGrant({ sid: "s1" }, ctx), false, "a session marker directory grants nothing");
    fs.mkdirSync(ctx.offFlag);
    assert.equal(coreNs.enabled({}, ctx), true, "an off directory does not switch the machinery off");
    assert.deepEqual(coreNs.guardState({ cfg: {}, context: ctx, env: {}, tmp: dir, sid: "s1" }), { safety: [], quality: [] },
      "guardState agrees with enabled()");
    fs.rmSync(ctx.offFlag, { recursive: true });
    fs.writeFileSync(ctx.offFlag, "");
    assert.equal(coreNs.enabled({}, ctx), false, "a regular off file still does");
    fs.rmSync(path.join(dir, "doc-write-pending"), { recursive: true });
    fs.writeFileSync(path.join(dir, "doc-write-pending"), "x");
    assert.equal(hasDocWriteGrant({ sid: "s1" }, ctx), true, "a regular pending file still grants");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
