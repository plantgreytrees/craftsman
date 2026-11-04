// ARCH-STATE-21: a stopGate command with a `{changed}` / `{changedDirs}` placeholder is never snapshotted - Stop derives
// it from config and runs it against the session change list - so snapshot.mjs neither runs it at session start nor
// lists it in session-start.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SNAPSHOT = fileURLToPath(new URL("./snapshot.mjs", import.meta.url));

const scratch = (prefix = "snapshot-") => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
function put(root, rel, text = "x\n") {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

// Appends its arguments to ran.log in the directory it runs in: proof a command was started.
const STUB = `const fs = require("node:fs"), path = require("node:path");
fs.appendFileSync(path.join(process.cwd(), "ran.log"), process.argv.slice(2).join(" ") + "\\n");
`;

// A git repo whose stopGate.commands map each tracked `<name>.fixture` marker to the given command.
function fixture(commands) {
  const base = scratch();
  const root = path.join(base, "repo");
  fs.mkdirSync(root, { recursive: true });
  const stub = put(base, "stub.cjs", STUB);
  const cmds = Object.fromEntries(Object.entries(commands).map(([marker, cmd]) => [marker, cmd.replace("STUB", stub)]));
  for (const a of [["init", "-q"], ["config", "user.email", "t@e.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"]])
    spawnSync("git", a, { cwd: root });
  put(root, "craftsman.config.json", JSON.stringify({ stopGate: { commands: cmds } }));
  for (const marker of Object.keys(cmds)) put(root, marker, "marker\n");
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  return root;
}

function snapshot(root, sid) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
  for (const k of ["CLAUDE_CODE_SESSION_ID", "CRAFTSMAN_WORKSPACE_MANIFEST"]) delete env[k];
  return spawnSync(process.execPath, [SNAPSHOT, sid, ".", ""], { cwd: root, encoding: "utf8", env });
}

const startFile = (root, sid) => path.join(root, ".craftsman", "sessions", sid, "session-start.json");
const readStart = (root, sid) => JSON.parse(fs.readFileSync(startFile(root, sid), "utf8"));
const ranLog = (root) => path.join(root, "ran.log");

test("snapshot: only the plain command is in session-start.json; the placeholder command is not run or listed", () => {
  const root = fixture({
    "plain.fixture": "node STUB plain",
    "scoped.fixture": "node STUB scoped {changed}",
  });
  const r = snapshot(root, "snap-mixed");
  assert.equal(r.status, 0, r.stderr);
  const start = readStart(root, "snap-mixed");
  assert.equal(start.results.length, 1);
  assert.match(start.results[0].cmd, /stub\.cjs plain$/);
  assert.equal(start.results[0].green, true);
  assert.equal(fs.readFileSync(ranLog(root), "utf8"), "plain\n", "the placeholder command was never started");
});

test("snapshot: {changedDirs} commands are left out as well", () => {
  const root = fixture({
    "plain.fixture": "node STUB plain",
    "dirs.fixture": "node STUB dirs {changedDirs}",
  });
  assert.equal(snapshot(root, "snap-dirs").status, 0);
  assert.deepEqual(readStart(root, "snap-dirs").results.map((x) => x.cmd.split(/\s+/).pop()), ["plain"]);
  assert.equal(fs.readFileSync(ranLog(root), "utf8"), "plain\n");
});

test("snapshot: with only placeholder commands nothing runs and session-start.json lists no command", () => {
  const root = fixture({ "scoped.fixture": "node STUB scoped {changed}" });
  assert.equal(snapshot(root, "snap-only").status, 0);
  assert.deepEqual(readStart(root, "snap-only").results, []);
  assert.equal(fs.existsSync(ranLog(root)), false, "the placeholder command was never started");
});

// A placeholder inside a longer argument (`--files={changed}`) is a scoped command too: it can never be expanded, so
// running it here would hand the tool the literal braces, and listing it would make Stop treat it as a baselined test.
test("snapshot: an embedded-placeholder command is neither run nor listed in session-start.json", () => {
  const root = fixture({ "embedded.fixture": "node STUB --files={changed}" });
  const r = snapshot(root, "snap-embedded");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readStart(root, "snap-embedded").results, []);
  assert.equal(fs.existsSync(ranLog(root)), false, "the embedded-placeholder command was never started");
});

test("snapshot: whole, embedded and plain commands side by side - only the plain one is run and listed", () => {
  const root = fixture({
    "plain.fixture": "node STUB plain",
    "whole.fixture": "node STUB whole {changed}",
    "embedded.fixture": "node STUB --files={changed}",
    "embeddedDirs.fixture": "node STUB --dirs={changedDirs}",
  });
  assert.equal(snapshot(root, "snap-three").status, 0);
  assert.deepEqual(readStart(root, "snap-three").results.map((x) => x.cmd.split(/\s+/).pop()), ["plain"]);
  assert.equal(fs.readFileSync(ranLog(root), "utf8"), "plain\n", "nothing but the plain command was started");
});
