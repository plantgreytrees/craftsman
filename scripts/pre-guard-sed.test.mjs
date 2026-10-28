// ARCH-SAFETY-05: read-only sed and a quoted `sed -i` pattern are not writers; real in-place edits of guarded files still are.

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-sed-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    return spawnSync(process.execPath, [GUARD], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({
        session_id: "sedtest",
        tool_name: "Bash",
        tool_input: { command },
      }),
    }).status;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("A: read-only sed next to a for loop over a settings path is allowed", () => {
  assert.equal(
    run(
      'sed -n 1,5p README.md; for f in ~/.claude/settings.json; do echo "$f"; done',
    ),
    0,
  );
});

test("B: a grep whose quoted pattern holds `sed -i` is not a writer", () => {
  assert.equal(
    run('grep -n "sed -i" scripts/x.mjs; cat craftsman.config.json'),
    0,
  );
});

test("C-E: in-place writes to guarded files stay blocked", () => {
  assert.equal(run("sed -i s/a/b/ craftsman.config.json"), 2);
  assert.equal(run("for f in x; do sed -i s/a/b/ .craftsman/off; done"), 2);
  assert.equal(run("perl -pi -e s/a/b/ hooks/hooks.json"), 2);
});

test("escaped quotes do not blank a live in-place edit", () => {
  assert.equal(
    run('echo \\"x; sed -i s/a/b/ craftsman.config.json; echo y\\"'),
    2,
  );
  assert.equal(
    run('echo \\"x; perl -pi -e s/a/b/ craftsman.config.json; echo y\\"'),
    2,
  );
  assert.equal(run('echo \\"x; sed -i s/a/b/ .craftsman/off; echo y\\"'), 2);
});

test("backslash-escaped quotes: sed -i on hooks.json or the settings file stays blocked", () => {
  assert.equal(run('echo \\"x; sed -i s/a/b/ hooks/hooks.json; echo y\\"'), 2);
  assert.equal(
    run('echo \\"x; sed -i s/a/b/ .claude/settings.json; echo y\\"'),
    2,
  );
});

test("an in-place edit after a real prose command stays blocked", () => {
  assert.equal(run("echo hi; sed -i s/a/b/ craftsman.config.json"), 2);
  assert.equal(run('grep -n "q" f; sed -i s/a/b/ craftsman.config.json'), 2);
  assert.equal(run('grep -n "q" f; perl -pi -e s/a/b/ hooks/hooks.json'), 2);
});

test("bypass attempts stay blocked", () => {
  assert.equal(run('s""ed -i s/a/b/ craftsman.config.json'), 2);
  assert.equal(run("'sed' -i s/a/b/ craftsman.config.json"), 2);
  assert.equal(run("$(echo sed) -i s/a/b/ craftsman.config.json"), 2);
  assert.equal(run("echo craftsman.config.json | xargs sed -i s/a/b/"), 2);
  assert.equal(run("sed -n -i s/a/b/ craftsman.config.json"), 2);
  assert.equal(run("sed --in-place s/a/b/ craftsman.config.json"), 2);
  assert.equal(run("bash -c 'sed -i s/a/b/ craftsman.config.json'"), 2);
  assert.equal(run("env sed -i s/a/b/ hooks/hooks.json"), 2);
  assert.equal(run("perl -i -pe s/a/b/ .craftsman/off"), 2);
  assert.equal(run('for f in x; do s""ed -i s/a/b/ hooks/hooks.json; done'), 2);
  // Auditor round (5.4): more spellings that must not slip past the blanked-prose verb.
  assert.equal(run("sed -i.bak s/a/b/ craftsman.config.json"), 2);
  assert.equal(run("sed -ni s/a/b/ craftsman.config.json"), 2);
  assert.equal(run("sed -i -e s/a/b/ .craftsman/off"), 2);
  assert.equal(run("echo 'x' && sed -i s/a/b/ craftsman.config.json"), 2);
  assert.equal(run('echo "$(sed -i s/a/b/ craftsman.config.json)"'), 2);
  assert.equal(run("`echo sed` -i s/a/b/ craftsman.config.json"), 2);
  assert.equal(
    run("find . -name x | xargs perl -pi -e s/a/b/ hooks/hooks.json"),
    2,
  );
  assert.equal(run('echo "sed -i"; sed -i s/a/b/ craftsman.config.json'), 2);
});

// Records of the in-place spelling probes (preguard-inplace-spellings) and the path-qualified quoted case.
const INPLACE_BLOCKED = [
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
];

for (const command of INPLACE_BLOCKED) {
  test(`blocked (recorded): ${command}`, () => assert.equal(run(command), 2));
}
