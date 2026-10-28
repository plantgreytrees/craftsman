// ARCH-SAFETY-05: every GNU spelling of in-place sed/perl and a sed `w` write of a guarded file is a writer.

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-inplace-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    return spawnSync(process.execPath, [GUARD], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({
        session_id: "inplacetest",
        tool_name: "Bash",
        tool_input: { command },
      }),
    }).status;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const BLOCKED = [
  "sed --in s/a/b/ craftsman.config.json",
  "sed --in-pl s/a/b/ craftsman.config.json",
  "sed --i s/a/b/ craftsman.config.json",
  "sed --in-place s/a/b/ craftsman.config.json",
  "sed --in-place=.bak s/a/b/ craftsman.config.json",
  "sed -E --i s/a/b/ hooks/hooks.json",
  "sed -Ei s/a/b/ hooks/hooks.json",
  "perl -0pi -e s/a/b/ craftsman.config.json",
  "perl -0777pi -e s/a/b/ hooks/hooks.json",
  "perl -pi -e s/a/b/ hooks/hooks.json",
  "sed -n 's/a/b/w craftsman.config.json' README.md",
  "sed -n '1w hooks/hooks.json' README.md",
  "sed -n '1w craftsman.config.json' README.md",
  "sed -n 's/a/b/gw craftsman.config.json' README.md",
  "sed -n 's/a/b/pw hooks/hooks.json' README.md",
  "sed -n 's/a/b/Iw hooks/hooks.json' README.md",
  "sed -n 's/a/b/2w craftsman.config.json' README.md",
  "sed -n '1p;1w hooks/hooks.json' README.md",
  "sed -n '/a/{p;w craftsman.config.json}' README.md",
  "sed -n -e 1p -e '1w hooks/hooks.json' README.md",
  "sed -i s/a/b/ hooks/hooks.json",
  "./sed --in s/a/b/ craftsman.config.json",
  './echo "sed -i s/a/b/ hooks/hooks.json"',
  './echo "CLAUDE_PROJECT_DIR=/tmp/x node a.mjs"',
  './grep "rm -rf .craftsman" x; for f in a; do echo $f; done',
];

for (const command of BLOCKED) {
  test(`blocked: ${command}`, () => assert.equal(run(command), 2));
}

test("allowed: sed -n 1,5p README.md", () =>
  assert.equal(run("sed -n 1,5p README.md"), 0));
test("allowed: sed --in s/a/b/ README.md", () =>
  assert.equal(run("sed --in s/a/b/ README.md"), 0));
