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

test("ANSI-C quoting, append assignments and POSIX-class wrappers cannot spell git clean past the doc guard", () => {
  for (const command of [
    "HOME+=/x git claen -fdx",
    "XDG_CONFIG_HOME+=/x git claen -fdx",
    "export HOME+=/x; git claen -fdx",
    "HOME=/tmp/h $'git' claen -fdx",
    "$'git' -c include.path=/tmp/c claen -fdx",
    "git cl$'e'an -fdx",
    "git $'clean' -fdx",
    "git cl$'\\x65'an -fdx",
    "git -c alias.claen=cl$'e'an claen -fdx",
    "env /usr/bin/g[[:alpha:]]t cl[[:alpha:]]an -fdx",
  ]) {
    const r = guard(command);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, /doc-write authority/, command);
  }
});

test("a HOME word that is not git's environment, and a git without a subcommand, still pass", () => {
  for (const command of ["echo HOME=/x; git lfs pull", "HOME=/tmp/h git --version"]) {
    const r = guard(command);
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
});

const refused = (commands) => {
  for (const command of commands) {
    const r = guard(command);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, /doc-write authority/, command);
  }
};
const passes = (commands) => {
  for (const command of commands) {
    const r = guard(command);
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
};

test("a wrapper in front of git does not hide config indirection (regression of c41ad91)", () => {
  refused([
    "env HOME=/tmp/h git claen -fdx",
    "HOME=/tmp/h command git claen -fdx",
    "HOME=/tmp/h env git claen -fdx",
    "HOME=/tmp/h nice git claen -fdx",
    "HOME=/tmp/h timeout 9 git claen -fdx",
    "export HOME=/tmp/h; command git claen -fdx",
    "export HOME=/tmp/h; env git claen -fdx",
    "export HOME=/tmp/h; nohup git claen -fdx",
    "export HOME=/tmp/h; exec git claen -fdx",
    "export HOME=/tmp/h; time git claen -fdx",
    "export GIT_CONFIG_GLOBAL=/tmp/g; command git claen -fdx",
    "command git -c include.path=/tmp/c claen -fdx",
    "env git -c include.path=/tmp/c claen -fdx",
    "env GIT_CONFIG_PARAMETERS=x git claen -fdx",
  ]);
});

test("a subcommand an alias can override is not a builtin under config indirection (regression of c41ad91)", () => {
  refused([
    "HOME=/tmp/h git scalar -fdx",
    "git -c include.path=/tmp/c daemon -fdx",
    "XDG_CONFIG_HOME=/tmp/h git pack-redundant -fdx",
  ]);
});

test("whatchanged, which an alias overrides, is not a builtin under config indirection", () => {
  refused([
    "HOME=/tmp/h git whatchanged -fdx",
    "git -c include.path=/tmp/c whatchanged -fdx",
  ]);
});

test("a NUL in a $'...' body ends the word, so the rest of the body cannot hide git clean", () => {
  refused([
    "git cl$'\\0'ean -fdx",
    "git $'clean\\0x' -fdx",
    "git $'clean\\x00' -fdx",
    "git $'clean\\u0000zz' -fdx",
    "git $'clean\\U00000000zz' -fdx",
    "git cl$'\\c@'ean -fdx",
    "git $'clean\\400zz' -fdx",
  ]);
});

test("a $\"...\" locale-quoted word reads as the plain quoted word", () => {
  refused(['git cl$"e"an -fdx', 'git $"clean" -fdx', 'git $"cl""ean" -fdx']);
});

test("git behind a keyword, a wrapper option, a nested shell or a substitution does not hide config indirection", () => {
  refused([
    "if true; then HOME=/tmp/h git claen -fdx; fi",
    "! HOME=/tmp/h git claen -fdx",
    "sudo HOME=/tmp/h git claen -fdx",
    "env -S 'HOME=/tmp/h git claen -fdx'",
    "bash -c 'env HOME=/tmp/h git claen -fdx'",
    "echo $(env HOME=/tmp/h git claen -fdx)",
    "echo `env HOME=/tmp/h git claen -fdx`",
    "time -p env HOME=/tmp/h git claen -fdx",
    "timeout --signal=KILL 9 env HOME=/tmp/h git claen -fdx",
    "nice -n 5 env HOME=/tmp/h git claen -fdx",
    "command -p git -c include.path=/tmp/c claen -fdx",
    "env -i HOME=/tmp/h git claen -fdx",
    "env --ignore-environment XDG_CONFIG_HOME=/tmp/h git claen -fdx",
    "export HOME=/tmp/h && command git claen -fdx",
    "HOME=/tmp/h; command git claen -fdx",
    "declare -x HOME=/tmp/h; command git claen -fdx",
    "echo | xargs env HOME=/tmp/h git claen -fdx",
    "HOME=/tmp/h env $G claen -fdx",
    "env HOME=/tmp/h $G $S",
    "git -c help.autoc$'o'rrect=immediate claen -fdx",
    "env GIT_CONF$'I'G_GLOBAL=/tmp/g git claen -fdx",
  ]);
});

test("env -S or --split-string cannot carry config indirection and git past the doc guard", () => {
  refused([
    "env --split-string='HOME=/tmp/h git claen -fdx'",
    "sudo env --split-string='HOME=/tmp/h git claen -fdx'",
    "timeout 9 env --split-string='HOME=/tmp/h git claen -fdx'",
    "nohup env --split-string='HOME=/tmp/h git claen -fdx'",
    "env -S'HOME=/tmp/h git claen -fdx'",
    "HOME=/tmp/h env --split-string='git claen -fdx'",
  ]);
});

test("a $' inside double quotes, an --attr-source value or HOME set by for/read/printf -v cannot hide git clean (round 9)", () => {
  refused([
    String.raw`echo "$'\0"; git c\lean -fdx; echo "'"`,
    String.raw`echo "$'\x00"; git c\lean -fdx; echo "'"`,
    String.raw`echo "$'\0"; r''m -rf docs; echo "'"`,
    String.raw`echo "$'\0"; m''v docs /tmp/zz; echo "'"`,
    String.raw`echo "$'"; git cle\an -fdx; echo "'"`,
    String.raw`echo "$'"; git cl\ean -fdx; echo "'"`,
    "HOME=/tmp/h git --attr-source status claen -fdx",
    "git -c include.path=/tmp/c --attr-source status claen -fdx",
    "for HOME in /tmp/h; do git claen -fdx; done",
    "read HOME <<< /tmp/h; git claen -fdx",
    "printf -v HOME %s /tmp/h; git claen -fdx",
    "for XDG_CONFIG_HOME in /tmp/h; do git claen -fdx; done",
    "declare -n R=HOME; R=/tmp/h; git claen -fdx",
    "typeset -n R=XDG_CONFIG_HOME; R=/tmp/h; export R; git claen -fdx",
    ": ${XDG_CONFIG_HOME:=/tmp/h}; git claen -fdx",
  ]);
  passes([
    String.raw`echo "$'\0"; git status; echo "'"`,
    "HOME=/tmp/h git --attr-source HEAD status",
    "for HOME in /tmp/h; do git status; done",
    "read HOME <<< /tmp/h; git log -1",
    "cd $HOME; git lfs pull",
    "git -C ${HOME}/r lfs pull",
  ]);
});

test("--shallow-file, a variable-built HOME name or GIT_CONFIG_* set without NAME= cannot hide an aliased git subcommand (round 10)", () => {
  refused([
    "HOME=/tmp/h git --shallow-file status claen -fdx",
    "git -c include.path=/tmp/c --shallow-file status claen -fdx",
    "x=HO; printf -v ${x}ME %s /tmp/h; git claen -fdx",
    "n=HO; n+=ME; read $n <<< /tmp/h; git claen -fdx",
    "n=HO; export ${n}ME=/tmp/h; git claen -fdx",
    "n=HO; declare -n R=${n}ME; R=/tmp/h; git claen -fdx",
    "n=HO; mapfile -t ${n}ME < /dev/null; git claen -fdx",
    "n=HO; n+=ME; : ${!n:=/tmp/h}; git claen -fdx",
    "x=HO; getopts a ${x}ME; git claen -fdx",
    "for $x in /tmp/h; do git claen -fdx; done",
    "x=HO; local -n R=${x}ME; R=/tmp/h; git claen -fdx",
    "x=HO; printf -v\"${x}ME\" %s /tmp/h; git claen -fdx",
    "x=HO; command printf -v ${x}ME %s /tmp/h; git claen -fdx",
    "printf -v GIT_CONFIG_GLOBAL %s /tmp/c; export GIT_CONFIG_GLOBAL; git claen -fdx",
    "read GIT_CONFIG_GLOBAL <<< /tmp/c; export GIT_CONFIG_GLOBAL; git claen -fdx",
    "for GIT_CONFIG_GLOBAL in /tmp/c; do export GIT_CONFIG_GLOBAL; git claen -fdx; done",
    String.raw`echo "$'\c@"; git c\lean -fdx; echo "'"`,
    String.raw`echo "$'\u0000"; r\m -rf docs; echo "'"`,
    "read HO''ME <<< /tmp/h; git claen -fdx",
    String.raw`printf -v H\OME %s /tmp/h; git claen -fdx`,
  ]);
  passes([
    "read -r line <<< x; git lfs pull",
    "for f in $(ls); do git lfs pull; done",
    "HOME=/tmp/h git --shallow-file /tmp/s status",
    "x=a; printf -v ${x}b %s y; git status",
    "export PATH=$PATH:/x; git lfs pull",
    "declare -a arr=($x); git status",
    "export X=1; (cd $d && git lfs pull)",
    "read -r x <<< \"$y\"; git lfs pull",
    "git lfs pull origin $BRANCH",
  ]);
});

test("prose naming HOME or XDG_CONFIG_HOME beside a non-builtin git subcommand fails closed (accepted cost, round 10)", () => {
  refused([
    "echo HOME; git lfs pull",
    'git commit -m "fix HOME handling" && git lfs pull',
    "grep -rn XDG_CONFIG_HOME src; git lfs pull",
  ]);
});

test("a wrapper, an alias-proof builtin, NUL and locale quoting in ordinary commands still pass", () => {
  passes([
    "env HOME=/tmp/h git status",
    "HOME=/tmp/h nice git log -1",
    "git -c include.path=/tmp/c status",
    "export HOME=/tmp/h; command git status",
    "HOME=/tmp/h make -C $DIR build",
    "HOME=/tmp/h npm test",
    "git scalar list",
    "git whatchanged",
    "git daemon --help",
    "git log --format=$'%H\\0' -1",
    "git log --format=$'%H\\x00%s' -1",
    "git commit -m $\"clean up\"",
    'echo $"clean"',
    'git status $"docs"',
    'echo "price $"',
    "echo '$\"clean\"'",
    "git --version",
  ]);
});
