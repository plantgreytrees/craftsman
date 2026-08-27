// Unit tests for scripts/lib/core.mjs — pure-logic helpers only.
// Uses Node's built-in test runner (no external dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { globToRe, deepMerge, normLine } from "./core.mjs";

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
