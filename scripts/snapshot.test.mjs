// ARCH-STATE-21: a stopGate command with a `{changed}` / `{changedDirs}` placeholder is never snapshotted - Stop derives
// it from config and runs it against the session change list - so snapshot.mjs neither runs it at session start nor
// lists it in session-start.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
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

// Like STUB, but it logs beside itself, outside the repository, so running it leaves the working tree as it found it.
// With the argument `edit` it also appends to a tracked file: an edit made while the snapshot runs.
const QUIET = `const fs = require("node:fs"), path = require("node:path");
fs.appendFileSync(path.join(__dirname, "quiet.log"), process.argv.slice(2).join(" ") + "\\n");
if (process.argv[2] === "edit") fs.appendFileSync(path.join(process.cwd(), "tracked.txt"), "edited while the snapshot runs\\n");
`;

// A git repo whose stopGate.commands map each tracked `<name>.fixture` marker to the given command.
function fixture(commands) {
  const base = scratch();
  const root = path.join(base, "repo");
  fs.mkdirSync(root, { recursive: true });
  const stub = put(base, "stub.cjs", STUB);
  const quiet = put(base, "quiet.cjs", QUIET);
  const cmds = Object.fromEntries(Object.entries(commands).map(([marker, cmd]) => [marker, cmd.replace("STUB", stub).replace("QUIET", quiet)]));
  for (const a of [["init", "-q"], ["config", "user.email", "t@e.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"]])
    spawnSync("git", a, { cwd: root });
  put(root, "craftsman.config.json", JSON.stringify({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false, commands: cmds } }));
  put(root, "tracked.txt", "tracked\n");
  for (const marker of Object.keys(cmds)) put(root, marker, "marker\n");
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  return root;
}

const envFor = (root) => {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
  for (const k of ["CLAUDE_CODE_SESSION_ID", "CRAFTSMAN_WORKSPACE_MANIFEST"]) delete env[k];
  return env;
};

// `tree` is the starting-tree hash SessionStart hands the snapshot as its fourth argument; "" skips the comparison.
function snapshot(root, sid, tree = "") {
  return spawnSync(process.execPath, [SNAPSHOT, sid, ".", tree], { cwd: root, encoding: "utf8", env: envFor(root) });
}

// The hash session-context.mjs takes before it spawns the snapshot: HEAD and the porcelain status, craftsman's own state aside.
function startingTree(root) {
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout;
  const status = git("status", "--porcelain", "--untracked-files=all").split("\n").filter((line) => !line.slice(3).startsWith(".craftsman")).join("\n");
  return createHash("sha1").update(`${git("rev-parse", "HEAD").trim()}\n${status}`).digest("hex");
}

// SessionStart writes snapshot-started after it takes the hash (ARCH-STATE-22): the state a real start adds to the tree.
const writeStarted = (root, sid) => put(root, `.craftsman/sessions/${sid}/snapshot-started`, String(Date.now()));
const porcelain = (root) => spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).stdout;

// The real Stop hook for a dirty session, and the skip reasons it logged.
const STOP_GATE = fileURLToPath(new URL("./stop-gate.mjs", import.meta.url));
function dirtyStop(root, sid) {
  put(root, `.craftsman/sessions/${sid}/dirty`, String(Date.now()));
  const r = spawnSync(process.execPath, [STOP_GATE], { cwd: root, input: JSON.stringify({ session_id: sid }), encoding: "utf8", env: envFor(root) });
  assert.equal(r.status, 0, r.stderr);
  const events = fs.readFileSync(path.join(root, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return events.filter((e) => e.sid === sid && e.ev === "stop-tests-skipped").map((e) => e.reason);
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

// ARCH-STATE-04: the repo does NOT gitignore `.craftsman/` here (this fixture has no .gitignore), so craftsman's own state shows
// in `git status`. SessionStart writes snapshot-started after it takes the starting hash; the snapshot must compare trees
// without those lines, or it drops its own baseline.
const quietLog = (root) => path.join(path.dirname(root), "quiet.log");

test("snapshot: craftsman state written after the starting hash does not drop the snapshot when .craftsman/ is not gitignored (ARCH-STATE-04)", () => {
  const root = fixture({ "plain.fixture": "node QUIET plain" });
  const tree = startingTree(root);
  writeStarted(root, "snap-state");
  assert.match(porcelain(root), /^\?\? \.craftsman\/sessions\/snap-state\/snapshot-started$/m, "the state is in git status, not ignored");
  const r = snapshot(root, "snap-state", tree);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(quietLog(root), "utf8"), "plain\n", "the command ran");
  assert.deepEqual(readStart(root, "snap-state").results.map((x) => x.green), [true], "the snapshot landed session-start.json");
});

test("snapshot: an edit to a tracked file while the snapshot runs still drops it, with the state lines in the tree (ARCH-STATE-04)", () => {
  const root = fixture({ "edit.fixture": "node QUIET edit" });
  const tree = startingTree(root);
  writeStarted(root, "snap-edit");
  const r = snapshot(root, "snap-edit", tree);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(quietLog(root), "utf8"), "edit\n", "the command ran and edited a tracked file");
  assert.match(porcelain(root), /^ M tracked\.txt$/m);
  assert.equal(fs.existsSync(startFile(root, "snap-edit")), false, "the tree moved, so no baseline is recorded");
});

test("snapshot: a changed tree drops the snapshot just as before when nothing of craftsman's own is in it", () => {
  const root = fixture({ "edit.fixture": "node QUIET edit" });
  const r = snapshot(root, "snap-plain-edit", startingTree(root));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(startFile(root, "snap-plain-edit")), false);
});

// ARCH-STATE-22: a command whose program is not installed was never a red test, so it is skipped like a scoped command: no
// entry in session-start.json, and Stop has nothing to call red-at-start.
const MISSING = `craftsman-no-such-program-${process.pid}-${Date.now()}`;

test("snapshot: a command whose program is not installed leaves no entry in session-start.json (ARCH-STATE-22)", () => {
  const root = fixture({ "plain.fixture": "node QUIET plain", "missing.fixture": `${MISSING} --run` });
  const r = snapshot(root, "snap-enoent");
  assert.equal(r.status, 0, r.stderr);
  const { results } = readStart(root, "snap-enoent");
  assert.deepEqual(results.map((x) => x.cmd.split(/\s+/).pop()), ["plain"], "only the installed command is listed");
  assert.equal(results[0].green, true);
});

test("snapshot: a command that is installed but exits non-zero is still recorded red (ARCH-STATE-22)", () => {
  const root = fixture({ "red.fixture": `node -e process.exit(1)` });
  assert.equal(snapshot(root, "snap-red").status, 0);
  assert.deepEqual(readStart(root, "snap-red").results.map((x) => x.green), [false]);
});

// ARCH-ENGINE-22: a missing program is no gate command at all (gateUsable), so no command is found to snapshot and no session-start.json is written.
test("snapshot: with only a missing program no session-start.json is written and Stop logs no-command, never red-at-start (ARCH-STATE-22)", () => {
  const root = fixture({ "missing.fixture": `${MISSING} --run` });
  assert.equal(snapshot(root, "snap-gone").status, 0);
  assert.equal(fs.existsSync(startFile(root, "snap-gone")), false, "no usable command, so no baseline file");
  assert.deepEqual(dirtyStop(root, "snap-gone"), ["no-command"]);
});
