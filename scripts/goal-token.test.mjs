// ARCH-SAFETY-09: the mod launches a goal only if craftsman wrote it this session. goal-token.mjs is how
// /instruction and /auto say so, and it only does so after one of those commands ran.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = path.join(ROOT, "goal-token.mjs");
const OSG = path.join(ROOT, "orchestrate-scope-guard.mjs");

function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-goal-token-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  fs.mkdirSync(path.join(dir, ".craftsman", "instructions"), { recursive: true });
  return dir;
}
const envFor = (dir, sid) => {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  if (sid) env.CLAUDE_CODE_SESSION_ID = sid; else delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CRAFTSMAN_SAFETY;
  return env;
};
const mint = (dir, file, sid = "gt-1") => spawnSync(process.execPath, [TOKEN, file], { cwd: dir, encoding: "utf8", env: envFor(dir, sid) });
const typed = (dir, sid, prompt) => spawnSync(process.execPath, [OSG], { cwd: dir, input: JSON.stringify({ session_id: sid, prompt }), encoding: "utf8", env: envFor(dir, sid) });
const tokens = (dir, sid) => JSON.parse(fs.readFileSync(path.join(dir, ".craftsman", "sessions", sid, "goal-tokens.json"), "utf8"));

test("goal-token: records name and mtime for a goal file, after /instruction or /auto ran in this session", () => {
  const dir = project();
  try {
    const goal = path.join(dir, ".craftsman", "instructions", "x.goal.txt");
    fs.writeFileSync(goal, "/goal Deliver x.\n");
    assert.equal(typed(dir, "gt-1", "/craftsman:instruction x").status, 0);
    const r = mint(dir, goal);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(tokens(dir, "gt-1"), { "x.goal.txt": fs.statSync(goal).mtimeMs });
    // a second goal adds to it; a relative path works
    fs.writeFileSync(path.join(dir, ".craftsman", "instructions", "y.goal.txt"), "/goal y\n");
    assert.equal(mint(dir, ".craftsman/instructions/y.goal.txt").status, 0);
    assert.deepEqual(Object.keys(tokens(dir, "gt-1")).sort(), ["x.goal.txt", "y.goal.txt"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("goal-token: /auto also mints; with neither command run in the session it refuses and records nothing", () => {
  const dir = project();
  try {
    const goal = path.join(dir, ".craftsman", "instructions", "x.goal.txt");
    fs.writeFileSync(goal, "/goal x\n");
    const refused = mint(dir, goal, "gt-2");
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /only inside \/instruction or \/auto/);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman", "sessions", "gt-2", "goal-tokens.json")), false);
    assert.equal(typed(dir, "gt-2", "/craftsman:auto some-slug").status, 0);
    assert.equal(mint(dir, goal, "gt-2").status, 0);
    assert.equal(mint(dir, goal, "gt-other").status, 2, "another session has no such command");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("goal-token: only a .goal.txt directly under .craftsman/instructions, with a session id, that exists", () => {
  const dir = project();
  try {
    assert.equal(typed(dir, "gt-3", "/craftsman:instruction x").status, 0);
    fs.writeFileSync(path.join(dir, "evil.goal.txt"), "x");
    fs.writeFileSync(path.join(dir, ".craftsman", "instructions", "notes.txt"), "x");
    fs.mkdirSync(path.join(dir, ".craftsman", "instructions", "sub"));
    fs.writeFileSync(path.join(dir, ".craftsman", "instructions", "sub", "z.goal.txt"), "x");
    for (const bad of ["evil.goal.txt", ".craftsman/instructions/notes.txt", ".craftsman/instructions/sub/z.goal.txt",
      ".craftsman/instructions/missing.goal.txt", "../outside.goal.txt", ".craftsman/instructions/../../evil.goal.txt"]) {
      const r = mint(dir, bad, "gt-3");
      assert.equal(r.status, 2, bad);
      assert.match(r.stderr, /craftsman: goal-token/);
    }
    fs.writeFileSync(path.join(dir, ".craftsman", "instructions", "ok.goal.txt"), "x");
    const noSession = mint(dir, ".craftsman/instructions/ok.goal.txt", null);
    assert.equal(noSession.status, 2);
    assert.match(noSession.stderr, /no session id/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("goal-token: rewriting the goal file afterwards leaves the token stale (name and mtime must both match)", async () => {
  const dir = project();
  try {
    const goal = path.join(dir, ".craftsman", "instructions", "x.goal.txt");
    fs.writeFileSync(goal, "/goal x\n");
    assert.equal(typed(dir, "gt-4", "/craftsman:instruction x").status, 0);
    assert.equal(mint(dir, goal, "gt-4").status, 0);
    const before = tokens(dir, "gt-4")["x.goal.txt"];
    fs.utimesSync(goal, new Date(), new Date(Date.now() + 5000)); // something else rewrites it
    assert.notEqual(fs.statSync(goal).mtimeMs, before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
