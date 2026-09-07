import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./gate-select.mjs", import.meta.url));
const fixtures = new Set();

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-gate-select-"));
  fixtures.add(dir);
  const run = (args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  };
  run(["init", "-q"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "test"]);
  run(["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "init"]);
  return { dir, run };
}

function gatesFor(dir) {
  const r = spawnSync(process.execPath, [SCRIPT, "HEAD~1..HEAD"], { cwd: dir, encoding: "utf8" });
  return new Set(r.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
}

after(() => { for (const d of fixtures) fs.rmSync(d, { recursive: true, force: true }); });

test("gate-select: a component file triggers ui, not the other gates", () => {
  const { dir, run } = repo();
  fs.writeFileSync(path.join(dir, "Button.tsx"), "export const Button = () => <button />;\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "add button"]);
  assert.deepEqual(gatesFor(dir), new Set(["ui"]));
});

test("gate-select: a migrations-directory file triggers migration", () => {
  const { dir, run } = repo();
  fs.mkdirSync(path.join(dir, "migrations"));
  fs.writeFileSync(path.join(dir, "migrations", "001_init.sql"), "CREATE TABLE users (id int);\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "add migration"]);
  assert.deepEqual(gatesFor(dir), new Set(["migration"]));
});

test("gate-select: raw DDL added outside a migrations path still triggers migration", () => {
  const { dir, run } = repo();
  fs.writeFileSync(path.join(dir, "setup.js"), "db.exec('ALTER TABLE users ADD COLUMN age int');\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "inline ddl"]);
  assert.ok(gatesFor(dir).has("migration"));
});

test("gate-select: a new package.json dependency triggers dependency only", () => {
  const { dir, run } = repo();
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { left: "1.0.0" } }));
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "add dep"]);
  assert.deepEqual(gatesFor(dir), new Set(["dependency"]));
});

test("gate-select: a loop wrapping an awaited query triggers performance", () => {
  const { dir, run } = repo();
  fs.writeFileSync(path.join(dir, "load.js"), "for (const id of ids) { await db.query(id); }\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "n+1"]);
  assert.deepEqual(gatesFor(dir), new Set(["performance"]));
});

test("gate-select: a new outbound fetch call triggers observability", () => {
  const { dir, run } = repo();
  fs.writeFileSync(path.join(dir, "client.js"), "export async function ping() { return fetch('https://example.com'); }\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "outbound call"]);
  assert.deepEqual(gatesFor(dir), new Set(["observability"]));
});

test("gate-select: a plain doc-only change triggers no gates", () => {
  const { dir, run } = repo();
  fs.writeFileSync(path.join(dir, "NOTES.md"), "just some prose\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "notes"]);
  assert.deepEqual(gatesFor(dir), new Set());
});

test("gate-select: an invalid range fails safe to no gates, not a crash", () => {
  const { dir } = repo();
  const r = spawnSync(process.execPath, [SCRIPT, "not-a-real-range"], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
