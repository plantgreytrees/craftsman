import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dirname, "script-size-delta.mjs");
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function repo(baseBody) {
  const root = mkdtempSync(join(tmpdir(), "ssd-"));
  const origin = join(root, "origin.git"), work = join(root, "work");
  git(root, "init", "--bare", "-q", origin);
  mkdirSync(join(work, "scripts"), { recursive: true });
  git(work, "init", "-q");
  git(work, "config", "user.email", "t@t");
  git(work, "config", "user.name", "t");
  git(work, "remote", "add", "origin", origin);
  writeFileSync(join(work, "scripts/a.mjs"), baseBody);
  git(work, "add", "-A");
  git(work, "commit", "-qm", "base");
  const base = git(work, "rev-parse", "HEAD");
  return { work, base };
}
const commit = (work, body) => {
  writeFileSync(join(work, "scripts/a.mjs"), body);
  git(work, "commit", "-qam", "head");
};
const run = (cwd, arg, env = {}) =>
  spawnSync("node", [script, ...(arg ? [arg] : [])], { cwd, encoding: "utf8", env: { ...process.env, ...env } });

test("growth warns and exits 0", () => {
  const { work, base } = repo("aaaa");
  commit(work, "aaaaaaaa");
  const r = run(work, base);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /base 4, head 8, delta 4/);
  assert.match(r.stdout, /::warning::.*4 bytes/);
});

test("shrink prints delta without a warning", () => {
  const { work, base } = repo("aaaaaaaa");
  commit(work, "aa");
  const r = run(work, base);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /delta -6/);
  assert.doesNotMatch(r.stdout, /::warning::/);
});

test("missing base emits a notice and exits 0", () => {
  const { work } = repo("aaaa");
  const r = run(work, "0".repeat(40));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /::notice::/);
  assert.doesNotMatch(r.stdout, /::warning::/);
});

test("absent base object is fetched from origin", () => {
  const { work, base } = repo("aaaa");
  git(work, "push", "-q", "origin", "HEAD:refs/heads/main");
  commit(work, "aaaaaaaa");
  const clone = join(mkdtempSync(join(tmpdir(), "ssd-c-")), "c");
  mkdirSync(join(clone, "scripts"), { recursive: true });
  git(clone, "init", "-q");
  git(clone, "config", "user.email", "t@t");
  git(clone, "config", "user.name", "t");
  git(clone, "remote", "add", "origin", join(work, "..", "origin.git"));
  writeFileSync(join(clone, "scripts/a.mjs"), "aaaaaaaa");
  git(clone, "add", "-A");
  git(clone, "commit", "-qm", "head");
  const r = run(clone, base);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /base 4, head 8, delta 4/);
  assert.match(r.stdout, /::warning::/);
});

test("a thrown error emits a notice and exits 0", () => {
  const { work } = repo("aaaa");
  const r = run(work, undefined);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /::notice::/);
  const outside = run(tmpdir(), "HEAD");
  assert.equal(outside.status, 0);
  assert.match(outside.stdout, /::notice::/);
});
