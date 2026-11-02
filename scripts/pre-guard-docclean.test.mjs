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

test("a config name built mid-word, or set by let or arithmetic, cannot hide an aliased git subcommand (round 11)", () => {
  refused([
    "x=ME; printf -v HO${x} %s /tmp/h; git claen -fdx",
    "x=ME; printf -v HO$x %s /tmp/h; git claen -fdx",
    "x=ME; export HO${x}=/tmp/h; git claen -fdx",
    "x=ME; declare HO${x}=/tmp/h; git claen -fdx",
    "x=ME; typeset -x HO${x}=/tmp/h; git claen -fdx",
    "x=ME; readonly HO${x}=/tmp/h; git claen -fdx",
    "x=ME; export -- HO${x}=/tmp/h; git claen -fdx",
    'x=ME; export "HO${x}=/tmp/h"; git claen -fdx',
    "x=OM; export H${x}E=/tmp/h; git claen -fdx",
    "x=ME; getopts a HO${x}; git claen -fdx",
    "let HOME=1; git claen -fdx",
    "let XDG_CONFIG_HOME=1; git claen -fdx",
    "n=HO; let ${n}ME=1; git claen -fdx",
    "n=HO; (( ${n}ME = 1 )); git claen -fdx",
    "n=HO; : $(( ${n}ME = 1 )); git claen -fdx",
    "(( HOME = 1 )); git claen -fdx",
  ]);
  passes([
    "git --exec-path clean -fdx",
    "(( i++ )); git lfs pull",
    "let i=i+1; git lfs pull",
    "echo $(( a + b )); git lfs pull",
  ]);
});

test("a $ word in read's options beside a non-builtin git subcommand fails closed (accepted cost, round 11)", () => {
  refused(['read -p "$prompt" ans; git lfs pull']);
});

test("a config name set in any arithmetic context beside git cannot hide an aliased git subcommand (round 12)", () => {
  refused([
    "n=HO; (( (0), ${n}ME = 1 )); git claen -fdx",
    "n=HO; : $(( (0), ${n}ME = 1 )); git claen -fdx",
    "n=HO; s=abc; : ${s:${n}ME=1}; git claen -fdx",
    "n=HO; s=abc; : ${s:0:${n}ME=1}; git claen -fdx",
    "n=HO; : $[ ${n}ME = 1 ]; git claen -fdx",
    "n=HO; a[${n}ME=1]=x; git claen -fdx",
    "f(){ local HO${x}=/tmp/h; git claen -fdx; }",
    "read n m <<< 'HO ME'; declare -i v; v=$n$m=1; git claen -fdx",
    "read n m <<< 'HO ME'; local -i v=$n$m=1; git claen -fdx",
    "(( 1 )); HOME=/tmp/h $G claen -fdx",
    "(( 1 )); env \"A=1;x\" HOME=/tmp/h $G claen -fdx",
    "for (( i=0; i<1; i++ )); do HOME=/tmp/h $(echo g)it claen -fdx; done",
    "read n m <<< 'HO ME'; v=$n$m=1; (( v )); git claen -fdx",
    "read n m <<< 'HO ME'; v=$n$m=1; let v; git claen -fdx",
    "read n m <<< 'HO ME'; v=$n$m=1; s=abc; : ${s:v}; git claen -fdx",
    "n=HO; : $((\n${n}ME=1)); git claen -fdx",
  ]);
});

test("arithmetic beside a $ and a non-builtin git subcommand fails closed (accepted cost, round 12)", () => {
  refused(["echo $(( $x + 1 )); git lfs pull", "x=$1; echo $(( x + 1 )); git lfs pull"]);
});

test("git-free arithmetic and git-free text the parser cannot read still pass (round 12, regression of 9ee1c85)", () => {
  passes([
    "for (( i=0; i<$n; i++ )); do echo $i; done",
    "(( count += $x )); echo ok",
    "echo $(( a + $b )); ls",
    "echo $(( $a + $b )); ls",
    "x=$((x+$y)); echo $x",
    "for (( i=0; i<${#a[*]}; i++ )); do echo ${a[i]}; done",
    "for (( i=0; i<$n; i++ )); do (cd d$i && make); done",
    "echo ${s:0:2}; git lfs pull",
    "ls file[0-9]*; echo $x; git lfs pull",
    "echo \"${a[@]}\"; read -r x <<< \"$y\"; git lfs pull",
    "echo \"${a[1]}\"; read -r x <<< \"$y\"; git lfs pull",
  ]);
});

test("the config-indirection hints stay linear on long text (round 12)", () => {
  const time = (command) => { const start = process.hrtime.bigint(); guard(command); return Number(process.hrtime.bigint() - start) / 1e6; };
  const base = Math.min(time("git status"), time("git status"));
  for (const command of ["let ".repeat(20000), "(( ".repeat(20000) + "= x"]) {
    const ms = time(command) - base;
    assert.ok(ms < 200, command.slice(0, 8) + "... took " + Math.round(ms) + " ms over the baseline");
  }
});

test("env -S in text the parser cannot read, a special-parameter substring, let behind a keyword, a value set without a $ and a current-shell substitution cannot hide an aliased git subcommand (round 13)", () => {
  refused([
    "(HOME=1 env -Sgit\\ claen -fdx)",
    "f() { HOME=1 env -Sgit\\ claen -fdx; }; f",
    "(export HOME=1; env -Sgit\\ claen -fdx)",
    "(n=HO; (( ${n}ME = 1 )); env -Sgit\\ claen -fdx)",
    "(HOME=1 env -u X --split-string='git claen -fdx')",
    "n=HO; : ${-:${n}ME=1}; git claen -fdx",
    "n=HO; : ${$:${n}ME=1}; git claen -fdx",
    "n=HO; : ${?:${n}ME=1}; git claen -fdx",
    "n=HO; : ${-:$n'ME=1'}; git claen -fdx",
    "n=HO; v=$n\"ME=1\"; if let v; then git claen -fdx; fi",
    "n=HO; v=$n\"ME=1\"; while let v; do git claen -fdx; break; done",
    "n=HO; v=$n\"ME=1\"; until let v; do git claen -fdx; break; done",
    "n=HO; v=$n\"ME=1\"; if false; then :; elif let v; then git claen -fdx; fi",
    "n=HO; v=$n\"ME=1\"; ! let v; git claen -fdx",
    "n=HO; v=$n\"ME=1\"; time let v; git claen -fdx",
    "n=HO; v=$n\"ME=1\"; builtin let v; git claen -fdx",
    "n=HO; v=$n\"ME=1\"; command let v; git claen -fdx",
    "n=HO; v=$n\"ME=1\"; 'let' v; git claen -fdx",
    "n=HO; v=$n\"ME=1\"; echo `let v; git claen -fdx`",
    "v=HO; v+=ME=1; let v; git claen -fdx",
    "v=HO; declare v+=ME=1; let v; git claen -fdx",
    "printf -v v %s%s HO ME=1; let v; git claen -fdx",
    "v=HO; v+=ME=1; s=abc; : ${s:v}; git claen -fdx",
    "v=HO; v+=ME=1; : $((v)); git claen -fdx",
    "read v <<< HOME=1; let v; git claen -fdx",
    "for v in HOME=1; do let v; done; git claen -fdx",
    "for v in HO'ME=1'; do let v; done; git claen -fdx",
    "getopts a: o -a HOME=1; let OPTARG; git claen -fdx",
    ": ${ HOME=1; }; git claen -fdx",
    ": ${| HOME=1; }; git claen -fdx",
    "echo \"${ HOME=1; }\"; git claen -fdx",
    ": ${ HOME=1; $G claen -fdx; }",
    "cat <<E\n${ HOME=1; }\nE\ngit claen -fdx",
  ]);
  passes([
    "(( i++ )); git lfs pull",
    "let i=i+1; git lfs pull",
    "(( count+=1 )); git lfs pull",
    "let count+=1; git lfs pull",
    "for (( i=0; i<3; i++ )); do git lfs pull; done",
    "for f in a b; do echo $f; done; git lfs pull",
    "while read -r line; do echo \"$line\"; done < f; git lfs pull",
    "(HOME=/tmp/h env -i ls)",
  ]);
});

test("an abbreviated env --split-string and an uppercase-attribute name cannot hide a git subcommand, and a counter loop beside a built-in git subcommand still passes (round 14)", () => {
  refused([
    "env --sp='git clean -fdx'",
    "env --sp='r\u006d -rf docs'",
    "env --s 'git clean -fdx'",
    "HOME=1 env --sp=git\\ claen -fdx",
    "HOME=1 env --split-strin=git\\ claen -fdx",
    "(HOME=1 env --spl=git\\ claen -fdx)",
    "declare -u v=home=1; let v; git claen -fdx",
    "declare -u v; v=home=1; let v; git claen -fdx",
    "local -u v=home=1; let v; git claen -fdx",
    "declare -u v=home=1; : $((v)); git claen -fdx",
    "declare -u v=home=1; s=abc; : ${s:v}; git claen -fdx",
    "typeset -iu v=home=1; let v; git claen -fdx",
    "(( HOME = 1 )); git claen -fdx",
    "(( XDG_CONFIG_HOME = 1 )); git claen -fdx",
    "for i in 1; do (( HOME = 1 )); done; git claen -fdx",
    "(( 1 )); HOME=/tmp/h /usr/bin/g?t claen -fdx",
    "(( 1 )); HOME=/tmp/h {g,}it claen -fdx",
    "(( 1 )); function f { HOME=/tmp/h $G claen -fdx; }; f",
  ]);
  passes([
    "for i in 1 2; do (( n++ )); done; git status",
    "while read -r l; do (( n++ )); done < f; git status",
    "PATH+=:/x; (( n++ )); git status",
    "for i in 1 2; do (( n++ )); done; git log --oneline",
    "for f in *.md; do (( n++ )); done; echo done; git diff --stat",
    "env --sp='ls -l'",
  ]);
});

test("a current-shell substitution or a value read from input inside arithmetic, and a line-continued declare -u or let, cannot hide a git subcommand (round 15)", () => {
  refused([
    "(( ${ HOME=/tmp/h git claen -fdx; echo 1; } )); git status",
    "(( ${| HOME=/tmp/h git claen -fdx; REPLY=1; } )); git status",
    "(( n += ${ HOME=1 git claen -fdx; echo 1; } )); git status",
    "(( ${ HOME=1 git claen -fdx; echo 1; } ))",
    "(( ${ git -c alias.x=!true x; echo 1; } )); git status",
    "(( ${ git claen -fdx; echo 1; } )); HOME=1 git status",
    "read -r x < f; (( x )); git status --short",
    "while read -r l; do (( t += l )); done < f; git status",
    "mapfile -t a < f; (( a[0] )); git log --oneline",
    "read -r x < f; : $(( x )); git status",
    "read -r l < f; (( $l )); git status",
    "read -r l < f; y=$l; (( y )); git status",
    "for x in $(cat f); do (( x )); done; git status",
    "for x in *; do (( x )); done; git status",
    "declare \\\n-u v=home=1; let v; git claen -fdx",
    "local \\\n-u v=home=1; let v; git claen -fdx",
    "declare -u v=home=1; l\\\net v; git claen -fdx",
    "v=HO; v+=ME=1; l\\\net v; git claen -fdx",
  ]);
  passes([
    "while read -r l; do (( n++ )); done < f; git status",
    "for i in 1 2 3; do (( sum += i )); done; git status",
    "while read -r line; do (( n++ )); echo \"$line\"; done < f; git status",
    "for f in *.md; do (( n++ )); done; git status",
  ]);
});

test("a line-continued git config or environment word, and a read value reached through a bare name, a nameref or a declare/printf -v substitution, cannot hide a git subcommand; a length in arithmetic still passes (round 16)", () => {
  const chain = Array.from({ length: 20 }, (_, k) => `v${20 - k}=$v${19 - k}`).join("; ");
  refused([
    "git -c help.auto\\\ncorrect=1 claen -fdx",
    "GIT_CONF\\\nIG_GLOBAL=g git claen -fdx",
    "GIT_WORK_TR\\\nEE=/tmp/w git clean -n src",
    "read -r l < f; y=l; (( y )); git status --short",
    "read -r l < f; declare -n z=l; (( z )); git status --short",
    "declare w=\"$(cat f)\"; (( w )); git status --short",
    "printf -v v %s \"$(cat f)\"; (( v )); git status --short",
    "read -r l < f; printf -v v %s l; (( v )); git status --short",
    "(( ${\tHOME=1 git claen -fdx; echo 1; } )); git status",
    "(( ${\nHOME=1 git claen -fdx; echo 1; } )); git status",
    "re\\\nad -r x < f; (( x )); git status --short",
    "mapf\\\nile -t a < f; (( a[0] )); git log --oneline",
    "f\\\nor x in $(cat f); do (( x )); done; git status",
    `read -r v0 < f; ${chain}; (( v20 )); git status`,
  ]);
  passes([
    "for f in *.txt; do n=$(( ${#f} + 1 )); done; git status",
    "for f in *.txt; do (( ${#f} > 3 )) && echo \"$f\"; done; git status",
    "i=0; while (( i < 3 )); do i=$((i+1)); done; git status",
    "x=5; y=x; (( y )); git status",
  ]);
});

test("a word split by ANSI-C quoting and a line continuation, a read value reached through a for list, a default assignment or the positional parameters, and GIT_DIR or --git-dir cannot hide a git subcommand (round 17)", () => {
  refused([
    "git -c help.$'auto'c\\\norrect=1 claen -fdx",
    "git -c help.auto$'c'\\\norrect=1 claen -fdx",
    "git -c help.$'auto\\x63'\\\norrect=1 claen -fdx",
    "git -c in$'clu'\\\nde.path=/tmp/c claen -fdx",
    "read -r l < f; for z in l; do (( z )); done; git status",
    "read -r l < f; : ${z=l}; (( z )); git status",
    "read -r l < f; : ${z:=l}; (( z )); git status",
    "read -r l < f; set -- l; (( $1 )); git status",
    "GIT_DIR=/tmp/r git claen -fdx",
    "git --git-dir=/tmp/r claen -fdx",
    "GIT_COMMON_DIR=/tmp/r git claen -fdx",
    "env GIT_DIR=/tmp/r git claen -fdx",
    "r\\\nm -rf docs",
    "git r\\\nm -r docs",
    "gi\\\nt clean -fdx",
  ]);
  passes([
    "GIT_DIR=/tmp/r git status",
    "git --git-dir=/tmp/r status",
    "for i in 1 2 3; do (( i > 1 )); done; git status",
    "set -- a b; echo $1; git status",
  ]);
});

test("a line continuation inside a safety variable's name does not hide that a command sets it (round 17)", () => {
  // The name is assembled here, so no command that writes this file sets it.
  const name = ["CLAUDE", "PROJECT", "DIR"].join("_");
  const r = guard(`${name.slice(0, 10)}\\\n${name.slice(10)}=/tmp/x node scripts/tracker.mjs`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /which the authority scripts and the state paths trust/);
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
