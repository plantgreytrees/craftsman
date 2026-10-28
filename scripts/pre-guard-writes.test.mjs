// ARCH-SAFETY-05: quoted separators, variable command words and sed w/W cannot hide a write of craftsman state.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GUARD = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "pre-guard.mjs",
);

function run(command) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-writes-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    return spawnSync(process.execPath, [GUARD], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({
        session_id: "writestest",
        tool_name: "Bash",
        tool_input: { command },
      }),
    }).status;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const BLOCKED = [
  "sed -e 's/a/b/;s/c/d/' -i .claude/settings.json",
  "sed 's/a/b/;s/c/d/' -i craftsman.config.json",
  "sed '1d;2d' -i hooks/hooks.json",
  "perl -pe 's/a/b/;' -i hooks/hooks.json",
  "sed -e '/x/{s/a/b/;}' --in-place=.bak craftsman.config.json",
  "sed 's/a/b/;s/c/d/' -i .craftsman/off",
  "x=sed; $x -i 's/x/y/' .claude/settings.json",
  "x=sed; \"$x\" -i 's/x/y/' .claude/settings.json",
  "x=sed; ${x} --in-place 's/x/y/' .claude/settings.json",
  "p=perl; $p -pi -e 's/x/y/' .claude/settings.json",
  "sed 's/a/b/w.claude/settings.json' x",
  "sed 's/a/b/whooks/hooks.json' x",
  "sed -n 'W craftsman.config.json' x",
  "sed -n 'Whooks/hooks.json' x",
  "sed -n '1Wcraftsman.config.json' x",
];
for (const command of BLOCKED)
  test(`blocked: ${command}`, () => assert.equal(run(command), 2));

for (const command of [
  "sed -n 1,5p README.md",
  'grep -n "sed -i" scripts/x.mjs; cat craftsman.config.json',
]) {
  test(`allowed: ${command}`, () => assert.equal(run(command), 0));
}
