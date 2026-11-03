// ARCH-SAFETY-13 / ARCH-SAFETY-15 / ARCH-STATE-16: a quoted-delimiter heredoc body (<<'EOF', <<"EOF", <<-'EOF') fed to cat, tee, python3,
// python or node is inert text: the shell expands nothing in it and the program only stores, prints or interprets it, so a safety
// variable named there is not a setter. Everything else keeps the kept false positive: an unquoted tag, echo or printf, a bash, sh, eval,
// source or env head, a real setter outside the body, a heredoc inside a substitution, a pipe to a shell. The hook-bypass flag scan reads
// the whole command, heredoc bodies included (owner decision 2026-10-23), so a body naming it is still refused.

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
