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

test("doc-write.mjs on refuses without the owning command's record, for this session (14.1)", () => {
  const p = project();
  try {
    let r = node(p, DOC_WRITE, ["on"]);
    assert.equal(r.status, 2, "no record at all");
    assert.match(r.stderr, /craftsman:.*(?:\/plan|doc writer|command)/i);
    assert.ok(!fs.existsSync(p.pending), "no grant was written");

    record(p, "other-session", "prompt", "plan");
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 2, "a record for another session");
    record(p, "sa-1", "prompt", "instruction");
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 2, "a record of a command that does not write docs");
    assert.ok(!fs.existsSync(p.pending));

    record(p, "sa-1", "prompt", "plan");
    assert.equal(node(p, DOC_WRITE, ["on"], without(p.env, "CLAUDE_CODE_SESSION_ID")).status, 2, "a missing session id refuses");
    assert.ok(!fs.existsSync(p.pending));
    r = node(p, DOC_WRITE, ["on"]);
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
    assert.equal(node(p, DOC_WRITE, ["on"]).status, 0);
  } finally { p.clean(); }
});

test("toggle.mjs off refuses unless the user typed /craftsman:toggle; on stays open (14.1)", () => {
  const p = project();
  try {
    assert.equal(node(p, TOGGLE, ["off"]).status, 2, "no record");
    assert.equal(node(p, TOGGLE, []).status, 2, "no argument flips to off, so it needs the record too");
    assert.ok(!fs.existsSync(p.off));
    record(p, "sa-1", "skill", "toggle");
    assert.equal(node(p, TOGGLE, ["off"]).status, 2, "a model Skill call is not the user typing it");
    assert.ok(!fs.existsSync(p.off));
    record(p, "other-session", "prompt", "toggle");
    assert.equal(node(p, TOGGLE, ["off"]).status, 2, "a record for another session");
    assert.equal(node(p, TOGGLE, ["on"]).status, 0, "on needs nothing");

    record(p, "sa-1", "prompt", "toggle");
    assert.equal(node(p, TOGGLE, ["off"], without(p.env, "CLAUDE_CODE_SESSION_ID")).status, 2, "a missing session id refuses");
    assert.equal(node(p, TOGGLE, ["off"]).status, 0);
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
