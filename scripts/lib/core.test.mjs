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
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  globToRe, deepMerge, normLine, tokenize, splitCmd, filterAttributed, extractSig,
  markerPresent, isIgnored, detectLang, cacheKey, sidOf, PROJECT_ROOT,
  renderKnownIssuesDoc, gitTrackedFiles, pruneSessions, recordFailure, topRules,
  writeRootPin, rootPinPath,
} from "./core.mjs";

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

test("extractSig: eslint's --format unix [Error/rule-id] suffix is captured over the generic fallback", () => {
  assert.equal(extractSig("eslint", "src/x.js:1:1: 'y' is never reassigned. [Error/prefer-const]"), "prefer-const");
});

test("extractSig: a scoped eslint rule ([Warning/plugin/rule-id]) is captured whole", () => {
  assert.equal(extractSig("eslint", "src/x.tsx:2:2: missing key. [Warning/react/jsx-key]"), "react/jsx-key");
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
