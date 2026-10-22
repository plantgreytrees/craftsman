// ARCH-SAFETY-05 / scrutiny round 2 (14.x): doc-write.mjs and toggle.mjs check their own authority, so no spelling
// of the command line (quotes, variables, links, globs, sh -c, xargs, import()) can reach them without the
// owning command's record. Every test runs the scripts for real, in a throwaway project with a temp HOME.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const at = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));
const DOC_WRITE = at("doc-write.mjs");
const TOGGLE = at("toggle.mjs");
const OSG = at("orchestrate-scope-guard.mjs");

function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-sa-")));
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-sa-home-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home, CLAUDE_CODE_SESSION_ID: "sa-1" };
  delete env.CRAFTSMAN; delete env.CRAFTSMAN_SAFETY;
  assert.equal(env.HOME, home, "the test runs against a temp HOME");
  assert.equal(env.USERPROFILE, home);
  return {
    dir, home, env,
    pending: path.join(dir, ".craftsman", "doc-write-pending"),
    off: path.join(dir, ".craftsman", "off"),
    clean() { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); },
  };
}
const node = (p, script, args = [], env = p.env) => spawnSync(process.execPath, [script, ...args], { cwd: p.dir, env, encoding: "utf8" });
// What the UserPromptSubmit or Skill hook records when a command is typed or called.
const record = (p, sid, how, name) => spawnSync(process.execPath, [OSG], {
  cwd: p.dir, env: p.env, encoding: "utf8",
  input: JSON.stringify(how === "prompt"
    ? { session_id: sid, prompt: `/craftsman:${name} x` }
    : { session_id: sid, tool_name: "Skill", tool_input: { skill: `craftsman:${name}` } }),
});
const without = (env, key) => { const copy = { ...env }; delete copy[key]; return copy; };
// Run the script the way Claude Code does: pre-guard sees the command first (and, when it allows it, leaves the one-shot nonce the script consumes).
const guarded = (p, script, args = [], env = p.env, sid = "sa-1") => {
  spawnSync(process.execPath, [GUARD], { cwd: p.dir, env: p.env, encoding: "utf8",
    input: JSON.stringify({ session_id: sid, tool_name: "Bash", tool_input: { command: `node ${script} ${args.join(" ")}`.trim() } }) });
  return node(p, script, args, env);
};

test("doc-write.mjs on refuses without the owning command's record, for this session (14.1)", () => {
  const p = project();
  try {
    let r = guarded(p, DOC_WRITE, ["on"]);
    assert.equal(r.status, 2, "no record at all");
    assert.match(r.stderr, /craftsman:.*(?:\/plan|doc writer|command)/i);
    assert.ok(!fs.existsSync(p.pending), "no grant was written");

    record(p, "other-session", "prompt", "plan");
    assert.equal(guarded(p, DOC_WRITE, ["on"]).status, 2, "a record for another session");
    record(p, "sa-1", "prompt", "instruction");
    assert.equal(guarded(p, DOC_WRITE, ["on"]).status, 2, "a record of a command that does not write docs");
    assert.ok(!fs.existsSync(p.pending));

    record(p, "sa-1", "prompt", "plan");
    assert.equal(guarded(p, DOC_WRITE, ["on"], without(p.env, "CLAUDE_CODE_SESSION_ID")).status, 2, "a missing session id refuses");
    assert.ok(!fs.existsSync(p.pending));
    r = guarded(p, DOC_WRITE, ["on"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(p.pending), "the owning command's record lets the grant through");
    assert.equal(node(p, DOC_WRITE, ["off"], without(p.env, "CLAUDE_CODE_SESSION_ID")).status, 0, "off stays open");
    assert.ok(!fs.existsSync(p.pending));
  } finally { p.clean(); }
});

test("a Skill-call record of a doc writer also counts for doc-write.mjs on (14.1)", () => {
  const p = project();
  try {
    record(p, "sa-1", "skill", "orchestrate");
    assert.equal(guarded(p, DOC_WRITE, ["on"]).status, 0);
  } finally { p.clean(); }
});

test("toggle.mjs off refuses unless the user typed /craftsman:toggle; on stays open (14.1)", () => {
  const p = project();
  try {
    assert.equal(guarded(p, TOGGLE, ["off"]).status, 2, "no record");
    assert.equal(guarded(p, TOGGLE, []).status, 2, "no argument flips to off, so it needs the record too");
    assert.ok(!fs.existsSync(p.off));
    record(p, "sa-1", "skill", "toggle");
    assert.equal(guarded(p, TOGGLE, ["off"]).status, 2, "a model Skill call is not the user typing it");
    assert.ok(!fs.existsSync(p.off));
    record(p, "other-session", "prompt", "toggle");
    assert.equal(guarded(p, TOGGLE, ["off"]).status, 2, "a record for another session");
    assert.equal(node(p, TOGGLE, ["on"]).status, 0, "on needs nothing");

    record(p, "sa-1", "prompt", "toggle");
    assert.equal(guarded(p, TOGGLE, ["off"], without(p.env, "CLAUDE_CODE_SESSION_ID")).status, 2, "a missing session id refuses");
    assert.equal(guarded(p, TOGGLE, ["off"]).status, 0);
    assert.ok(fs.existsSync(p.off), "the typed command lets off through");
    assert.equal(node(p, TOGGLE, ["on"], without(p.env, "CLAUDE_CODE_SESSION_ID")).status, 0);
    assert.ok(!fs.existsSync(p.off));
  } finally { p.clean(); }
});

test("every spelling of the command line ends at the same refusal when run for real (14.2)", () => {
  const p = project();
  try {
    const dir = path.dirname(DOC_WRITE);
    fs.symlinkSync(DOC_WRITE, path.join(p.dir, "dw.mjs"));
    const forms = [
      `node "${dir}/doc-w""rite.mjs" on`,
      `N=node; $N ${DOC_WRITE} on`,
      `node ./dw.mjs on`,
      `node ${dir}/doc-wri*.mjs on`,
      `sh -c 'node ${dir}/doc-w"r"ite.mjs on'`,
      `echo "${DOC_WRITE} on" | xargs node`,
      `node --input-type=module -e "process.argv[2]='on'; await import('${DOC_WRITE}')"`,
      `node --input-type=module -e "import('${TOGGLE}')"`,
      `node ${dir}/to""ggle.mjs off`,
      `node ${TOGGLE}`,
    ];
    for (const form of forms) {
      const r = spawnSync("sh", ["-c", form], { cwd: p.dir, env: p.env, encoding: "utf8" });
      assert.ok(!fs.existsSync(p.pending), `no grant after: ${form} (${r.stdout}${r.stderr})`);
      assert.ok(!fs.existsSync(p.off), `no off flag after: ${form} (${r.stdout}${r.stderr})`);
    }
  } finally { p.clean(); }
});

// Round 4 (25.x): the scripts trust CLAUDE_CODE_SESSION_ID from the environment, so a command that sets it inline can
// borrow another session's record. pre-guard must refuse any command that sets it (or CLAUDE_PROJECT_DIR), and gate goal-token.mjs.
const GUARD = at("pre-guard.mjs");
const GOAL_TOKEN = at("goal-token.mjs");
function spoofProject() {
  const p = project();
  // The user typed /toggle, /plan and /instruction in session sessA, and a goal file exists.
  record(p, "sessA", "prompt", "toggle");
  record(p, "sessA", "prompt", "plan");
  record(p, "sessA", "prompt", "instruction");
  fs.mkdirSync(path.join(p.dir, ".craftsman", "instructions"), { recursive: true });
  fs.writeFileSync(path.join(p.dir, ".craftsman", "instructions", "evil.goal.txt"), "do something\n");
  p.tokens = path.join(p.dir, ".craftsman", "sessions", "sessA", "goal-tokens.json");
  p.effects = () => ({ off: fs.existsSync(p.off), pending: fs.existsSync(p.pending), token: fs.existsSync(p.tokens) });
  return p;
}
const guardAs = (p, sid, command) => spawnSync(process.execPath, [GUARD], { cwd: p.dir, env: p.env, encoding: "utf8",
  input: JSON.stringify({ session_id: sid, tool_name: "Bash", tool_input: { command } }) });

test("a command that sets the session id or project dir is refused, and each spoof really works unguarded (25.1)", () => {
  const forms = [
    [`CLAUDE_CODE_SESSION_ID=sessA node ${TOGGLE} off`, "off"],
    [`CLAUDE_CODE_SESSION_ID=sessA node ${path.dirname(TOGGLE)}/tog""gle.mjs off`, "off"],
    [`env CLAUDE_CODE_SESSION_ID=sessA node ${TOGGLE} off`, "off"],
    [`export CLAUDE_CODE_SESSION_ID=sessA; node ${DOC_WRITE} on`, "pending"],
    [`declare -x CLAUDE_CODE_SESSION_ID=sessA; node ${TOGGLE} off`, "off"],
    [`CLAUDE_CODE_SESSION_ID=sessA node ${GOAL_TOKEN} .craftsman/instructions/evil.goal.txt`, "token"],
  ];
  for (const [form, effect] of forms) {
    const real = spoofProject();
    try {
      spawnSync("bash", ["-c", form], { cwd: real.dir, env: { ...real.env, CLAUDE_CODE_SESSION_ID: "sessB" }, encoding: "utf8" });
      // Before the nonce (26.x below) this created the effect; now the script itself refuses without pre-guard's nonce.
      assert.equal(real.effects()[effect], false, `the script refuses the spoof on its own: ${form} creates no ${effect} unguarded`);
    } finally { real.clean(); }
    const guarded = spoofProject();
    try {
      assert.equal(guardAs(guarded, "sessB", form).status, 2, `denied: ${form}`);
      assert.deepEqual(guarded.effects(), { off: false, pending: false, token: false }, "nothing was created");
    } finally { guarded.clean(); }
  }
  const p = spoofProject();
  try {
    assert.equal(guardAs(p, "sessB", `CLAUDE_PROJECT_DIR=/tmp/elsewhere node ${TOGGLE} off`).status, 2, "the project dir is also refused");
    for (const ok of ['echo "$CLAUDE_CODE_SESSION_ID"', "printenv CLAUDE_CODE_SESSION_ID", `node ${TOGGLE} on`, "echo CLAUDE_CODE_SESSION_ID"]) {
      assert.equal(guardAs(p, "sessB", ok).status, 0, `allowed: ${ok}`);
    }
  } finally { p.clean(); }
});

test("goal-token.mjs is gated like doc-write.mjs: only inside /instruction or /auto (25.2)", () => {
  const p = spoofProject();
  try {
    const command = `node ${GOAL_TOKEN} .craftsman/instructions/evil.goal.txt`;
    assert.equal(guardAs(p, "sessB", command).status, 2, "no record in this session");
    record(p, "sessB", "prompt", "instruction");
    assert.equal(guardAs(p, "sessB", command).status, 0, "a /instruction record in this session lets it through");
    assert.equal(guardAs(p, "sessB", `node ${path.dirname(GOAL_TOKEN)}/goal-to""ken.mjs x`).status, 0, "quote-split name resolves to the same gate");
  } finally { p.clean(); }
});

// Round 5 (followup-authority-session-binding): a record in the session is not enough. pre-guard, which alone knows the real
// session id of the tool call, leaves a one-shot nonce for the script it lets through; the script consumes it. A script
// started any other way (an interpreter, another process, a borrowed id) has no nonce and refuses.
const nonceFile = (p, sid, name) => path.join(p.dir, ".craftsman", "sessions", sid, `nonce-${name}`);

test("with the owning record but no nonce from pre-guard, the scripts refuse (26.1)", () => {
  const p = project();
  try {
    record(p, "sa-1", "prompt", "plan");
    record(p, "sa-1", "prompt", "toggle");
    let r = node(p, DOC_WRITE, ["on"]);
    assert.equal(r.status, 2, "a record alone no longer grants");
    assert.match(r.stderr, /nonce|pre-guard/i);
    assert.ok(!fs.existsSync(p.pending));
    r = node(p, TOGGLE, ["off"]);
    assert.equal(r.status, 2);
    assert.ok(!fs.existsSync(p.off));
    // the same session through pre-guard still works
    assert.equal(guarded(p, DOC_WRITE, ["on"]).status, 0);
    assert.equal(guarded(p, TOGGLE, ["off"]).status, 0);
  } finally { p.clean(); }
});

test("the nonce is one-shot, per script, per session and short-lived (26.2)", () => {
  const p = project();
  try {
    record(p, "sa-1", "prompt", "plan");
    record(p, "other", "prompt", "plan");
    record(p, "sa-1", "prompt", "toggle");
    guardAs(p, "sa-1", `node ${DOC_WRITE} on`);
    assert.ok(fs.existsSync(nonceFile(p, "sa-1", "doc-write")), "pre-guard left a nonce for the session of the tool call");
    assert.equal(node(p, TOGGLE, ["off"]).status, 2, "a doc-write nonce does not open toggle");
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 0, "the nonce is consumed by the script");
    assert.ok(!fs.existsSync(nonceFile(p, "sa-1", "doc-write")));
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 2, "a second run has no nonce");

    guardAs(p, "other", `node ${DOC_WRITE} on`);
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 2, "another session's nonce does not count for this id");

    guardAs(p, "sa-1", `node ${DOC_WRITE} on`);
    fs.writeFileSync(nonceFile(p, "sa-1", "doc-write"), String(Date.now() - 120000));
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 2, "a stale nonce is refused");
  } finally { p.clean(); }
});

test("pre-guard leaves no nonce for a denied command, for doc-write off, or for toggle on (26.3)", () => {
  const p = project();
  try {
    assert.equal(guardAs(p, "sa-1", `node ${DOC_WRITE} on`).status, 2, "no record: denied");
    assert.ok(!fs.existsSync(nonceFile(p, "sa-1", "doc-write")));
    record(p, "sa-1", "prompt", "plan");
    guardAs(p, "sa-1", `node ${DOC_WRITE} off`);
    guardAs(p, "sa-1", `node ${TOGGLE} on`);
    assert.ok(!fs.existsSync(nonceFile(p, "sa-1", "doc-write")) && !fs.existsSync(nonceFile(p, "sa-1", "toggle")));
  } finally { p.clean(); }
});

test("goal-token.mjs run from the command line also needs the nonce (26.4)", () => {
  const p = spoofProject();
  try {
    record(p, "sa-1", "prompt", "instruction");
    const run = () => spawnSync(process.execPath, [GOAL_TOKEN, ".craftsman/instructions/evil.goal.txt"], { cwd: p.dir, env: p.env, encoding: "utf8" });
    const tokens = path.join(p.dir, ".craftsman", "sessions", "sa-1", "goal-tokens.json");
    assert.notEqual(run().status, 0, "record alone: refused");
    assert.ok(!fs.existsSync(tokens));
    guardAs(p, "sa-1", `node ${GOAL_TOKEN} .craftsman/instructions/evil.goal.txt`);
    assert.equal(run().status, 0);
    assert.ok(fs.existsSync(tokens));
  } finally { p.clean(); }
});

// Round 5 (34.x): whether safety is off is the USER's environment, which only a hook sees. SessionStart records it as a marker the
// scripts read; the script's own environment, which any child can set, no longer decides.
const SESSION_CONTEXT = at("session-context.mjs");
const safetyMarker = (p, sid = "sa-1") => path.join(p.dir, ".craftsman", "sessions", sid, "safety-off");
const startSession = (p, env = p.env, sid = "sa-1") => spawnSync(process.execPath, [SESSION_CONTEXT], { cwd: p.dir, env, encoding: "utf8", input: JSON.stringify({ session_id: sid }) });

test("a child process that sets CRAFTSMAN_SAFETY=off cannot skip the nonce (34.1)", () => {
  const p = project();
  try {
    record(p, "sa-1", "prompt", "plan");
    record(p, "sa-1", "prompt", "toggle");
    const env = { ...p.env, CRAFTSMAN_SAFETY: "off" };
    assert.equal(node(p, DOC_WRITE, ["on"], env).status, 2, "env off in the script, no marker: refused");
    assert.ok(!fs.existsSync(p.pending));
    assert.equal(node(p, TOGGLE, ["off"], env).status, 2);
    assert.ok(!fs.existsSync(p.off));
    // 34.3: off set after the session started was never seen by SessionStart, so it stays refused
    startSession(p);
    assert.ok(!fs.existsSync(safetyMarker(p)));
    assert.equal(node(p, DOC_WRITE, ["on"], env).status, 2);
  } finally { p.clean(); }
});

test("SessionStart records CRAFTSMAN_SAFETY=off as a marker, and the scripts then ask for no nonce (34.1)", () => {
  const p = project();
  try {
    record(p, "sa-1", "prompt", "plan");
    const off = { ...p.env, CRAFTSMAN_SAFETY: "off" };
    assert.equal(startSession(p, off).status, 0);
    assert.ok(fs.statSync(safetyMarker(p)).isFile(), "the marker is a regular file");
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 0, "no nonce is asked for while the user has safety off for this session");
    // a stale marker does not outlive an environment that no longer says off
    assert.equal(startSession(p).status, 0);
    assert.ok(!fs.existsSync(safetyMarker(p)), "removed when the next start does not see off");
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 2, "and the nonce is asked for again");
  } finally { p.clean(); }
});

test("the safety-off marker cannot be written by a tool call, and each write form really would (34.2)", () => {
  const forms = ["echo x > .craftsman/sessions/sa-1/safety-off", "touch .craftsman/sessions/sa-1/safety-off", "cp stage-file .craftsman/sessions/sa-1/safety-off", "printf x | tee .craftsman/sessions/sa-1/safety-off"];
  for (const form of forms) {
    const real = project();
    try {
      fs.mkdirSync(path.join(real.dir, ".craftsman", "sessions", "sa-1"), { recursive: true });
      fs.writeFileSync(path.join(real.dir, "stage-file"), "x\n");
      spawnSync("bash", ["-c", form], { cwd: real.dir, env: real.env, encoding: "utf8" });
      assert.ok(fs.existsSync(safetyMarker(real)), `the form is real: ${form} creates the marker unguarded`);
    } finally { real.clean(); }
    const guarded2 = project();
    try {
      fs.mkdirSync(path.join(guarded2.dir, ".craftsman", "sessions", "sa-1"), { recursive: true });
      assert.equal(guardAs(guarded2, "sa-1", form).status, 2, `denied: ${form}`);
      const write = spawnSync(process.execPath, [GUARD], { cwd: guarded2.dir, env: guarded2.env, encoding: "utf8",
        input: JSON.stringify({ session_id: "sa-1", tool_name: "Write", tool_input: { file_path: safetyMarker(guarded2), content: "x" } }) });
      assert.equal(write.status, 2, "a Write of the marker is denied too");
    } finally { guarded2.clean(); }
  }
});

// Round 5 (35.x): the check that keeps a command from borrowing the session id, the state root or the safety switch reads
// the names, not only the `NAME=` spelling, and refuses nothing that merely reads them.
const VAR_SETTERS = [
  [`read CLAUDE_CODE_SESSION_ID <<< sessA; export CLAUDE_CODE_SESSION_ID; printenv CLAUDE_CODE_SESSION_ID`, "sessA"],
  [`printf -v CLAUDE_PROJECT_DIR %s /tmp/x; export CLAUDE_PROJECT_DIR; printenv CLAUDE_PROJECT_DIR`, "/tmp/x"],
  [`X=CLAUDE_CODE_SESSION_ID; env "$X=sessA" printenv CLAUDE_CODE_SESSION_ID`, "sessA"],
  [`declare -x CRAFTSMAN_SAFETY=off; printenv CRAFTSMAN_SAFETY`, "off"],
  [`read CRAFTSMAN_SAFETY <<< off; export CRAFTSMAN_SAFETY; printenv CRAFTSMAN_SAFETY`, "off"],
];

test("setting the session id, project dir or safety switch by read, printf -v, declare or env is refused, and each form really sets it (35.1)", () => {
  for (const [command, value] of VAR_SETTERS) {
    const real = spawnSync("bash", ["-c", command], { env: { PATH: process.env.PATH }, encoding: "utf8" });
    assert.equal(real.stdout.trim(), value, `the form is real: ${command}`);
    const p = spoofProject();
    try { assert.equal(guardAs(p, "sessB", command).status, 2, `denied: ${command}`); } finally { p.clean(); }
  }
  const spoofed = [
    `read CLAUDE_CODE_SESSION_ID <<< sessA; export CLAUDE_CODE_SESSION_ID; S=doc-wri; node ${path.dirname(DOC_WRITE)}/\${S}te.mjs on`,
    `X=CLAUDE_CODE_SESSION_ID; env "$X=sessA" CRAFTSMAN_SAFETY=off node ${DOC_WRITE} on`,
    `CRAFTSMAN_SAFETY=off node ${DOC_WRITE} on`,
  ];
  for (const command of spoofed) {
    const p = spoofProject();
    try { assert.equal(guardAs(p, "sessB", command).status, 2, `denied: ${command}`); } finally { p.clean(); }
  }
});

test("reading the session id, project dir or safety switch is still allowed (35.1)", () => {
  const p = spoofProject();
  try {
    for (const ok of [
      '[ "$CLAUDE_PROJECT_DIR" = /x ] && echo y', 'echo "$CLAUDE_CODE_SESSION_ID"', "printenv CLAUDE_CODE_SESSION_ID", 'test -n "$CRAFTSMAN_SAFETY"',
      "env | grep CLAUDE_CODE_SESSION_ID", 'export PATH="$PATH:$CLAUDE_PROJECT_DIR/bin"', 'printf "%s" "${CLAUDE_CODE_SESSION_ID:-none}"',
    ]) assert.equal(guardAs(p, "sessB", ok).status, 0, `allowed: ${ok}`);
  } finally { p.clean(); }
});

test("read, printf -v and declare of HOME before a hook-running git command are refused (35.2)", () => {
  const forms = ["read HOME <<< /tmp/fakehome; git commit -m a", "printf -v HOME %s /tmp/fakehome; export HOME; git commit -m a", "read XDG_CONFIG_HOME <<< /tmp/x; git push"];
  for (const command of forms) {
    const real = spawnSync("bash", ["-c", command.replace(/; git .*/, "; printenv HOME XDG_CONFIG_HOME")], { env: { PATH: process.env.PATH, HOME: "/home/orig", XDG_CONFIG_HOME: "/home/orig/.config" }, encoding: "utf8" });
    assert.match(real.stdout, /\/tmp\/(?:fakehome|x)/, `the form really changes the variable: ${command}`);
    const p = spoofProject();
    try { assert.equal(guardAs(p, "sessB", command).status, 2, `denied: ${command}`); } finally { p.clean(); }
  }
  const p = spoofProject();
  try {
    for (const ok of ['echo "$HOME"; git commit -m a', "read x <<< y; git commit -m a", "git status"]) assert.equal(guardAs(p, "sessB", ok).status, 0, `allowed: ${ok}`);
  } finally { p.clean(); }
});

test("the nonce is left only when the whole command is allowed, so a later denial leaves none (35.3)", () => {
  const p = project();
  try {
    record(p, "sa-1", "prompt", "plan");
    fs.mkdirSync(path.join(p.dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(p.dir, "docs", "plans", "x.md"), "x\n");
    assert.equal(guardAs(p, "sa-1", `node ${DOC_WRITE} on && rm docs/plans/x.md`).status, 2, "the doc removal is denied without a grant");
    assert.ok(!fs.existsSync(nonceFile(p, "sa-1", "doc-write")), "so no nonce was left");
    assert.equal(guardAs(p, "sa-1", `node ${DOC_WRITE} on`).status, 0);
    assert.ok(fs.existsSync(nonceFile(p, "sa-1", "doc-write")), "an allowed command still leaves one");
  } finally { p.clean(); }
});
