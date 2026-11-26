import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gitRootedTmp } from "./lib/fixture-root.mjs";
import { archivedPlans, droppedKeys } from "./lib/ledger-keys.mjs";
import { STATE_DIR } from "./lib/core.mjs";

// ARCH-TRACKER-19: `tracker.mjs purge` removes a plan's rows with no archive
// heading, and only for an owner: never autonomous, never while /auto runs.
// Every case runs in a child whose CLAUDE_PROJECT_DIR is the fixture root, so
// session markers resolve inside the fixture (ARCH-STATE-01).
const DIR = import.meta.dirname;
const GONE = "docs/plans/gone.md";
const KEEP = "docs/plans/keep.md";
const SEED = [[GONE, "a"], [GONE, "b"], [KEEP, "c"]];
const SID = "purge-session";
const fixtures = [];
const realSessions = path.join(STATE_DIR, "sessions");
const snapshot = () => { try { return fs.readdirSync(realSessions, { recursive: true }).sort(); } catch { return null; } };
const sessionsBefore = snapshot();

afterEach(() => { for (const f of fixtures.splice(0)) fs.rmSync(f, { recursive: true, force: true }); });

const CORE = JSON.stringify(path.join(DIR, "lib/core.mjs"));
const TRACKER = JSON.stringify(path.join(DIR, "tracker.mjs"));
const SEEDER = `
import { projectContext } from ${CORE};
import { transition } from ${TRACKER};
const context = projectContext(".");
for (const [plan, unit] of JSON.parse(process.env.JOB)) transition({ plan, unit, status: "PENDING" }, context);
`;
const PURGER = `
import { projectContext, writeAutoMarker } from ${CORE};
import { purgePlan } from ${TRACKER};
const job = JSON.parse(process.env.JOB);
if (job.marker) writeAutoMarker(job.input.session_id, job.marker);
try { console.log(JSON.stringify({ ok: purgePlan(job.input, projectContext(".")) })); }
catch (error) { console.log(JSON.stringify({ error: error.message })); }
`;

function child(root, code, job) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root, JOB: JSON.stringify(job) };
  delete env.CLAUDE_CODE_SESSION_ID;
  const done = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: root, env, encoding: "utf8" });
  assert.equal(done.status, 0, done.stderr);
  return done.stdout;
}

// A git-rooted fixture whose ledger holds SEED; `setup` may add files before the purge.
function seeded(setup) {
  const root = gitRootedTmp("craftsman-purge-");
  fixtures.push(root);
  child(root, SEEDER, SEED);
  setup?.(root);
  return root;
}
const purge = (root, input, marker = null) => JSON.parse(child(root, PURGER, { input, marker }).trim().split("\n").pop());
const ledgerText = (root) => { try { return fs.readFileSync(path.join(root, ".craftsman", "tracker", "events.jsonl"), "utf8"); } catch { return ""; } };
const input = (extra = {}) => ({ plan: GONE, reason: "owner cleanup", session_id: SID, ...extra });

function assertRefused(root, result, pattern) {
  assert.match(result.error ?? "", pattern, JSON.stringify(result));
}
function refusalLeavesLedger(root, run) {
  const before = ledgerText(root);
  run();
  assert.equal(ledgerText(root), before, "a refusal leaves the ledger byte-identical");
}

test("purge refuses a missing reason", () => {
  const root = seeded();
  refusalLeavesLedger(root, () => {
    for (const reason of [undefined, "", "   "]) assertRefused(root, purge(root, input({ reason })), /reason/);
  });
});

test("purge refuses autonomous: true (no marker exists, so only this refusal can fire)", () => {
  const root = seeded();
  assert.equal(fs.existsSync(path.join(root, ".craftsman", "sessions")), false);
  refusalLeavesLedger(root, () => assertRefused(root, purge(root, input({ autonomous: true })), /autonomous/));
});

test("purge refuses while /auto is active for the caller's session", () => {
  const root = seeded();
  refusalLeavesLedger(root, () => assertRefused(root, purge(root, input(), GONE), /craftsman:auto run is active/));
  assert.ok(fs.existsSync(path.join(root, ".craftsman", "sessions", SID, "auto-active")), "the marker landed in the fixture");
});

test("purge refuses a plan whose docs/plans/<slug>.md exists", () => {
  const root = seeded((r) => {
    fs.mkdirSync(path.join(r, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(r, GONE), "# gone\n");
  });
  refusalLeavesLedger(root, () => assertRefused(root, purge(root, input()), /plan doc/));
});

test("purge refuses a plan with a TRACKER-archive.md heading", () => {
  const root = seeded((r) => {
    fs.mkdirSync(path.join(r, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(r, "docs", "plans", "TRACKER-archive.md"), "# Tracker archive\n\n## docs/plans/gone.md (2026-01-01)\n");
  });
  refusalLeavesLedger(root, () => assertRefused(root, purge(root, input()), /TRACKER-archive\.md/));
});

test("purge refuses a plan with no rows", () => {
  const root = seeded();
  refusalLeavesLedger(root, () => assertRefused(root, purge(root, input({ plan: "docs/plans/never-existed.md" })), /no tracker rows/));
});

test("purge removes only that plan's events, writes no archive heading and logs tracker_purged", () => {
  const archive = "# Tracker archive\n\n## docs/plans/older.md (2026-01-01)\n";
  const root = seeded((r) => {
    fs.mkdirSync(path.join(r, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(r, "docs", "plans", "TRACKER-archive.md"), archive);
  });
  const keepEvents = ledgerText(root).split("\n").filter((l) => l.includes("keep.md"));
  assert.equal(keepEvents.length, 1);
  const result = purge(root, input());
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(ledgerText(root), keepEvents.join("\n") + "\n", "only the other plan's events remain");
  assert.equal(fs.readFileSync(path.join(root, "docs", "plans", "TRACKER-archive.md"), "utf8"), archive, "no archive heading written");
  const events = fs.readFileSync(path.join(root, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const purged = events.filter((e) => e.ev === "tracker_purged");
  assert.equal(purged.length, 1);
  assert.equal(purged[0].plan, GONE);
  assert.equal(purged[0].units, 2);
  assert.equal(purged[0].reason, "owner cleanup");
});

test("purge is dispatched by the CLI action", () => {
  const root = seeded();
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
  delete env.CLAUDE_CODE_SESSION_ID;
  const cli = (body) => spawnSync(process.execPath, [path.join(DIR, "tracker.mjs")], { cwd: root, env, input: JSON.stringify(body), encoding: "utf8" });
  const ok = cli({ action: "purge", project: ".", ...input() });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ledgerText(root).includes("gone.md"), false);
  assert.match(cli({ action: "nope", project: "." }).stderr, /purge/);
});

test("a purge excuses only its plan's committed keys; a purge without plan excuses nothing", () => {
  const root = gitRootedTmp("craftsman-purge-keys-");
  fixtures.push(root);
  const stateDir = path.join(root, ".craftsman");
  fs.mkdirSync(stateDir, { recursive: true });
  const log = (...evs) => fs.writeFileSync(path.join(stateDir, "events.jsonl"), evs.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const committed = [GONE, KEEP].map((plan) => JSON.stringify({ plan, unit: "a" })).join("\n") + "\n";
  const context = { stateDir };
  log({ ev: "tracker_purged", plan: GONE, units: 1, reason: "r" });
  assert.deepEqual([...archivedPlans(context).plans], ["gone"]);
  assert.equal(archivedPlans(context).all, false);
  assert.deepEqual(droppedKeys([], "", committed, context), ["keep|a"]);
  log({ ev: "tracker_purged", units: 1, reason: "r" });
  assert.equal(archivedPlans(context).all, false, "unlike an archive, a plan-less purge does not excuse everything");
  assert.equal(archivedPlans(context).plans.size, 0);
  assert.deepEqual(droppedKeys([], "", committed, context).sort(), ["gone|a", "keep|a"]);
  log({ ev: "tracker_purged", plan: GONE, units: 1, reason: "r" }, { ev: "tracker_published" });
  assert.equal(archivedPlans(context).plans.size, 0, "a purge before the last publish is already published");
});

test("the real repo's .craftsman/sessions is unchanged", () => {
  assert.deepEqual(snapshot(), sessionsBefore);
});
