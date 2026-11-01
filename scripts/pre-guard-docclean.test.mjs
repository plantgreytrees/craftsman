import { test, before, after } from "node:test";
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
let tmp;

before(() => {
  tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-docclean-")),
  );
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: tmp });
  fs.mkdirSync(path.join(tmp, "docs"));
  fs.writeFileSync(path.join(tmp, "docs", "x.md"), "x\n");
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const guard = (command) =>
  spawnSync(process.execPath, [GUARD], {
    cwd: tmp,
    input: JSON.stringify({
      session_id: "docclean",
      tool_name: "Bash",
      tool_input: { command },
    }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
  });

test("a glob-spelled git clean is refused by the doc guard", () => {
  for (const command of [
    "/usr/bin/g[i]t clean -fdx",
    "/usr/bin/gi? clean -fdx",
    "{ /usr/bin/g?t clean -fdx; }",
    "if true; then /usr/bin/g?t clean -fdx; fi",
  ]) {
    const r = guard(command);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, /doc/i, command);
  }
});

test("wrapper, subcommand-glob and autocorrect spellings of git clean are refused", () => {
  for (const command of [
    "command /usr/bin/g?t clean -fdx",
    "env /usr/bin/g?t clean -fdx",
    "timeout 9 /usr/bin/g?t clean -fdx",
    "nohup /usr/bin/g?t clean -fdx",
    "git cl?an -fdx",
    "git cl[e]an -fdx",
    "git -c help.autocorrect=immediate claen -fdx",
  ]) {
    const r = guard(command);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, /doc-write authority/, command);
  }
});

test("globbed git subcommands and config indirection are refused", () => {
  for (const command of [
    "git cl[!x]an -fdx",
    "git cl[[:alpha:]]an -fdx",
    "git [!x]lean -fdx",
    "git * -fdx",
    "git -C docs * -fdx",
    "git -c include.path=/tmp/cfg claen -fdx",
    "GIT_CONFIG_GLOBAL=/tmp/g git claen -fdx",
    "HOME=/tmp/h git claen -fdx",
    "XDG_CONFIG_HOME=/tmp/h git claen -fdx",
  ]) {
    const r = guard(command);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, /doc-write authority/, command);
  }
});

test("globs in ordinary commands still pass", () => {
  for (const command of ["git add src/*.ts", "git status docs/*", "ls *.md"]) {
    const r = guard(command);
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
});

test("prose `clean` still passes", () => {
  for (const command of [
    "echo clean",
    "git status; echo clean",
    "if git diff --quiet; then echo clean; fi",
  ]) {
    const r = guard(command);
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
});
