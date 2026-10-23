import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FILE_CAPS } from "./doc-size-policy.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("unit-runner implement flow has the red-green step (ARCH-ENGINE-21)", () => {
  assert.match(read("agents/unit-runner.md"), /write each testable criterion's test first and run it red before the change/);
});

test("implementer carries the reviewer check: refuse a test that never failed", () => {
  assert.match(read("agents/implementer.md"), /Reviewer refuses a unit whose new test never failed/);
});

test("code-reviewer refuses a unit whose evidence lacks each new test's failing run", () => {
  assert.match(read("agents/code-reviewer.md"), /evidence names the failing run of each new test, else Critical/);
});

test("verification before completion: evidence names fresh gate output", () => {
  assert.match(read("agents/unit-runner.md"), /evidence names fresh gate output/);
});

test("edited agents stay within their doc-size caps", () => {
  for (const f of ["agents/unit-runner.md", "agents/implementer.md", "agents/code-reviewer.md"]) {
    assert.ok(Buffer.byteLength(read(f)) <= FILE_CAPS[f], f);
  }
});
