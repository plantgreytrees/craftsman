// ARCH-SAFETY-05 / ARCH-SAFETY-03: a quoted literal that merely names an assignment or a removal is not one;
// a real assignment or removal still is refused.

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-quoted-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    return spawnSync(process.execPath, [GUARD], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({
        session_id: "quotedtest",
        tool_name: "Bash",
        tool_input: { command },
      }),
    }).status;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const NAMES = [
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_PROJECT_DIR",
  "CRAFTSMAN_SAFETY",
];

for (const N of NAMES) {
  test(`A: node -e literal naming ${N}= is allowed`, () => {
    assert.equal(run(`node -e 'console.log("${N}=1")'`), 0);
  });
  test(`B: grep pattern ${N}= is allowed`, () => {
    assert.equal(run(`grep -n "${N}=" README.md`), 0);
  });
  test(`C: printf text ${N}=x is allowed`, () => {
    assert.equal(run(`printf '%s' "text ${N}=x"`), 0);
  });
  test(`D: echo "export ${N}=x" is allowed`, () => {
    assert.equal(run(`echo "export ${N}=x"`), 0);
  });
  test(`refused: ${N}=x node a.mjs`, () => {
    assert.equal(run(`${N}=x node a.mjs`), 2);
  });
  test(`refused: env ${N}=x node a.mjs`, () => {
    assert.equal(run(`env ${N}=x node a.mjs`), 2);
  });
  test(`refused: export ${N}=x`, () => {
    assert.equal(run(`export ${N}=x`), 2);
  });
  test(`refused: sh -c '${N}=x node a.mjs'`, () => {
    assert.equal(run(`sh -c '${N}=x node a.mjs'`), 2);
  });
  // Auditor bypass attempts (6.4)
  test(`bypass refused: quote-split name ${N}`, () => {
    const split = `${N.slice(0, 6)}""${N.slice(6)}`;
    assert.equal(run(`${split}=x node a.mjs`), 2);
  });
  test(`bypass refused: eval string ${N}`, () => {
    assert.equal(run(`eval "${N}=x node a.mjs"`), 2);
  });
  test(`bypass refused: echo piped to sh ${N}`, () => {
    assert.equal(run(`echo "${N}=x" | sh`), 2);
  });
  test(`bypass refused: command substitution ${N}`, () => {
    assert.equal(run(`echo "$(${N}=x env)"`), 2);
  });
  test(`bypass refused: here-string ${N}`, () => {
    assert.equal(run(`bash <<< "${N}=x node a.mjs"`), 2);
  });
  test(`bypass refused: xargs ${N}`, () => {
    assert.equal(run(`echo x | xargs env ${N}=x`), 2);
  });
  test(`bypass refused: assignment after an echo ${N}`, () => {
    assert.equal(run(`echo hi; ${N}=x node a.mjs`), 2);
  });
}

test("E: grep naming rm next to a for loop is allowed", () => {
  assert.equal(
    run(`grep -n "rm -f" README.md; for f in a b; do echo $f; done`),
    0,
  );
});
test("F: printf naming a removal piped to cat is allowed", () => {
  assert.equal(run(`printf '%s' "rm .craftsman/x" | cat`), 0);
});
test("refused: real removal inside a loop", () => {
  assert.equal(run(`for f in x; do rm .craftsman/off; done`), 2);
});
test("bypass refused: removal in a loop after a quoted grep", () => {
  assert.equal(
    run(`grep -n "rm -f" README.md; for f in x; do rm .craftsman/off; done`),
    2,
  );
});
test("bypass refused: printf text run by a loop's eval", () => {
  assert.equal(run(`for f in x; do eval "rm .craftsman/off"; done`), 2);
});
test("bypass refused: quoted rm piped to sh in a loop", () => {
  assert.equal(
    run(`for f in x; do printf '%s' "rm .craftsman/off" | sh; done`),
    2,
  );
});
test('bypass refused: path-qualified ./echo "CLAUDE_PROJECT_DIR=..."', () => {
  assert.equal(run('./echo "CLAUDE_PROJECT_DIR=/tmp/x node a.mjs"'), 2);
});
test('bypass refused: path-qualified ./grep "rm -rf .craftsman" before a loop', () => {
  assert.equal(
    run('./grep "rm -rf .craftsman" x; for f in a; do echo $f; done'),
    2,
  );
});

// Round-2 records: safety assignments and loop removals behind hash -p, enable -n or a PATH override.
const ROUND2_BLOCKED = [
  'hash -p /usr/bin/env grep; grep "CLAUDE_PROJECT_DIR=/tmp/x" node a.mjs',
  'hash -p /usr/bin/env grep; grep "CRAFTSMAN_SAFETY=/tmp/x" node a.mjs',
  'PATH=/tmp/p:$PATH grep "CLAUDE_PROJECT_DIR=/tmp/x node a.mjs"',
  'enable -n echo; hash -p /usr/bin/env echo; echo "CLAUDE_PROJECT_DIR=/tmp/x" node a.mjs',
  'for f in a; do hash -p /usr/bin/env grep; grep "rm" "-rf" ".craftsman"; done',
  'for f in a; do hash -p /usr/bin/env grep; grep "rm" "-rf" \'.craftsman\'; done',
  "for f in a; do hash -p /usr/bin/env grep; grep rm -rf .craftsman; done",
];
for (const command of ROUND2_BLOCKED) {
  test(`blocked (round 2): ${command}`, () => assert.equal(run(command), 2));
}
