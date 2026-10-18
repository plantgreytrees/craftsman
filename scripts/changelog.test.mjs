// ARCH-SLIM-08: [Unreleased] stays under 8 KB; cut a release before it grows past that.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_UNRELEASED_BYTES = 8 * 1024;

test("CHANGELOG [Unreleased] is under 8 KB", () => {
  const text = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  const m = text.match(/^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[)/m);
  assert.ok(m, "[Unreleased] section not found");
  assert.ok(Buffer.byteLength(m[1]) <= MAX_UNRELEASED_BYTES, `[Unreleased] is ${Buffer.byteLength(m[1])} bytes`);
});

test("a dated release follows [Unreleased]", () => {
  const text = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  assert.match(text, /^## \[2\.2\.0\] - \d{4}-\d{2}-\d{2}$/m);
});
