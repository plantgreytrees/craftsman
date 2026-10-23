// SessionEnd: the unpushed-work report and the hand-off go to stderr, the channel the docs say the
// user sees at exit. It never blocks (SessionEnd has no decision control) and never throws.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SESSION_END = path.join(ROOT, "session-end.mjs");

function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-session-end-")));
  const g = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@example.com"); g("config", "user.name", "t"); g("config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  g("add", "-A"); g("commit", "-q", "-m", "init");
  const remote = `${dir}-remote.git`; // a pushed repo, so a clean session really is clean
  spawnSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  g("remote", "add", "origin", remote); g("push", "-q", "-u", "origin", "main");
  return dir;
}
const end = (dir, input, env = {}) => spawnSync(process.execPath, [SESSION_END], {
  cwd: dir, input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8",
  env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
});

test("session-end: prints the unpushed report and the hand-off to stderr, exits 0", () => {
  const dir = project();
  try {
    fs.writeFileSync(path.join(dir, "wip.txt"), "wip\n");
    const sid = "end-1";
    const sessionDir = path.join(dir, ".craftsman", "sessions", sid);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "handoff.json"), JSON.stringify({ plan: "docs/plans/p.md", unit: "u1", next_action: "run step 2" }));
    const r = end(dir, { session_id: sid, reason: "other" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /craftsman: unpushed work \(local refs only\):/);
    assert.match(r.stderr, /uncommitted changes in the main checkout: 1 file\(s\)/);
    assert.match(r.stderr, /craftsman hand-off: plan docs\/plans\/p\.md; unit u1; next: run step 2/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(`${dir}-remote.git`, { recursive: true, force: true }); }
});

test("session-end: a clean session with no hand-off says nothing", () => {
  const dir = project();
  try {
    const r = end(dir, { session_id: "end-2" });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(`${dir}-remote.git`, { recursive: true, force: true }); }
});

test("session-end: bad or empty stdin, or CRAFTSMAN_SAFETY=off, never blocks and never throws", () => {
  const dir = project();
  try {
    fs.writeFileSync(path.join(dir, "wip.txt"), "wip\n");
    for (const input of ["not json", ""]) assert.equal(end(dir, input).status, 0);
    const off = end(dir, { session_id: "end-3" }, { CRAFTSMAN_SAFETY: "off" });
    assert.equal(off.status, 0);
    assert.equal(off.stderr, "");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(`${dir}-remote.git`, { recursive: true, force: true }); }
});
