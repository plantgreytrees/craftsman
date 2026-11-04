// ARCH-STATE-21: Stop runs the placeholder commands of stopGate.commands and stopGate.extraChecks against the session
// change list - only when dirty, with no green-at-start precondition, never unexpanded - and reports a failure or a
// budget kill as scoped, never as a regression. ARCH-STATE-22: an empty or unknown change set is a logged skip reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STOP_GATE_PATH = fileURLToPath(new URL("./stop-gate.mjs", import.meta.url));

// A stub that records the argv it received (one JSON line per run in argv.log) and prints it.
const CHECK = `import fs from "node:fs";
const argv = process.argv.slice(2);
fs.appendFileSync("argv.log", JSON.stringify(argv) + "\\n");
console.log("argv:" + JSON.stringify(argv));
`;
const FAIL = `console.log("first line");
console.log("boom: the scoped check failed");
process.exit(1);
`;
const SLOW = `await new Promise((resolve) => setTimeout(resolve, 5000));
`;

function makeFixture(stopGate = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stop-gate-scoped-"));
  for (const a of [["init", "-q"], ["config", "user.email", "t@e.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"]])
    spawnSync("git", a, { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  fs.writeFileSync(path.join(dir, "check.mjs"), CHECK);
  fs.writeFileSync(path.join(dir, "fail.mjs"), FAIL);
  fs.writeFileSync(path.join(dir, "slow.mjs"), SLOW);
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({
    security: { enabled: false },
    stopGate: { requireAcceptanceCriteria: false, ...stopGate },
  }));
  return dir;
}

// A session's state: the dirty marker, the change list (undefined = no list at all, [] = an empty one) and an
// optional session-start.json. Stop drops a listed path that no longer exists before it expands anything, so each
// listed file is created on disk unless the test names it in `gone`.
function seed(root, sid, { dirty = true, changed, start, gone = [] } = {}) {
  const sessions = path.join(root, ".craftsman", "sessions", sid);
  fs.mkdirSync(sessions, { recursive: true });
  if (dirty) fs.writeFileSync(path.join(sessions, "dirty"), String(Date.now()));
  if (changed !== undefined) {
    fs.writeFileSync(path.join(sessions, "changed"), changed.map((f) => f + "\n").join(""));
    for (const f of changed.filter((f) => !gone.includes(f))) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), "x\n");
    }
  }
  if (start !== undefined) fs.writeFileSync(path.join(sessions, "session-start.json"), JSON.stringify(start));
}

function runStop(cwd, sid) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STOP_GATE_PATH], { cwd });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("error", reject);
    child.on("close", () => {
      let events = [];
      try {
        events = fs.readFileSync(path.join(cwd, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.sid === sid);
      } catch { /* no event log */ }
      let out = {};
      try { out = JSON.parse(stdout); } catch { /* a silent pass prints nothing */ }
      resolve({ stdout, out, events });
    });
    child.stdin.end(JSON.stringify({ session_id: sid }));
  });
}

// What each run of the stub received, in order; [] when it never ran.
function runs(dir) {
  try { return fs.readFileSync(path.join(dir, "argv.log"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

// The systemMessage Stop printed ("" when none); it also carries the unpushed-work report, so assertions name their text.
const msg = (r) => r.out.systemMessage || "";
const skipped = (events) => events.filter((e) => e.ev === "stop-tests-skipped");
const dirtyMarker = (dir, sid) => path.join(dir, ".craftsman", "sessions", sid, "dirty");

async function withFixture(stopGate, fn) {
  const dir = makeFixture(stopGate);
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// 4.1 - which entries are scoped, and that they expand ------------------------------------------------------------

test("scoped: an extraChecks entry with {changed} receives the edited paths, never the literal placeholder (4.1)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s41", { changed: ["src/a.js", "src/b.js"] });
    const r = await runStop(dir, "s41");
    assert.deepEqual(runs(dir), [["src/a.js", "src/b.js"]], "one run, the edited files as separate arguments");
    assert.ok(!runs(dir).flat().includes("{changed}"));
    assert.notEqual(r.out.decision, "block");
    assert.deepEqual(skipped(r.events), []);
  }));

test("scoped: a stopGate.commands entry with {changedDirs} runs when its marker is present (4.1)", () =>
  withFixture({ commands: { "package.json": "node check.mjs {changedDirs}" } }, async (dir) => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
    seed(dir, "s41b", { changed: ["svc/a/x.js", "svc/a/y.js", "svc/b/z.js"] });
    const r = await runStop(dir, "s41b");
    assert.deepEqual(runs(dir), [["svc/a", "svc/b"]]);
    assert.notEqual(r.out.decision, "block");
  }));

test("scoped: a stopGate.commands entry whose marker is absent is not run, and says nothing (4.1)", () =>
  withFixture({ commands: { "package.json": "node check.mjs {changed}" } }, async (dir) => {
    seed(dir, "s41c", { changed: ["src/a.js"] });
    const r = await runStop(dir, "s41c");
    assert.deepEqual(runs(dir), []);
    assert.doesNotMatch(msg(r), /stop-gate/);
  }));

test("scoped: a clean session runs no scoped command and logs reason clean (4.1)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s41d", { dirty: false, changed: ["src/a.js"] });
    const r = await runStop(dir, "s41d");
    assert.deepEqual(runs(dir), []);
    assert.deepEqual(skipped(r.events).map((e) => e.reason), ["clean"]);
  }));

test("scoped: an extraChecks entry without a placeholder still runs as a guard, dirty or not (4.1)", () =>
  withFixture({ extraChecks: ["node check.mjs fixed"] }, async (dir) => {
    seed(dir, "s41e", { dirty: false });
    await runStop(dir, "s41e");
    assert.deepEqual(runs(dir), [["fixed"]]);
  }));

// 4.2 - the three outcomes of expansion ---------------------------------------------------------------------------

test("scoped: an empty change set skips the command and logs one no-changes (4.2)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s42a", { changed: [] });
    const r = await runStop(dir, "s42a");
    assert.deepEqual(runs(dir), [], "nothing ran, in particular not with a literal {changed}");
    const logged = skipped(r.events);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].reason, "no-changes");
    assert.equal(logged[0].project, ".");
    assert.notEqual(r.out.decision, "block");
    assert.ok(fs.existsSync(dirtyMarker(dir, "s42a")), "nothing was tested, so the session stays dirty");
  }));

test("scoped: a missing change list while dirty logs changes-unknown each Stop and says so once per session (4.2)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s42b");
    const first = await runStop(dir, "s42b");
    assert.deepEqual(runs(dir), []);
    assert.deepEqual(skipped(first.events).map((e) => e.reason), ["changes-unknown"]);
    assert.match(msg(first), /craftsman: stop-gate skipped .*node check\.mjs \{changed\}/);
    assert.match(msg(first), /change list/);
    assert.match(msg(first), /advisory only/);

    const second = await runStop(dir, "s42b");
    assert.deepEqual(runs(dir), []);
    assert.equal(skipped(second.events).filter((e) => e.reason === "changes-unknown").length, 2, "the reason is logged every Stop");
    assert.doesNotMatch(msg(second), /stop-gate skipped/, "but said only once");
  }));

test("scoped: an unreadable change list is changes-unknown too (4.2)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s42c");
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", "s42c", "changed")); // a directory cannot be read as the list
    const r = await runStop(dir, "s42c");
    assert.deepEqual(runs(dir), []);
    assert.deepEqual(skipped(r.events).map((e) => e.reason), ["changes-unknown"]);
  }));

test("scoped: an embedded placeholder runs nothing and says so once per session (4.2)", () =>
  withFixture({ extraChecks: ["node check.mjs --files={changed}"] }, async (dir) => {
    seed(dir, "s42d", { changed: ["src/a.js"] });
    const first = await runStop(dir, "s42d");
    assert.deepEqual(runs(dir), [], "never run with the placeholder left in");
    assert.match(msg(first), /craftsman: stop-gate skipped .*--files=\{changed\}/);
    assert.match(msg(first), /whole argument/);
    assert.notEqual(first.out.decision, "block");

    seed(dir, "s42d", { changed: ["src/a.js"] });
    const second = await runStop(dir, "s42d");
    assert.deepEqual(runs(dir), []);
    assert.doesNotMatch(msg(second), /stop-gate skipped/, "said once");
  }));

// 4.3 - failure and budget ----------------------------------------------------------------------------------------

test("scoped: a failing stopGate.commands entry blocks as SCOPED TESTS FAILED (not baselined), never as a regression (4.3)", () =>
  withFixture({ commands: { "package.json": "node fail.mjs {changed}" } }, async (dir) => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
    seed(dir, "s43a", { changed: ["src/a.js"] });
    const r = await runStop(dir, "s43a");
    assert.equal(r.out.decision, "block");
    assert.match(r.out.reason, /SCOPED TESTS FAILED \(not baselined\): node fail\.mjs \{changed\}\n/);
    assert.match(r.out.reason, /boom: the scoped check failed/, "the output tail follows");
    assert.doesNotMatch(r.out.reason, /regression/i);
    assert.doesNotMatch(r.out.reason, /GUARD FAILED/);
  }));

test("scoped: a failing extraChecks entry blocks with the same scoped text (4.3)", () =>
  withFixture({ extraChecks: ["node fail.mjs {changed}"] }, async (dir) => {
    seed(dir, "s43b", { changed: ["src/a.js"] });
    const r = await runStop(dir, "s43b");
    assert.equal(r.out.decision, "block");
    assert.match(r.out.reason, /SCOPED TESTS FAILED \(not baselined\): node fail\.mjs \{changed\}/);
    assert.doesNotMatch(r.out.reason, /regression|GUARD FAILED/i);
  }));

test("scoped: a command past its own limit blocks as SCOPED TESTS INCOMPLETE (4.3)", () =>
  withFixture({ extraChecks: ["node slow.mjs {changed}"], testTimeoutMs: 400 }, async (dir) => {
    seed(dir, "s43c", { changed: ["src/a.js"] });
    const r = await runStop(dir, "s43c");
    assert.equal(r.out.decision, "block");
    assert.match(r.out.reason, /SCOPED TESTS INCOMPLETE: node slow\.mjs \{changed\}/);
    assert.match(r.out.reason, /testTimeoutMs/);
  }));

test("scoped: a task killed by totalBudgetMs is announced once per session, across two Stops (4.3)", () =>
  withFixture({ extraChecks: ["node slow.mjs {changed}"], totalBudgetMs: 400, testTimeoutMs: 60000 }, async (dir) => {
    seed(dir, "s43d", { changed: ["src/a.js"] });
    const first = await runStop(dir, "s43d");
    assert.notEqual(first.out.decision, "block", "a budget kill is not a failure");
    assert.match(msg(first), /craftsman: stop-gate scoped tests .*node slow\.mjs \{changed\}/);
    assert.match(msg(first), /time budget/);
    assert.match(msg(first), /advisory only/);
    assert.equal(first.events.filter((e) => e.ev === "stop-budget-exceeded").length, 1);

    seed(dir, "s43d", { changed: ["src/a.js"] }); // PostToolUse marks the session dirty again after the next edit
    const second = await runStop(dir, "s43d");
    assert.notEqual(second.out.decision, "block");
    assert.equal(second.events.filter((e) => e.ev === "stop-budget-exceeded").length, 2, "the kill is still logged every Stop");
    const notices = [first, second].filter((r) => /time budget/.test(msg(r)));
    assert.equal(notices.length, 1, "exactly one notice across two Stops");
  }));

test("scoped: a command whose binary is not installed is skipped without blocking, and says so once per session (4.3)", () =>
  withFixture({ extraChecks: ["craftsman-no-such-binary {changed}"] }, async (dir) => {
    seed(dir, "s43e", { changed: ["src/a.js"] });
    const first = await runStop(dir, "s43e");
    assert.notEqual(first.out.decision, "block");
    assert.match(msg(first), /craftsman: stop-gate skipped craftsman-no-such-binary \{changed\} \(craftsman-no-such-binary was not found\), advisory only/);

    seed(dir, "s43e", { changed: ["src/a.js"] });
    const second = await runStop(dir, "s43e");
    assert.notEqual(second.out.decision, "block");
    assert.doesNotMatch(msg(second), /stop-gate skipped/, "said once");
  }));

// 4.4 - no snapshot, no green-at-start, counts as a test run ----------------------------------------------------

test("scoped: with no session-start.json the scoped command still runs, and the dirty marker clears after the pass (4.4)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s44a", { changed: ["src/a.js"] });
    assert.ok(!fs.existsSync(path.join(dir, ".craftsman", "sessions", "s44a", "session-start.json")));
    assert.ok(fs.existsSync(dirtyMarker(dir, "s44a")));
    const r = await runStop(dir, "s44a");
    assert.deepEqual(runs(dir), [["src/a.js"]]);
    assert.notEqual(r.out.decision, "block");
    assert.ok(!fs.existsSync(dirtyMarker(dir, "s44a")), "a scoped run counts as a test run for the dirty marker");
    assert.deepEqual(skipped(r.events), [], "a dirty Stop that ran a test logs no skip reason");
  }));

test("scoped: a command red at session start still runs scoped, since green-at-start is not a precondition (4.4)", () =>
  withFixture({ commands: { "package.json": "node check.mjs {changed}" } }, async (dir) => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
    seed(dir, "s44b", { changed: ["src/a.js"], start: { results: [{ cmd: "node -e 1", green: false }] } });
    const r = await runStop(dir, "s44b");
    assert.deepEqual(runs(dir), [["src/a.js"]]);
    assert.notEqual(r.out.decision, "block");
  }));

test("scoped: a placeholder command listed in session-start.json is never run from it, with or without the expansion (4.4)", () =>
  withFixture({ commands: { "package.json": "node check.mjs {changed}" } }, async (dir) => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
    seed(dir, "s44c", {
      changed: ["src/a.js"],
      start: { results: [{ cmd: "node check.mjs {changed}", green: true }, { cmd: "node check.mjs --files={changed}", green: true }] },
    });
    const r = await runStop(dir, "s44c");
    assert.deepEqual(runs(dir), [["src/a.js"]], "only the config-derived, expanded run");
    assert.notEqual(r.out.decision, "block");
  }));

test("scoped: a snapshot command and a scoped command run side by side, the snapshot one still as a regression check (4.4)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s44d", { changed: ["src/a.js"], start: { results: [{ cmd: "node fail.mjs", green: true }] } });
    const r = await runStop(dir, "s44d");
    assert.equal(r.out.decision, "block");
    assert.match(r.out.reason, /REGRESSION: tests passed at session start but fail now \(node fail\.mjs\)/);
    assert.doesNotMatch(r.out.reason, /SCOPED TESTS FAILED/);
    assert.deepEqual(runs(dir), [["src/a.js"]]);
  }));

// 1.2 - a marker that lives under a sub-directory selects the scoped command, as it does at snapshot time -----------

test("scoped: a stopGate.commands marker found only under a sub-directory runs on the change list, with no snapshot-pending skip (1.2)", () =>
  withFixture({ commands: { "package.json": "node check.mjs {changed}" } }, async (dir) => {
    fs.mkdirSync(path.join(dir, "services", "api"), { recursive: true });
    fs.writeFileSync(path.join(dir, "services", "api", "package.json"), "{}\n");
    fs.writeFileSync(path.join(dir, "services", "api", "x.js"), "x\n");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-q", "-m", "services/api"], { cwd: dir });
    assert.ok(!fs.existsSync(path.join(dir, "package.json")), "the marker is not at the root");
    seed(dir, "s12a", { changed: ["services/api/x.js"] });
    const r = await runStop(dir, "s12a");
    assert.deepEqual(runs(dir), [["services/api/x.js"]], "the check received the edited file");
    assert.deepEqual(skipped(r.events), [], "a dirty Stop that ran a test logs no skip reason, snapshot-pending least of all");
    assert.notEqual(r.out.decision, "block");
  }));

test("scoped: a sub-directory marker with a glob is found the same way (1.2)", () =>
  withFixture({ commands: { "*.csproj": "node check.mjs {changedDirs}" } }, async (dir) => {
    fs.mkdirSync(path.join(dir, "src", "App"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "App", "App.csproj"), "<Project/>\n");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-q", "-m", "csproj"], { cwd: dir });
    seed(dir, "s12b", { changed: ["src/App/Program.cs"] });
    const r = await runStop(dir, "s12b");
    assert.deepEqual(runs(dir), [["src/App"]]);
    assert.deepEqual(skipped(r.events), []);
  }));

test("scoped: a sub-directory marker that exists nowhere still selects nothing, and says nothing (1.2)", () =>
  withFixture({ commands: { "package.json": "node check.mjs {changed}" } }, async (dir) => {
    fs.mkdirSync(path.join(dir, "services", "api"), { recursive: true });
    fs.writeFileSync(path.join(dir, "services", "api", "other.json"), "{}\n");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-q", "-m", "services/api"], { cwd: dir });
    seed(dir, "s12c", { changed: ["services/api/x.js"] });
    const r = await runStop(dir, "s12c");
    assert.deepEqual(runs(dir), []);
    assert.doesNotMatch(msg(r), /stop-gate skipped/);
  }));

// 1.3 - a path that no longer exists is dropped before the list is expanded --------------------------------------

test("scoped: a change list whose only file is gone runs nothing, logs no-changes and does not block, twice in a row (1.3)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s13a", { changed: ["gone.js"], gone: ["gone.js"] });
    assert.ok(!fs.existsSync(path.join(dir, "gone.js")));
    const first = await runStop(dir, "s13a");
    assert.deepEqual(runs(dir), [], "nothing ran, in particular not with a path that is not there");
    assert.deepEqual(skipped(first.events).map((e) => e.reason), ["no-changes"]);
    assert.notEqual(first.out.decision, "block");
    assert.ok(fs.existsSync(dirtyMarker(dir, "s13a")), "nothing was tested, so the session stays dirty");

    const second = await runStop(dir, "s13a");
    assert.deepEqual(runs(dir), []);
    assert.deepEqual(skipped(second.events).map((e) => e.reason), ["no-changes", "no-changes"], "logged on each Stop");
    assert.notEqual(second.out.decision, "block");
  }));

test("scoped: a change list of a gone file and a kept file passes only the kept one (1.3)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s13b", { changed: ["gone.js", "kept.js"], gone: ["gone.js"] });
    const r = await runStop(dir, "s13b");
    assert.deepEqual(runs(dir), [["kept.js"]]);
    assert.deepEqual(skipped(r.events), []);
    assert.notEqual(r.out.decision, "block");
  }));

test("scoped: {changedDirs} is built from the files that are left, not from the gone ones (1.3)", () =>
  withFixture({ extraChecks: ["node check.mjs {changedDirs}"] }, async (dir) => {
    seed(dir, "s13c", { changed: ["old/gone.js", "src/kept.js"], gone: ["old/gone.js"] });
    await runStop(dir, "s13c");
    assert.deepEqual(runs(dir), [["src"]]);
  }));

test("scoped: a file that was deleted after it was edited does not fail the check with a path that is not there (1.3)", () =>
  withFixture({ extraChecks: ["node fail.mjs {changed}"] }, async (dir) => {
    seed(dir, "s13d", { changed: ["gone.js"], gone: ["gone.js"] });
    const r = await runStop(dir, "s13d");
    assert.notEqual(r.out.decision, "block", "the failing check never ran against a deleted file");
    assert.doesNotMatch(r.out.reason || "", /SCOPED TESTS FAILED/);
  }));

test("scoped: an unknown change list stays unknown after the existence filter; it is not turned into an empty one (1.3)", () =>
  withFixture({ extraChecks: ["node check.mjs {changed}"] }, async (dir) => {
    seed(dir, "s13e");
    const r = await runStop(dir, "s13e");
    assert.deepEqual(skipped(r.events).map((e) => e.reason), ["changes-unknown"]);
  }));
