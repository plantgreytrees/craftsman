import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  acceptanceNotice, archivePath, archivePlan, compactLedger, currentState, generatedBlock, ledgerPath, reconcileAcceptance, renderBlock,
  syncTrackerDoc, trackerDocPath, trackerRoot, transition,
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
  fs.writeFileSync(acPath, "- [ ] [unit:unit-1] the endpoint rejects bad input\n- [ ] [unit:unit-2] not this unit\n- [ ] whole-plan criterion\n");
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
  fs.writeFileSync(acPath, "- [x] [unit:unit-1] a\n- [x] [unit:unit-1] b\n- [ ] whole-plan check\n");
  startUnit(selected, "unit-1");
  const merged = transition({ plan: "docs/plans/example.md", unit: "unit-1", status: "MERGED", evidence: "abc123", session_id: "s1" }, selected);
  assert.equal(merged.acceptance.plan_wide_open, true);
  assert.equal(status(selected, "unit-1"), "MERGED", "an open whole-plan criterion means the request is not verified yet");

  fs.writeFileSync(acPath, fs.readFileSync(acPath, "utf8").replace("- [ ] whole-plan", "- [x] whole-plan"));
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
