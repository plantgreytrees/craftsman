import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  acceptanceNotice, archivePath, archivePlan, compactLedger, currentState, formatArchiveHeading, lookupArchive, parseArchiveHeading, generatedBlock, ledgerPath, reconcileAcceptance, renderBlock,
  initLedger, syncTrackerDoc, trackerDocPath, trackerRoot, transition,
} from "./tracker.mjs";

const fixtures = new Set();
function context() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-tracker-"));
  fixtures.add(root);
  return { id: ".", root, stateDir: path.join(root, ".craftsman") };
}

afterEach(() => {
  for (const fixture of fixtures) fs.rmSync(fixture, { recursive: true, force: true });
  fixtures.clear();
});

test("tracker: records identity and replays the current row state", () => {
  const selected = context();
  transition({ plan: "docs/plans/example.md", unit: "unit-1", goal: "Ship the example", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  const [row] = currentState(selected);
  assert.equal(row.status, "IN_PROGRESS");
  assert.equal(row.goal, "Ship the example");
  assert.equal(row.plan, "docs/plans/example.md");
});

test("tracker: rejects illegal transitions and terminal states without evidence", () => {
  const selected = context();
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "COMPLETE" }, selected), /illegal tracker transition/);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED" }, selected), /requires evidence/);
});

test("tracker: terminal evidence is retained as the latest concise proof", () => {
  const selected = context();
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123; tests pass" }, selected);
  assert.equal(currentState(selected)[0].evidence, "abc123; tests pass");
});

// The unit's own "am I done?" checkpoint: MERGED names what is still open.
test("tracker: MERGED is refused while the unit's own tagged acceptance criteria are unticked", () => {
  const selected = context();
  const acPath = path.join(selected.stateDir, "acceptance.md");
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(acPath, "- [ ] [unit:unit-1] the endpoint rejects bad input\n- [ ] [unit:unit-2] not this unit\n- [ ] [plan:example] whole-plan criterion\n");
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.throws(
    () => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123" }, selected),
    (error) => /MERGED refused/.test(error.message) && /rejects bad input/.test(error.message) && !/not this unit/.test(error.message),
  );
  fs.writeFileSync(acPath, fs.readFileSync(acPath, "utf8").replace("- [ ] [unit:unit-1]", "- [x] [unit:unit-1]"));
  assert.equal(transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123" }, selected).status, "MERGED");
});

test("tracker: criteria tagged with the unit's scope_id also gate MERGED; PARKED never does", () => {
  const selected = context();
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), "- [ ] [unit:S1] scoped criterion\n");
  transition({ plan: "docs/plans/example.md", unit: "unit-1", scope_id: "S1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc" }, selected), /scoped criterion/);
  assert.equal(transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PARKED", evidence: "gate failed twice" }, selected).status, "PARKED");
});

// Stated limit (ARCH-SAFETY-05, safety.md): CRAFTSMAN=off is the user's switch for the quality side, so the quality gates honour it in a
// script's own environment, where any command can set it for one script. They are not a security boundary; this pins today's behaviour.
test("tracker: the MERGED acceptance gate honours CRAFTSMAN=off in its own environment (a stated limit of the quality side)", () => {
  const selected = context();
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), "- [ ] [unit:unit-1] still open\n");
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc" }, selected), /MERGED refused/);
  const was = process.env.CRAFTSMAN;
  try {
    process.env.CRAFTSMAN = "off";
    assert.equal(transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc" }, selected).status, "MERGED");
  } finally { if (was === undefined) delete process.env.CRAFTSMAN; else process.env.CRAFTSMAN = was; }
});

function status(selected, unit) {
  return currentState(selected).find((row) => row.unit === unit)?.status;
}
function startUnit(selected, unit, extra = {}) {
  transition({ plan: "docs/plans/example.md", unit, status: "PENDING", ...extra }, selected);
  transition({ plan: "docs/plans/example.md", unit, status: "IN_PROGRESS", evidence: "claimed" }, selected);
}

// The trigger: all criteria met → the tracker moves, without anyone asking.
test("tracker: reconcile moves a MERGED unit to COMPLETE once its criteria and the plan-wide ones are all ticked", () => {
  const selected = context();
  const acPath = path.join(selected.stateDir, "acceptance.md");
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(acPath, "- [x] [unit:unit-1] a\n- [x] [unit:unit-1] b\n- [ ] [plan:example] whole-plan check\n");
  startUnit(selected, "unit-1");
  const merged = transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123", session_id: "s1" }, selected);
  assert.equal(merged.acceptance.plan_wide_open, true);
  assert.equal(status(selected, "unit-1"), "MERGED", "an open whole-plan criterion means the request is not verified yet");

  fs.writeFileSync(acPath, fs.readFileSync(acPath, "utf8").replace("- [ ] [plan:example] whole-plan", "- [x] [plan:example] whole-plan"));
  fs.rmSync(path.join(selected.stateDir, "sessions"), { recursive: true, force: true });
  const result = reconcileAcceptance(selected, { session_id: "s1" });
  assert.deepEqual(result.completed, [{ plan: "docs/plans/example.md", unit: "unit-1" }]);
  const row = currentState(selected).find((r) => r.unit === "unit-1");
  assert.equal(row.status, "COMPLETE");
  assert.match(row.evidence, /all 2 acceptance criteria ticked; abc123/);
  assert.match(acceptanceNotice(result), /MERGED → COMPLETE[\s\S]*TRACKER\.md/);
  assert.deepEqual(reconcileAcceptance(selected, {}).completed, [], "idempotent — COMPLETE is not re-completed");
});

test("tracker: ticking every criterion before the merge completes the unit the moment it lands on MERGED", () => {
  const selected = context();
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), "- [x] [unit:S9] scoped by scope_id\n");
  startUnit(selected, "unit-9", { scope_id: "S9" });
  const merged = transition({ plan: "docs/plans/example.md", unit: "unit-9", status: "MERGED", evidence: "def456" }, selected);
  assert.deepEqual(merged.acceptance.completed.map((c) => c.unit), ["unit-9"]);
  assert.equal(status(selected, "unit-9"), "COMPLETE");
});

test("tracker: an IN_PROGRESS unit with every criterion ticked is reported ready to merge, not transitioned", () => {
  const selected = context();
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), "- [x] [unit:unit-2] done\n- [ ] [unit:unit-3] open\n");
  startUnit(selected, "unit-2");
  startUnit(selected, "unit-3");
  const result = reconcileAcceptance(selected, {});
  assert.deepEqual(result.ready, [{ plan: "docs/plans/example.md", unit: "unit-2" }]);
  assert.equal(status(selected, "unit-2"), "IN_PROGRESS");
  assert.match(acceptanceNotice(result), /unit-2[\s\S]*merge it now/);
  assert.doesNotMatch(acceptanceNotice(result), /unit-3/);
});

const trackerDoc = (selected) => fs.readFileSync(path.join(selected.root, "docs", "plans", "TRACKER.md"), "utf8");

test("tracker: every transition re-renders TRACKER.md's generated block and keeps the hand-written rest", () => {
  const selected = context();
  fs.mkdirSync(path.join(selected.root, "docs", "plans"), { recursive: true });
  fs.writeFileSync(path.join(selected.root, "docs", "plans", "TRACKER.md"), "# Execution tracker\n\nHand-written notes.\n");
  transition({ plan: "docs/plans/example.md", unit: "unit-1", scope_id: "S1", module: "api", status: "PENDING" }, selected);
  let doc = trackerDoc(selected);
  assert.match(doc, /^# Execution tracker\n\nHand-written notes\.\n\n## Live ledger\n/);
  assert.match(doc, /\| \[example\]\(\.\/example\.md\) \| unit-1 \(S1\) \| api \| PENDING \| — \| \d{4}-\d{2}-\d{2} \|/);

  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "claimed | by me" }, selected);
  doc = trackerDoc(selected);
  assert.match(doc, /\| IN_PROGRESS \| claimed \\\| by me \|/);
  assert.doesNotMatch(doc, /PENDING/);
  assert.equal(doc.match(/craftsman:ledger:begin/g).length, 1, "the block is replaced, never appended twice");
  assert.equal(generatedBlock(doc), renderBlock(currentState(selected)));
});

test("tracker: sync restores a hand-tampered block and is a no-op when it already matches", () => {
  const selected = context();
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  const file = path.join(selected.root, "docs", "plans", "TRACKER.md");
  const rendered = trackerDoc(selected);
  assert.equal(syncTrackerDoc(selected).changed, false);
  fs.writeFileSync(file, rendered.replace("| PENDING |", "| COMPLETE |"));
  assert.equal(syncTrackerDoc(selected).changed, true);
  assert.equal(trackerDoc(selected), rendered);
});

test("tracker: sync refuses a render that drops 50 committed rows for 5 local ones (ARCH-TRACKER-13)", () => {
  const selected = context();
  const plans = path.join(selected.root, "docs", "plans");
  fs.mkdirSync(plans, { recursive: true });
  const committed = Array.from({ length: 50 }, (_, i) => JSON.stringify({ plan: "docs/plans/example.md", unit: `m${i}` }));
  fs.writeFileSync(path.join(plans, "TRACKER.jsonl"), committed.join("\n") + "\n");
  fs.writeFileSync(path.join(plans, "TRACKER.md"), "# Execution tracker\n\nNotes.\n");
  for (let i = 0; i < 5; i++) transition({ plan: "docs/plans/example.md", unit: `m${i}`, status: "PENDING" }, selected);
  const result = syncTrackerDoc(selected);
  assert.equal(result.changed, false);
  assert.match(result.refused, /45/);
  assert.equal(trackerDoc(selected), "# Execution tracker\n\nNotes.\n");
  const log = fs.readFileSync(path.join(selected.stateDir, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(log.filter((e) => e.ev === "tracker_publish_refused").at(-1).dropped.length, 45);
});

test("tracker: a repo with no ledger rows never grows a generated section", () => {
  const selected = context();
  assert.equal(syncTrackerDoc(selected).changed, false);
  assert.equal(fs.existsSync(path.join(selected.root, "docs", "plans", "TRACKER.md")), false);
});

test("tracker: a linked worktree writes the ledger and TRACKER.md in the main checkout, not the worktree", () => {
  const main = context().root;
  const git = (...args) => execFileSync("git", ["-C", main, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { stdio: "ignore" });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "init");
  const worktree = path.join(main, ".claude", "worktrees", "wt");
  git("worktree", "add", "-q", "-b", "wt", worktree);
  const selected = { id: ".", root: worktree, stateDir: path.join(worktree, ".craftsman") };

  assert.equal(trackerRoot(selected), fs.realpathSync(main));
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PENDING" }, selected);
  assert.equal(ledgerPath(selected), path.join(fs.realpathSync(main), ".craftsman", "tracker", "events.jsonl"));
  assert.equal(trackerDocPath(selected), path.join(fs.realpathSync(main), "docs", "plans", "TRACKER.md"));
  assert.ok(fs.existsSync(ledgerPath(selected)));
  assert.match(fs.readFileSync(trackerDocPath(selected), "utf8"), /\| unit-1 \| — \| PENDING \|/);
  assert.equal(fs.existsSync(path.join(worktree, ".craftsman", "tracker")), false);
  assert.equal(fs.existsSync(path.join(worktree, "docs", "plans", "TRACKER.md")), false);
  // The main checkout sees the same row the worktree wrote.
  assert.equal(currentState({ id: ".", root: main, stateDir: path.join(main, ".craftsman") })[0].status, "PENDING");
});

// ARCH-TRACKER-03/04, ARCH-ENGINE-07: an autonomous park carries the question
// Phase C asks; an autonomous run never cancels.
const DECISION = { question: "Which store?", options: ["sqlite", "postgres"], recommended: "sqlite" };
function parkable(selected, unit = "unit-1") {
  transition({ plan: "docs/plans/example.md", unit, status: "PENDING" }, selected);
  transition({ plan: "docs/plans/example.md", unit, status: "IN_PROGRESS", evidence: "claimed" }, selected);
}

test("tracker: an autonomous PARKED without a valid decision is refused; with one it persists in the ledger", () => {
  const selected = context();
  parkable(selected);
  const park = (extra) => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PARKED", evidence: "open decision", autonomous: true, ...extra }, selected);
  assert.throws(() => park({}), /PARKED refused: an autonomous park needs decision/);
  for (const bad of [
    "sqlite?", { options: ["a", "b"] }, { question: "q", options: ["only one"] },
    { question: "q", options: ["a", ""] }, { question: "q", options: ["a", "b"], recommended: 3 },
  ]) assert.throws(() => park({ decision: bad }), /decision/, JSON.stringify(bad));
  assert.equal(status(selected, "unit-1"), "IN_PROGRESS", "refused parks write nothing");

  const event = park({ decision: { ...DECISION, question: "  Which store?  " } });
  assert.deepEqual(event.decision, DECISION, "validated and trimmed");
  assert.equal(event.autonomous, true);
  const [row] = currentState(selected);
  assert.equal(row.status, "PARKED");
  assert.deepEqual(row.decision, DECISION);
  const lines = fs.readFileSync(ledgerPath(selected), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(lines.at(-1).decision, DECISION, "the decision is in the ledger itself");

  // Unparked, the row no longer carries the stale question.
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "IN_PROGRESS", evidence: "answered: sqlite" }, selected);
  assert.equal(currentState(selected)[0].decision, null);
});

test("tracker: a decision is only for PARKED, and a manual park still needs none", () => {
  const selected = context();
  parkable(selected);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "BLOCKED", evidence: "x", decision: DECISION }, selected), /only recorded on PARKED/);
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "BLOCKED", evidence: "x", autonomous: "yes" }, selected), /autonomous must be a boolean/);
  const event = transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PARKED", evidence: "user asked to pause" }, selected);
  assert.equal(event.decision, null);
  assert.equal(event.autonomous, false);
});

test("tracker: an autonomous CANCELLED is refused; a manual one is not", () => {
  const selected = context();
  parkable(selected, "unit-1");
  parkable(selected, "unit-2");
  assert.throws(() => transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "CANCELLED", evidence: "dropped", autonomous: true }, selected), /CANCELLED refused/);
  assert.equal(status(selected, "unit-1"), "IN_PROGRESS");
  assert.equal(transition({ plan: "docs/plans/example.md", unit: "unit-2", status: "CANCELLED", evidence: "user dropped it" }, selected).status, "CANCELLED");
});

test("tracker: events gain decision/autonomous without losing a field, and renderBlock output is unchanged", () => {
  const selected = context();
  parkable(selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "PARKED", evidence: "open decision", autonomous: true, decision: DECISION }, selected);
  const last = JSON.parse(fs.readFileSync(ledgerPath(selected), "utf8").trim().split("\n").at(-1));
  for (const field of ["key", "project", "plan", "unit", "scope_id", "goal", "module", "status", "evidence", "session_id", "updated_at", "decision", "autonomous", "criteria"]) {
    assert.ok(field in last, `event keeps ${field}`);
  }
  const rows = [
    { key: ".::docs/plans/example.md::unit-1", project: ".", plan: "docs/plans/example.md", unit: "unit-1", scope_id: "S1", module: "core", status: "PARKED", evidence: "open decision", updated_at: "2026-10-09T10:00:00.000Z", decision: DECISION, autonomous: true },
    { key: ".::docs/plans/example.md::unit-2", project: ".", plan: "docs/plans/example.md", unit: "unit-2", scope_id: null, module: null, status: "PENDING", evidence: null, updated_at: "2026-10-09T11:00:00.000Z", decision: null, autonomous: false },
  ];
  // Snapshot of the view as it rendered before these fields existed.
  assert.equal(renderBlock(rows), [
    "<!-- craftsman:ledger:begin -->",
    "<!-- Generated from the tracker ledger (.craftsman/tracker/events.jsonl) after every transition. Do not edit by hand: change a row with scripts/tracker.mjs. -->",
    "",
    "| plan | unit | module | status | evidence | updated |",
    "|---|---|---|---|---|---|",
    "| [example](./example.md) | unit-1 (S1) | core | PARKED | open decision | 2026-10-09 |",
    "| [example](./example.md) | unit-2 | — | PENDING | — | 2026-10-09 |",
    "",
    "<!-- craftsman:ledger:end -->",
  ].join("\n"));
  const { decision, autonomous, ...legacy } = rows[0];
  assert.equal(renderBlock([legacy, rows[1]]), renderBlock(rows), "the new fields never reach the TRACKER.md view");
});

test("tracker: a unit's tagged criteria are kept in the ledger, carried to COMPLETE, and outlive the acceptance file and compaction", () => {
  const selected = context();
  const acPath = path.join(selected.stateDir, "acceptance.md");
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(acPath, "- [x] [unit:unit-1] first\n- [x] [unit:unit-1] second\n- [x] [unit:unit-2] other unit\n");
  startUnit(selected, "unit-1");
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123" }, selected);
  fs.rmSync(acPath); // the worktree copy dies with the worktree
  compactLedger(selected);
  const row = currentState(selected).find((r) => r.unit === "unit-1");
  assert.equal(row.status, "COMPLETE");
  assert.deepEqual(row.criteria, ["- [x] [unit:unit-1] first", "- [x] [unit:unit-1] second"]);
});

test("tracker: archive refuses a plan with an open row, then retires a finished plan to TRACKER-archive.md with its criteria", () => {
  const selected = context();
  const acPath = path.join(selected.stateDir, "acceptance.md");
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(acPath, "- [x] [unit:unit-1] shipped criterion\n");
  startUnit(selected, "unit-1");
  transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123" }, selected);
  transition({ plan: "docs/plans/example.md", unit: "unit-2", status: "PENDING" }, selected);
  transition({ plan: "docs/plans/other.md", unit: "keep-me", status: "PENDING" }, selected);
  assert.throws(() => archivePlan({ plan: "docs/plans/example.md" }, selected), /unit-2=PENDING not COMPLETE or CANCELLED/);
  assert.throws(() => archivePlan({ plan: "docs/plans/none.md" }, selected), /no tracker rows/);
  transition({ plan: "docs/plans/example.md", unit: "unit-2", status: "CANCELLED", evidence: "dropped" }, selected);

  const result = archivePlan({ plan: "docs/plans/example.md" }, selected);
  assert.deepEqual(result.archived.sort(), ["unit-1", "unit-2"]);
  assert.deepEqual(currentState(selected).map((r) => r.unit), ["keep-me"], "only the archived plan leaves the ledger");
  const view = fs.readFileSync(trackerDocPath(selected), "utf8");
  assert.doesNotMatch(view, /\[example\]/);
  assert.match(view, /\[other\]\(\.\/other\.md\) \| keep-me/);
  const archive = fs.readFileSync(archivePath(selected), "utf8");
  assert.match(archive, /## docs\/plans\/example\.md/);
  assert.match(archive, /\*\*example#unit-1\*\* COMPLETE — all 1 acceptance criteria ticked; abc123\n {2}- \[x\] \[unit:unit-1\] shipped criterion/);
  assert.match(archive, /\*\*example#unit-2\*\* CANCELLED — dropped/);
});

test("tracker: FEATURE_MERGED needs ticked criteria, is never auto-promoted, carries feature fields (ARCH-TRACKER-06/07)", () => {
  const selected = context();
  const acPath = path.join(selected.stateDir, "acceptance.md");
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(acPath, "- [ ] [unit:u1] thing\n");
  const plan = "docs/plans/example.md";
  transition({ plan, unit: "u1", status: "PENDING", feature: "F1", feature_branch: "feat/f1" }, selected);
  transition({ plan, unit: "u1", status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.throws(() => transition({ plan, unit: "u1", status: "FEATURE_MERGED", evidence: "abc" }, selected), /FEATURE_MERGED refused/);
  fs.writeFileSync(acPath, "- [x] [unit:u1] thing\n");
  assert.throws(() => transition({ plan, unit: "u1", status: "FEATURE_MERGED" }, selected), /requires evidence/);
  transition({ plan, unit: "u1", status: "FEATURE_MERGED", evidence: "abc" }, selected);
  reconcileAcceptance(selected, {});
  const [row] = currentState(selected);
  assert.equal(row.status, "FEATURE_MERGED");
  assert.equal(row.feature, "F1");
  assert.equal(row.feature_branch, "feat/f1");
  assert.equal(transition({ plan, unit: "u1", status: "COMPLETE", evidence: "landing sha" }, selected).status, "COMPLETE");
});

// ARCH-TRACKER-10: rollups follow descendant transitions; the root block is untouched.
test("tracker: a descendant transition re-renders the rollups and leaves the root block unchanged", async () => {
  const { syncRollups } = await import("./tracker.mjs");
  const selected = context();
  fs.mkdirSync(path.join(selected.root, "docs", "plans"), { recursive: true });
  fs.writeFileSync(path.join(selected.root, "docs", "plans", "e.md"), "---\nslug: e\nlevel: epic\nchildren: [f]\n---\n");
  fs.writeFileSync(path.join(selected.root, "docs", "plans", "f.md"), "---\nslug: f\nparent: e\nunits:\n  - id: u\n---\n");
  const base = { plan: "docs/plans/f.md", unit: "u", goal: "g" };
  transition({ ...base, status: "PENDING" }, selected);
  const rollup = path.join(selected.root, "docs", "plans", "e", "TRACKER.md");
  assert.match(fs.readFileSync(rollup, "utf8"), /Status: PENDING/);
  const rootBefore = generatedBlock(fs.readFileSync(trackerDocPath(selected), "utf8"));
  assert.equal(rootBefore, renderBlock(currentState(selected)));
  transition({ ...base, status: "IN_PROGRESS", evidence: "claimed" }, selected);
  assert.match(fs.readFileSync(rollup, "utf8"), /Status: IN_PROGRESS/);
  assert.equal(generatedBlock(fs.readFileSync(trackerDocPath(selected), "utf8")), renderBlock(currentState(selected)));
  fs.writeFileSync(rollup, "stale");
  assert.equal(syncRollups(selected).changed, true);
  assert.match(fs.readFileSync(rollup, "utf8"), /Status: IN_PROGRESS/);
});

// ARCH-LAND-06 / ARCH-TRACKER-06: a land-feature park of a FEATURE_MERGED row.
function featureMerged(selected, units = ["u1"]) {
  const plan = "docs/plans/example.md";
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), units.map((u) => `- [x] [unit:${u}] thing\n`).join(""));
  for (const unit of units) {
    transition({ plan, unit, status: "PENDING", feature: "F1", feature_branch: "feat/f1" }, selected);
    transition({ plan, unit, status: "IN_PROGRESS", evidence: "claimed" }, selected);
    transition({ plan, unit, status: "FEATURE_MERGED", evidence: "abc" }, selected);
  }
  return plan;
}

test("tracker: FEATURE_MERGED parks only with a decision and re-enters from PARKED (ARCH-LAND-06)", () => {
  const selected = context();
  const plan = featureMerged(selected);
  assert.throws(() => transition({ plan, unit: "u1", status: "PARKED", evidence: "conflict", autonomous: true }, selected), /PARKED refused: an autonomous park needs decision/);
  assert.equal(currentState(selected)[0].status, "FEATURE_MERGED");
  const parked = transition({ plan, unit: "u1", status: "PARKED", evidence: "land-feature conflict", autonomous: true, decision: DECISION }, selected);
  assert.equal(parked.status, "PARKED");
  const [row] = currentState(selected);
  assert.deepEqual(row.decision, DECISION);
  assert.equal(row.feature, "F1");
  assert.equal(transition({ plan, unit: "u1", status: "FEATURE_MERGED", evidence: "abc" }, selected).status, "FEATURE_MERGED");
});

test("tracker: other FEATURE_MERGED transitions are unchanged", () => {
  const selected = context();
  const plan = featureMerged(selected, ["u1", "u2", "u3"]);
  for (const to of ["PENDING", "IN_PROGRESS", "MERGED", "CANCELLED"]) {
    assert.throws(() => transition({ plan, unit: "u1", status: to, evidence: "x" }, selected), /./, to);
  }
  assert.equal(transition({ plan, unit: "u2", status: "BLOCKED", evidence: "x" }, selected).status, "BLOCKED");
  assert.equal(transition({ plan, unit: "u3", status: "COMPLETE", evidence: "sha" }, selected).status, "COMPLETE");
});

test("tracker: archive heading round-trips a goal holding both separators and keeps the legacy form", () => {
  const f = { plan: "docs/plans/x.md", date: "2026-10-18", goal: "ship a · b — c", doc: "abc1234", landed: "def5678" };
  const line = formatArchiveHeading(f);
  assert.equal(line, "## docs/plans/x.md (2026-10-18) — ship a; b; c · doc abc1234 · landed def5678");
  assert.deepEqual(parseArchiveHeading(line), { kind: "plan", plan: f.plan, date: f.date, goal: "ship a; b; c", doc: "abc1234", landed: "def5678" });
  const legacy = formatArchiveHeading({ plan: f.plan, date: f.date });
  assert.equal(legacy, "## docs/plans/x.md (2026-10-18)");
  assert.deepEqual(parseArchiveHeading(legacy), { kind: "plan", plan: f.plan, date: f.date, goal: null, doc: null, landed: null });
  assert.equal(parseArchiveHeading("- not a heading"), null);
});

test("tracker: lookup returns full, legacy and idea records and null on a miss", () => {
  const selected = context();
  const idea = { kind: "idea", slug: "fast-thing", date: "2026-10-17", verdict: "rejected", fact: "costs · too much — really", doc: "9999999" };
  const ideaLine = formatArchiveHeading(idea);
  assert.deepEqual(parseArchiveHeading(ideaLine), { ...idea, fact: "costs; too much; really" });
  fs.mkdirSync(path.dirname(archivePath(selected)), { recursive: true });
  fs.writeFileSync(archivePath(selected), [
    "# Tracker archive", "",
    "## docs/plans/old.md (2026-10-01)", "", "- row", "",
    formatArchiveHeading({ plan: "docs/plans/new.md", date: "2026-10-18", goal: "g", doc: "aaa", landed: "bbb" }), "",
    ideaLine, "",
  ].join("\n"));
  assert.equal(lookupArchive({ plan: "docs/plans/new.md" }, selected).landed, "bbb");
  assert.equal(lookupArchive({ plan: "old" }, selected).goal, null);
  assert.equal(lookupArchive({ slug: "fast-thing" }, selected).verdict, "rejected");
  assert.equal(lookupArchive({ plan: "nope" }, selected), null);
  assert.equal(lookupArchive({ slug: "fast-thing" }, context()), null);
});

test("tracker: archivePlan writes the full heading when given goal, doc and landed", () => {
  const selected = context();
  transition({ plan: "docs/plans/p.md", unit: "u", status: "COMPLETE", evidence: "abc" }, selected);
  archivePlan({ plan: "docs/plans/p.md", goal: "g · h", doc: "d1", landed: "l1" }, selected);
  assert.equal(lookupArchive({ plan: "docs/plans/p.md" }, selected).goal, "g; h");
});

test("tracker: a rows-less hierarchy parent archives with the full heading and lookup round-trips; others still refuse", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-vacuous-"));
  try {
    const stateDir = path.join(root, ".craftsman");
    const context = { id: ".", root, stateDir, grantStateDir: stateDir };
    assert.throws(() => archivePlan({ plan: "docs/plans/epic.md" }, context), /no tracker rows/);
    archivePlan({ plan: "docs/plans/epic.md", goal: "Whole epic", doc: "abc123", landed: "def456", hierarchy: true }, context);
    const found = lookupArchive({ plan: "epic" }, context);
    assert.equal(found.goal, "Whole epic");
    assert.equal(found.doc, "abc123");
    assert.equal(found.landed, "def456");
    assert.equal(lookupArchive({ plan: "docs/plans/epic.md" }, context).kind, "plan");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("tracker: init --merge adds absent keys but never resurrects an archived plan", () => {
  const selected = context();
  const docs = path.join(selected.root, "docs", "plans");
  fs.mkdirSync(docs, { recursive: true });
  const row = (plan, unit) => JSON.stringify({ key: `.::docs/plans/${plan}.md::${unit}`, project: ".", plan: `docs/plans/${plan}.md`, unit, status: "COMPLETE", evidence: "x" });
  fs.writeFileSync(path.join(docs, "TRACKER.jsonl"), [row("live", "a"), row("live", "b"), row("old", "z")].join("\n") + "\n");
  fs.writeFileSync(archivePath(selected), "# Tracker archive\n\n## old (2026-01-01)\n");
  transition({ plan: "docs/plans/live.md", unit: "a", status: "PENDING" }, selected);
  const result = initLedger({ merge: true }, selected);
  assert.equal(result.added, 1);
  const keys = fs.readFileSync(ledgerPath(selected), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key);
  assert.ok(keys.includes(".::docs/plans/live.md::b"));
  assert.ok(!keys.some((k) => k.includes("old.md")));
  assert.equal(currentState(selected).find((r) => r.unit === "a").status, "PENDING");
});

test("tracker: init --from-block rehydrates one row per block row and is idempotent", () => {
  const selected = context();
  const rows = Array.from({ length: 50 }, (_, i) => ({ plan: "docs/plans/big.md", unit: `u${i}`, module: `m${i}`, status: i % 2 ? "COMPLETE" : "PENDING", evidence: "e", updated_at: "2026-01-01T00:00:00Z" }));
  fs.mkdirSync(path.join(selected.root, "docs", "plans"), { recursive: true });
  fs.writeFileSync(trackerDocPath(selected), `# Execution tracker\n\n${renderBlock(rows)}\n`);
  assert.equal(initLedger({ from_block: true }, selected).added, 50);
  const state = currentState(selected);
  assert.equal(state.length, 50);
  assert.equal(state[3].evidence, "rehydrated from TRACKER.md block");
  assert.equal(state[3].module, "m3");
  assert.equal(state[3].status, "COMPLETE");
  assert.equal(initLedger({ from_block: true }, selected).added, 0);
  assert.equal(currentState(selected).length, 50);
});

test("tracker: archive sha is appended only when given; headings without it are unchanged", () => {
  const f = { plan: "docs/plans/p.md", date: "2026-10-18", goal: "g", doc: "aaa", landed: "bbb" };
  const base = formatArchiveHeading(f);
  assert.equal(base, "## docs/plans/p.md (2026-10-18) — g · doc aaa · landed bbb");
  const withArchive = formatArchiveHeading({ ...f, archive: "ccc" });
  assert.equal(withArchive, `${base} · archive ccc`);
  assert.deepEqual(parseArchiveHeading(withArchive), { kind: "plan", plan: f.plan, date: f.date, goal: "g", doc: "aaa", landed: "bbb", archive: "ccc" });
  assert.deepEqual(parseArchiveHeading(base), { kind: "plan", plan: f.plan, date: f.date, goal: "g", doc: "aaa", landed: "bbb" });
});

test("tracker: lookup returns archive and restoreCommand with the sha, archive null without it", () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-tracker-ws-"));
  fixtures.add(ws);
  const real = fs.realpathSync(ws);
  for (const id of ["prod", "archive"]) {
    fs.mkdirSync(path.join(real, id));
    spawnSync("git", ["init", "-q"], { cwd: path.join(real, id) });
  }
  const manifest = path.join(real, "craftsman.workspace.json");
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: { prod: { root: "prod" }, archive: { root: "archive" } } }));
  const root = path.join(real, "prod");
  const selected = { id: "prod", root, stateDir: path.join(root, ".craftsman") };
  fs.mkdirSync(path.dirname(archivePath(selected)), { recursive: true });
  fs.writeFileSync(archivePath(selected), [
    "# Tracker archive", "",
    formatArchiveHeading({ plan: "docs/plans/a.md", date: "2026-10-18", goal: "g", doc: "d1", landed: "l1", archive: "abc1234" }), "",
    formatArchiveHeading({ plan: "docs/plans/b.md", date: "2026-10-18", goal: "g", doc: "d2", landed: "l2" }), "",
  ].join("\n"));
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = manifest;
  try {
    const hit = lookupArchive({ plan: "a" }, selected);
    assert.equal(hit.archive, "abc1234");
    assert.equal(hit.restoreCommand, `git -C ${path.join(real, "archive")} show abc1234:prod/plans/a/docs/plans/a.md`);
    const miss = lookupArchive({ plan: "b" }, selected);
    assert.equal(miss.archive, null);
    assert.equal("restoreCommand" in miss, false);
  } finally {
    if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev;
  }
});

test("tracker: an option-shaped archive value yields no restore command (ARCH-TRACKER-02)", () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-tracker-ws-"));
  fixtures.add(ws);
  const real = fs.realpathSync(ws);
  for (const id of ["prod", "archive"]) {
    fs.mkdirSync(path.join(real, id));
    spawnSync("git", ["init", "-q"], { cwd: path.join(real, id) });
  }
  const manifest = path.join(real, "craftsman.workspace.json");
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: { prod: { root: "prod" }, archive: { root: "archive" } } }));
  const root = path.join(real, "prod");
  const selected = { id: "prod", root, stateDir: path.join(root, ".craftsman") };
  fs.mkdirSync(path.dirname(archivePath(selected)), { recursive: true });
  fs.writeFileSync(archivePath(selected), [
    "# Tracker archive", "",
    formatArchiveHeading({ plan: "docs/plans/a.md", date: "2026-10-18", goal: "g", doc: "d1", landed: "l1", archive: "--output=x" }), "",
    formatArchiveHeading({ plan: "docs/plans/b.md", date: "2026-10-18", goal: "g", doc: "d2", landed: "l2" }), "",
    // A closed sibling archived with the plan carries its own heading; an option-shaped value there is refused the same way.
    formatArchiveHeading({ plan: "docs/plans/scrutinise-a.md", date: "2026-10-18", goal: "g", doc: "d3", landed: "l3", archive: "--output=y" }), "",
  ].join("\n"));
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = manifest;
  try {
    const hit = lookupArchive({ plan: "a" }, selected);
    assert.equal("restoreCommand" in hit, false);
    assert.equal(fs.existsSync(path.join(real, "archive", "x")), false);
    for (const key of ["scrutinise-a", "docs/plans/scrutinise-a.md"]) {
      const sibling = lookupArchive({ plan: key }, selected);
      assert.equal(sibling.archive, "--output=y", key);
      assert.equal("restoreCommand" in sibling, false, key);
    }
    assert.equal(fs.existsSync(path.join(real, "archive", "y")), false);
  } finally {
    if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev;
  }
});

test("tracker: archivePlan writes the archive sha into TRACKER-archive.md", () => {
  const selected = context();
  transition({ plan: "docs/plans/p.md", unit: "u", status: "COMPLETE", evidence: "abc" }, selected);
  archivePlan({ plan: "docs/plans/p.md", goal: "g", doc: "d1", landed: "l1", archive: "a1" }, selected);
  assert.match(fs.readFileSync(archivePath(selected), "utf8"), /^## docs\/plans\/p\.md \(\d{4}-\d{2}-\d{2}\) — g · doc d1 · landed l1 · archive a1$/m);
  assert.equal(lookupArchive({ plan: "docs/plans/p.md" }, selected).archive, "a1");
});
