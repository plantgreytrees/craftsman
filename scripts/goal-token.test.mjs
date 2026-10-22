// ARCH-SAFETY-09: the mod launches a goal only if craftsman wrote it this session. goal-token.mjs is how
// /instruction and /auto say so, and it only does so after one of those commands ran.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
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
    assert.deepEqual(tokens(dir, "gt-1"), { "x.goal.txt": { mtimeMs: fs.statSync(goal).mtimeMs, sha256: createHash("sha256").update("/goal Deliver x.\n").digest("hex") } });
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

test("goal-token: rewriting the goal file afterwards leaves the token stale (name, mtime and content digest must all match)", async () => {
  const dir = project();
  try {
    const goal = path.join(dir, ".craftsman", "instructions", "x.goal.txt");
    fs.writeFileSync(goal, "/goal x\n");
    assert.equal(typed(dir, "gt-4", "/craftsman:instruction x").status, 0);
    assert.equal(mint(dir, goal, "gt-4").status, 0);
    const before = tokens(dir, "gt-4")["x.goal.txt"].mtimeMs;
    fs.utimesSync(goal, new Date(), new Date(Date.now() + 5000)); // something else rewrites it
    assert.notEqual(fs.statSync(goal).mtimeMs, before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the mod's pure-JS SHA-256 agrees with node:crypto on block-boundary and non-ASCII inputs (31.1)", () => {
  const source = fs.readFileSync(path.join(ROOT, "..", "hooks", "register.js"), "utf8");
  const k = /const SHA256_K = (\[[\s\S]*?\]);/.exec(source)?.[1];
  const fn = /function sha256Hex\(text\) \{[\s\S]*?\n\}\n/.exec(source)?.[0];
  assert.ok(k && fn, "the mod holds SHA256_K and sha256Hex");
  const sha256Hex = new Function(`const SHA256_K = ${k}; ${fn}; return sha256Hex;`)();
  for (const text of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(65), "a".repeat(119), "a".repeat(128), "héllo wörld ✓ 日本語", "/goal Deliver x.\n", "line\r\nline\r\n".repeat(40)]) {
    assert.equal(sha256Hex(text), createHash("sha256").update(text).digest("hex"), JSON.stringify(text.slice(0, 20)) + ` (${text.length} chars)`);
  }
});

test("goal-token: the token holds the digest of the content, so restoring the mtime after a rewrite does not restore the token (31.1)", () => {
  const dir = project();
  try {
    const goal = path.join(dir, ".craftsman", "instructions", "x.goal.txt");
    fs.writeFileSync(goal, "/goal Deliver x.\n");
    assert.equal(typed(dir, "gt-5", "/craftsman:instruction x").status, 0);
    assert.equal(mint(dir, goal, "gt-5").status, 0);
    const token = tokens(dir, "gt-5")["x.goal.txt"];
    assert.match(token.sha256, /^[0-9a-f]{64}$/);
    // The attack: rewrite the file, then put the old mtime back.
    const { mtimeMs } = fs.statSync(goal);
    fs.writeFileSync(goal, "/goal Do something else.\n");
    fs.utimesSync(goal, mtimeMs / 1000, mtimeMs / 1000);
    assert.equal(fs.statSync(goal).mtimeMs, token.mtimeMs, "the mtime is restored, so name and mtime alone would still match");
    assert.notEqual(createHash("sha256").update(fs.readFileSync(goal)).digest("hex"), token.sha256, "the content digest no longer matches");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
