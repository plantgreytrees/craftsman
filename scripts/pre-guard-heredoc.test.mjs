// ARCH-SAFETY-13 / ARCH-SAFETY-15 / ARCH-STATE-16: a quoted-delimiter heredoc body (<<'EOF', <<"EOF", <<-'EOF') fed to cat, tee, python3,
// python or node is inert text: the shell expands nothing in it and the program only stores, prints or interprets it, so a safety
// variable named there is not a setter. Everything else keeps the kept false positive: an unquoted tag, echo or printf, a bash, sh, eval,
// source or env head, a real setter outside the body, a heredoc inside a substitution, a pipe to a shell. The hook-bypass flag scan reads
// the whole command, heredoc bodies included (owner decision 2026-10-23), so a body naming it is still refused.
// A body fed to node or python is read as it stands when it holds code that can set the variable (the `node -e` live-word test, and a python
// analogue); a command that reads a stored body back with source, a dot, eval or coproc keeps every body visible; a case pattern's `)` closes
// no substitution. What the guard does not follow (a stored body run by file name, a call that is not an assignment) is pinned as a stated limit.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), "pre-guard.mjs");
const BYPASS = "--no-" + "verify"; // spelled in two parts so this file never trips the hook-bypass check itself
const SETTER = /a command that sets CLAUDE_CODE_SESSION_ID, CLAUDE_PROJECT_DIR or CRAFTSMAN_SAFETY/;
const BYPASSED = /hook bypass BLOCKED/;

const NAMES = ["CRAFTSMAN_SAFETY=off", "CLAUDE_PROJECT_DIR=/elsewhere", "export CLAUDE_CODE_SESSION_ID=other-session"];
const TAGS = [
  { op: "<<'EOF'", tab: "" },
  { op: '<<"EOF"', tab: "" },
  { op: "<<-'EOF'", tab: "\t" },
];
const CONSUMERS = ["cat", "cat > notes.txt", "cat >notes.txt", "tee notes.txt", "python3 -", "python -", "node -"];
// `head <<'EOF'`, the body, the terminator: a <<- document indents both with a tab.
const doc = (head, { op, tab }, body) => `${head} ${op}\n${tab}${body}\n${tab}EOF`;

function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-heredoc-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const bash = (command) =>
      spawnSync(process.execPath, [GUARD], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
        input: JSON.stringify({ session_id: "heredoc", tool_name: "Bash", tool_input: { command } }),
      });
    fn(bash);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Every row is judged, so a red run names them all. A row passes when the guard lets it through (status 0) or refuses it with `why`.
const allowedBut = (bash, rows) => rows.filter((command) => bash(command).status !== 0).map((command) => JSON.stringify(command));
const refusedWrong = (bash, rows, why) =>
  rows
    .filter((command) => {
      const r = bash(command);
      return r.status !== 2 || !why.test(r.stderr);
    })
    .map((command) => JSON.stringify(command));

test("heredoc: a quoted-tag body that names a safety variable passes when fed to cat, tee, python3, python or node", () => {
  fixture((bash) => {
    const rows = [];
    CONSUMERS.forEach((head, i) => TAGS.forEach((tag, j) => rows.push(doc(head, tag, NAMES[(i + j) % NAMES.length]))));
    assert.deepEqual(allowedBut(bash, rows), []);
    // every variable, not only the rotation's
    assert.deepEqual(allowedBut(bash, NAMES.map((name) => doc("cat", TAGS[0], name))), []);
  });
});

test("heredoc: the body is skipped as a body, whatever it holds, and the lines after it are still judged", () => {
  fixture((bash) => {
    const [safety, project, session] = NAMES;
    const noise = `${safety} 'a "b $(c) \`d\` \\e ) << # EOFX\n EOF\n${project}`;
    const ok = [
      `cat <<'EOF'\n${noise}\nEOF`,
      `python3 - <<'EOF'\nprint("${safety}\\n")\nEOF`,
      `cd sub && cat > notes.txt <<'EOF'\n${safety}\nEOF`,
      `cat > "$OUT" <<'EOF'\n${project}\nEOF`,
      `cat <<'EOF' > notes.txt && echo done\n${session}\nEOF`,
      `cat <<'A'\n${safety}\nA\ncat <<'B'\n${project}\nB`,
      `bash <<'A'\necho harmless\nA\ncat <<'B'\n${safety}\nB`,
      `cat <<'EOF'\n${safety}\nEOF\ngit status`,
    ];
    assert.deepEqual(allowedBut(bash, ok), []);
    const later = [
      `cat <<'EOF'\nnotes\nEOF\nexport ${safety}`,
      `cat <<'EOF'\n${safety}\nEOF\nexport ${safety}`,
      `cat <<'EOF'; export ${safety}\nnotes\nEOF`,
      `cat <<'EOF' && ${project} true\nnotes\nEOF`,
      `export ${safety}; cat <<'EOF'\nnotes\nEOF`,
      `bash <<'A'\n${safety}\nA\ncat <<'B'\n${project}\nB`,
      `cat <<'A'\n${safety}\nA\nbash <<'B'\n${project}\nB`,
    ];
    assert.deepEqual(refusedWrong(bash, later, SETTER), []);
  });
});

test("heredoc: an unquoted tag stays refused (the shell expands its body)", () => {
  fixture((bash) => {
    const rows = [];
    CONSUMERS.forEach((head, i) =>
      rows.push(`${head} <<EOF\n${NAMES[i % NAMES.length]}\nEOF`, `${head} <<-EOF\n\t${NAMES[(i + 1) % NAMES.length]}\n\tEOF`)
    );
    assert.deepEqual(refusedWrong(bash, rows, SETTER), []);
  });
});

test("heredoc: echo and printf stay refused, a heredoc or prose alike", () => {
  fixture((bash) => {
    const [safety, project, session] = NAMES;
    const rows = [
      `echo <<'EOF'\n${safety}\nEOF`,
      `echo <<"EOF"\n${project}\nEOF`,
      `printf '%s' <<'EOF'\n${session}\nEOF`,
      `printf '%s' <<-'EOF'\n\t${safety}\n\tEOF`,
      `echo ${safety}`,
      `echo export ${session}`,
      `printf '%s\\n' ${project}`,
    ];
    assert.deepEqual(refusedWrong(bash, rows, SETTER), []);
  });
});

test("heredoc: a bash, sh, eval, source or env head stays refused, quoted tag or not", () => {
  fixture((bash) => {
    const rows = [];
    ["bash", "sh", "bash -s", "sh -s", "eval", "source /dev/stdin", ". /dev/stdin", "env cat", "env -i sh", "sudo cat", "/usr/bin/env python3 -", "xargs"].forEach(
      (head, i) => TAGS.forEach((tag, j) => rows.push(doc(head, tag, NAMES[(i + j) % NAMES.length])))
    );
    assert.deepEqual(refusedWrong(bash, rows, SETTER), []);
  });
});

test("heredoc: an unterminated body, a path, quoted or prefixed command word, a separator before it and a second heredoc stay refused", () => {
  fixture((bash) => {
    const [safety, project, session] = NAMES;
    const rows = [
      `cat <<'EOF'\n${safety}`,
      `cat <<'EOF'\n${project}\nEOF `,
      `/bin/cat <<'EOF'\n${session}\nEOF`,
      `"cat" <<'EOF'\n${safety}\nEOF`,
      `\\cat <<'EOF'\n${project}\nEOF`,
      `command cat <<'EOF'\n${session}\nEOF`,
      `FOO=1 cat <<'EOF'\n${safety}\nEOF`,
      `cat <<'A' <<'B'\n${project}\nA\n${session}\nB`,
      `cat $(true) <<'EOF'\n${safety}\nEOF`,
      `true; cat <<'EOF'\n${project}\nEOF`,
    ];
    assert.deepEqual(refusedWrong(bash, rows, SETTER), []);
  });
});

test("heredoc: a heredoc inside $(...), backticks or a subshell, or piped or redirected into a shell, stays refused", () => {
  fixture((bash) => {
    const [safety, project, session] = NAMES;
    const rows = [
      `X=$(cat <<'EOF'\n${safety}\nEOF\n)`,
      `eval "$(cat <<'EOF'\n${project}\nEOF\n)"`,
      `git commit -m "$(cat <<'EOF'\n${session}\nEOF\n)"`,
      `X=\`cat <<'EOF'\n${safety}\nEOF\n\``,
      `(cat <<'EOF'\n${project}\nEOF\n)`,
      `{ cat <<'EOF'\n${session}\nEOF\n}`,
      // the heredoc line alone looks like a bare cat: only the open $(, backtick or subshell above it says otherwise
      `X=$(\ncat <<'EOF'\n${safety}\nEOF\n)`,
      `eval "$(\ncat <<'EOF'\n${project}\nEOF\n)"`,
      `X=\`\ncat <<'EOF'\n${session}\nEOF\n\``,
      `(\ncat <<'EOF'\n${safety}\nEOF\n)`,
      `X=$(echo "(" \n cat <<'EOF'\n${project}\nEOF\n)`,
      `cat <<'EOF' | bash\n${safety}\nEOF`,
      `cat <<'EOF' |\n${project}\nEOF\nsh`,
      `cat <<'EOF' | tee notes.txt | sh\n${session}\nEOF`,
      `{ :\ncat <<'EOF'\n${safety}\nEOF\n} | bash`,
      `cat <<'EOF' > >(bash)\n${project}\nEOF`,
      `tee >(sh) <<'EOF'\n${session}\nEOF`,
      `cat() { bash; }\ncat <<'EOF'\n${safety}\nEOF`,
      `alias cat=bash\ncat <<'EOF'\n${project}\nEOF`,
    ];
    assert.deepEqual(refusedWrong(bash, rows, SETTER), []);
  });
});

test("heredoc: the hook-bypass flag inside a quoted body is still refused, whatever the head (ARCH-STATE-16)", () => {
  fixture((bash) => {
    const rows = [
      `cat <<'EOF'\nnever pass ${BYPASS} to git commit\nEOF`,
      `cat <<"EOF"\ngit commit ${BYPASS}\nEOF`,
      `tee notes.txt <<-'EOF'\n\tgit push ${BYPASS}\n\tEOF`,
      `python3 - <<'EOF'\nprint("git commit ${BYPASS}")\nEOF`,
      `node - <<'EOF'\n${NAMES[0]}\ngit commit ${BYPASS}\nEOF`,
    ];
    assert.deepEqual(refusedWrong(bash, rows, BYPASSED), []);
  });
});

// How a live program assigns each variable, with and without spaces around the `=`. The guard reads text with its quotes dropped.
const NODE_SETS = [
  "process.env.CRAFTSMAN_SAFETY='off'",
  "process.env.CLAUDE_PROJECT_DIR = '/elsewhere'",
  'process.env["CLAUDE_CODE_SESSION_ID"] = "other-session"',
  "process.env['CRAFTSMAN_SAFETY']='off'",
];
const PY_SETS = [
  "os.environ['CRAFTSMAN_SAFETY']='off'",
  'os.environ["CLAUDE_PROJECT_DIR"] = "/elsewhere"',
  "import os\nos.environ['CLAUDE_CODE_SESSION_ID'] = 'other-session'",
  'os.environ["CRAFTSMAN_SAFETY"]="off"',
];
const NODE_HEADS = ["node -", "node", "node --input-type=module -", "cd sub && node -"];
const PY_HEADS = ["python3 -", "python -", "python3", "cd sub && python -"];

test("heredoc: a quoted-tag body fed to node or python that assigns a safety variable the way a live program does stays refused, like the node -e literal", () => {
  fixture((bash) => {
    const rows = [];
    NODE_HEADS.forEach((head, i) => TAGS.forEach((tag, j) => rows.push(doc(head, tag, NODE_SETS[(i + j) % NODE_SETS.length]))));
    PY_HEADS.forEach((head, i) => TAGS.forEach((tag, j) => rows.push(doc(head, tag, PY_SETS[(i + j) % PY_SETS.length]))));
    assert.deepEqual(refusedWrong(bash, rows, SETTER), []);
    // every spelling, not only the rotation's
    assert.deepEqual(refusedWrong(bash, NODE_SETS.map((body) => doc("node -", TAGS[0], body)), SETTER), []);
    assert.deepEqual(refusedWrong(bash, PY_SETS.map((body) => doc("python3 -", TAGS[0], body)), SETTER), []);
    // the same program as a literal, and a real setter after the body
    assert.deepEqual(refusedWrong(bash, [`node -e "${NODE_SETS[0]}"`, `python3 -c "${PY_SETS[0]}"`], SETTER), []);
    assert.deepEqual(refusedWrong(bash, [doc("node -", TAGS[0], "console.log(1)") + `\nexport ${NAMES[0]}`], SETTER), []);
  });
});

test("heredoc: prose that only names a safety variable stays allowed, in a cat or tee body whatever it holds and in a node or python body with no code word", () => {
  fixture((bash) => {
    const [safety, project] = NAMES;
    const ok = [
      `cat <<'EOF'\nSet ${safety} in your shell to turn the hooks off.\nEOF`,
      `cat > notes.md <<'EOF'\n${NODE_SETS[0]}\nEOF`, // a cat body is stored and never run, even when it holds a program
      `tee setup.py <<'EOF'\n${PY_SETS[0]}\nEOF`,
      `tee setup.js <<-'EOF'\n\t${NODE_SETS[1]}\n\tEOF`,
      `node - <<'EOF'\nconsole.log("set ${safety} to disable");\nEOF`,
      `python3 - <<'EOF'\nprint("${project} is the state root")\nEOF`,
      `python - <<'EOF'\n${safety}\nEOF`,
    ];
    assert.deepEqual(allowedBut(bash, ok), []);
  });
});

test("heredoc: a body stored in a file and read back by source, a dot, eval or coproc in the same command stays refused", () => {
  fixture((bash) => {
    const [safety, project, session] = NAMES;
    const store = (name) => `cat <<'EOF' > f\n${name}\nEOF`;
    const rows = [
      `${store(safety)}\n. f`,
      `${store(project)}\n. ./f`,
      `${store(session)}\nsource f`,
      `${store(safety)}\neval "$(cat f)"`,
      `${store(project)}\neval "$(<f)"`,
      `${store(session)}\ncoproc bash f`,
      `${store(safety)}\ncoproc { bash f; }`,
      `cat <<'EOF' > f && . f\n${project}\nEOF`,
      `cat <<'EOF' > f; source f\n${session}\nEOF`,
      `tee f <<'EOF' >/dev/null\n${safety}\nEOF\n. f`,
      `${store(project)}\ntrue && source f`,
      `${store(session)}\nif true; then . f; fi`,
      `${store(safety)}\n( . f )`,
      `${store(project)}\nFOO=1 source f`,
      `${store(session)}\ncommand eval "$(cat f)"`,
      `${store(safety)}\n{ eval "$(cat f)"; }`,
      `cd sub && cat <<'EOF' > f\n${project}\nEOF\n. f`,
    ];
    assert.deepEqual(refusedWrong(bash, rows, SETTER), []);
  });
});

test("heredoc: the words source, eval, coproc and a lone dot are read only where a command stands, so prose and arguments keep the body inert", () => {
  fixture((bash) => {
    const [safety, project, session] = NAMES;
    const ok = [
      `cat <<'EOF'\n${safety}\nEOF\necho see the source of the eval order`,
      `cat <<'EOF' > notes.txt\n${project}\nEOF\ngit add .`,
      `cat <<'EOF' > notes.txt\n${session}\nEOF\nls . ..`,
      `cd . && cat <<'EOF'\n${safety}\nEOF`,
      `cat <<'EOF' > notes.txt\n${project}\nEOF\ngit log --grep source`,
      `cat <<'EOF' > notes.txt\n${session}\nEOF\nnode ./coproc.mjs`,
    ];
    assert.deepEqual(allowedBut(bash, ok), []);
  });
});

test("heredoc: stated limits (ARCH-SAFETY-15), a stored body run by file name and a call that is not an assignment stay allowed", () => {
  fixture((bash) => {
    const [safety, project, session] = NAMES;
    const store = (name) => `cat <<'EOF' > f\n${name}\nEOF`;
    const limits = [
      `${store(safety)}\nbash f`,
      `${store(project)}\nsh ./f`,
      `${store(session)}\nchmod +x f && ./f`,
      `${store(safety)}\nnode f`,
      `${store(project)}\npython3 f`,
      `python3 - <<'EOF'\nimport os\nos.putenv('CRAFTSMAN_SAFETY', 'off')\nEOF`,
      `node - <<'EOF'\nprocess.env['CRAFTSMAN_' + 'SAFETY'] = 'off';\nEOF`, // a name built at run time
    ];
    assert.deepEqual(allowedBut(bash, limits), []);
  });
});

test("heredoc: a case pattern's ) closes no $( ), so a body inside the substitution stays refused and one after it stays allowed", () => {
  fixture((bash) => {
    const [safety, project, session] = NAMES;
    const refused = [
      `X=$(case a in\na)\ncat <<'EOF'\n${safety}\nEOF\n;; esac)`,
      `X=$(case a in\n(a)\ncat <<'EOF'\n${project}\nEOF\n;; esac)`,
      `X=$(case a in\nb) true ;;\na | c)\ncat <<'EOF'\n${session}\nEOF\n;;\nesac\n)`,
      `X=$(case a in\n@(a))\ncat <<'EOF'\n${safety}\nEOF\n;; esac)`,
      `X=$(case "$a" in\n*)\ncat <<'EOF'\n${project}\nEOF\n;; esac)`,
      `X=$(case a in a) cat <<'EOF'\n${session}\nEOF\n;; esac)`,
      `X=$(case a in\na)\ncase b in\nb)\ncat <<'EOF'\n${safety}\nEOF\n;; esac\n;; esac)`,
      `X=$(for i in 1; do case $i in\n1)\ncat <<'EOF'\n${project}\nEOF\n;; esac; done)`,
      `echo "$(case a in\na)\ncat <<'EOF'\n${session}\nEOF\n;; esac)"`,
    ];
    assert.deepEqual(refusedWrong(bash, refused, SETTER), []);
    const allowed = [
      `X=$(case a in a) echo hi;; esac)\ncat <<'EOF'\n${safety}\nEOF`,
      `X=$(case a in\n(a) echo hi;;\nesac)\ncat <<'EOF'\n${project}\nEOF`,
      `X=$(case a in\n@(a)) echo hi;;\nesac)\ncat <<'EOF'\n${session}\nEOF`,
      `X=$(echo case a in a)\ncat <<'EOF'\n${safety}\nEOF`,
      `case a in\na)\ncat <<'EOF'\n${project}\nEOF\n;; esac`, // a bare case is no substitution
      `(case a in\na) true;;\nesac)\ncat <<'EOF'\n${session}\nEOF`,
    ];
    assert.deepEqual(allowedBut(bash, allowed), []);
  });
});
