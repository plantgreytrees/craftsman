// The quality gate runs `prettier --write` on every Edit or Write, and the
// repo has no prettier config, so a hand-formatted source was rewritten whole.
// .prettierignore lists scripts/, workflows/ and hooks/ to stop that.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HAS_PRETTIER = spawnSync("prettier", ["--version"], { encoding: "utf8" }).status === 0;
const SKIP = HAS_PRETTIER ? false : "prettier is not on the PATH";

const HAND_FORMATTED = [
  "scripts/pre-guard.mjs",
  "scripts/lib/core.mjs",
  "scripts/pre-guard.test.mjs",
  "workflows/run.js",
  "hooks/register.js",
];

// prettier reads .prettierignore from its cwd, so each run names the directory it starts in
function prettier(args, cwd = ROOT) {
  return spawnSync("prettier", args, { cwd, encoding: "utf8" });
}

for (const file of HAND_FORMATTED) {
  test(`prettier --file-info reports ${file} as ignored`, { skip: SKIP }, () => {
    const result = prettier(["--file-info", file]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ignored, true);
  });
}

// The write runs on a temp copy of the source and the ignore file, so a broken
// ignore file rewrites the copy and can never touch the live scripts/lib/core.mjs.
test("prettier --write leaves a temp copy of scripts/lib/core.mjs byte-identical", { skip: SKIP }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-prettier-ignore-"));
  try {
    const copy = path.join(dir, "scripts/lib/core.mjs");
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "scripts/lib/core.mjs"), copy);
    fs.copyFileSync(path.join(ROOT, ".prettierignore"), path.join(dir, ".prettierignore"));
    const before = fs.readFileSync(copy);
    const result = prettier(["--write", "--log-level", "silent", "scripts/lib/core.mjs"], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.readFileSync(copy).equals(before), "prettier rewrote the copy of scripts/lib/core.mjs");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
