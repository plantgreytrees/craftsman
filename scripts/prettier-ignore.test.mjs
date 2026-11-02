// The quality gate runs `prettier --write` on every Edit or Write, and the
// repo has no prettier config, so a hand-formatted source was rewritten whole.
// .prettierignore lists scripts/, workflows/ and hooks/ to stop that.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

// prettier reads .prettierignore from its cwd, so every run starts at the repo root
function prettier(args) {
  return spawnSync("prettier", args, { cwd: ROOT, encoding: "utf8" });
}

for (const file of HAND_FORMATTED) {
  test(`prettier --file-info reports ${file} as ignored`, { skip: SKIP }, () => {
    const result = prettier(["--file-info", file]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ignored, true);
  });
}

test("prettier --write leaves scripts/lib/core.mjs byte-identical", { skip: SKIP }, () => {
  const file = path.join(ROOT, "scripts/lib/core.mjs");
  const before = fs.readFileSync(file);
  try {
    const result = prettier(["--write", "--log-level", "silent", "scripts/lib/core.mjs"]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.readFileSync(file).equals(before), "prettier rewrote scripts/lib/core.mjs");
  } finally {
    // a rewrite must not leave the working tree dirty, whatever the assertion said
    if (!fs.readFileSync(file).equals(before)) fs.writeFileSync(file, before);
  }
});
