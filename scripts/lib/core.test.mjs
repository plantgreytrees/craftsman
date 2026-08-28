// Unit tests for scripts/lib/core.mjs — pure-logic helpers, plus a few
// integration-style checks (markerPresent, cacheKey) against this repo's own
// real git/filesystem state, since PROJECT_ROOT resolves deterministically to
// this checkout wherever `node --test` is actually invoked from.
// Uses Node's built-in test runner (no external dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  globToRe, deepMerge, normLine, tokenize, filterAttributed, extractSig,
  markerPresent, isIgnored, detectLang, cacheKey, sidOf, PROJECT_ROOT,
  renderKnownIssuesDoc,
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

test("detectLang: matches by extension, first language block wins", () => {
  const cfg = { languages: { python: { extensions: [".py"] }, javascript: { extensions: [".js"] } } };
  assert.equal(detectLang("/repo/a.py", cfg).name, "python");
  assert.equal(detectLang("/repo/a.js", cfg).name, "javascript");
  assert.equal(detectLang("/repo/a.rs", cfg), null);
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
