#!/usr/bin/env node
// Stop: final gate. Blocks "done" only for regressions caused THIS session, plus
// secrets, project guards, and unticked acceptance criteria. ALL state is read
// per-session (sessions/<sid>/…), so concurrent sessions never block on each
// other's baseline, authority, or acceptance criteria.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, enabled, STATE_DIR, PROJECT_ROOT, sidOf, sessionDir, sha1, logEvent, readStdin, splitCmd, atomicWrite } from "./lib/core.mjs";

const pexec = promisify(execFile);
const cfg = loadConfig();
if (!enabled(cfg) || cfg.stopGate?.enabled === false) process.exit(0);

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
// Loop guard: we already blocked once this turn — let it end.
if (input.stop_hook_active === true) process.exit(0);

const sid = sidOf(input);
const sdir = sessionDir(sid);

// Clear THIS session's doc-write authority (never touch another session's).
try { fs.unlinkSync(path.join(sdir, "doc-write")); } catch {}

const problems = [];

// 1. Secrets — always a hard block, never baselined — but only worth
// re-scanning when the working tree actually changed since the last scan.
// `isDirty` below (the PostToolUse "dirty" marker) is a session Write/Edit/
// MultiEdit marker, not working-tree state — a Bash-created file never sets
// it, so a real `git status` read is required here instead. `--ignored` is
// required, not optional: plain `--porcelain` omits gitignored files by
// default, and a freshly-created `.env`-style file is exactly the class of
// file most likely to carry a real secret and most likely to be gitignored;
// without `--ignored` it would read the tree as "clean" and skip the one
// scan that exists to catch it. Fail-safe: any error (not a git repo, git
// absent) defaults treeDirty=true, so the scan still runs. This changes only
// the "should we scan right now" decision — a real gitleaks hit when it does
// run is still a hard, non-baselined block.
// `.craftsman/` is this plugin's own untracked, gitignored runtime-state
// directory (cache/, events.jsonl, sessions/), and events.jsonl is appended
// on every hook invocation including this one — so once a project has run
// any craftsman hook, `.craftsman/` is realistically NEVER absent or
// unchanged. Git collapses a wholly-ignored directory into a single
// `!! .craftsman/` (or similarly-prefixed) porcelain line, so left unfiltered
// this would read treeDirty=true on essentially every Stop regardless of
// whether the actual project source tree changed, defeating the clean-tree
// skip entirely. Exclude only `.craftsman` itself, not `--ignored` broadly —
// a real gitignored file elsewhere (e.g. `.env`) must still count as dirty.
function isCraftsmanStateLine(line) {
  const p = line.slice(3); // porcelain v1: "XY PATH" — strip the "XY " prefix
  return p === ".craftsman" || p.startsWith(".craftsman/");
}
let treeDirty = true;
try {
  const { stdout } = await pexec("git", ["status", "--porcelain", "--ignored"], { cwd: PROJECT_ROOT });
  const relevant = stdout.split("\n").filter((l) => l.length > 0 && !isCraftsmanStateLine(l));
  treeDirty = relevant.length > 0;
} catch { /* fail-safe: not a git repo / git absent — scan anyway */ }

// Addendum (post-merge security review): a clean-tree skip alone would let an
// already-committed secret that predates this session — never yet caught by
// any scan — go permanently unscanned once the tree happens to be clean.
// Guarantee at least one scan per session regardless of dirtiness via a
// session-scoped marker, so "secrets are always a hard block" still holds
// across a whole session, not just across dirty Stops within it.
const scannedMarker = path.join(sdir, "secrets-scanned");
const scannedThisSession = fs.existsSync(scannedMarker);
const shouldScan = treeDirty || !scannedThisSession;
if (!shouldScan) logEvent({ ev: "stop-secrets-skipped", sid, reason: "clean" });

// Build one flat task list — secrets, session-start test regressions, extra
// guards — and run it as a single concurrent batch below, instead of three
// independent sequential loops competing for the same wall-clock budget.
const tasks = [];
if (cfg.security?.enabled && shouldScan) {
  for (const cmd of cfg.security.check || []) tasks.push({ kind: "secret", cmd, timeoutMs: 60000 });
}

// 2. Tests — only if they were green when THIS session began, AND only if
//    this session actually touched a real source file since then (the
//    PostToolUse gate drops a "dirty" marker on every edit). A Stop with no
//    edits since start — or since the last Stop already re-verified — has
//    nothing new to regress; re-running a multi-minute suite on every
//    question-answering turn is pure waste.
const dirtyPath = path.join(sdir, "dirty");
const isDirty = fs.existsSync(dirtyPath);
let start = null;
try { start = JSON.parse(fs.readFileSync(path.join(sdir, "session-start.json"), "utf8")); } catch {}
let results = [];
if (Array.isArray(start?.results)) results = start.results;
else if (start?.testsGreenAtStart !== undefined && start.cmd) results = [{ cmd: start.cmd, green: start.testsGreenAtStart }];
if (isDirty) {
  for (const { cmd, green } of results) {
    if (!green) continue;
    tasks.push({ kind: "test", cmd, timeoutMs: cfg.stopGate?.testTimeoutMs ?? 250000 });
  }
} else {
  logEvent({ ev: "stop-tests-skipped", sid, reason: "clean" });
}

// 2b. Project guards / extra checks (e.g. run-all-guards.py, contract-drift).
for (const cmd of cfg.stopGate?.extraChecks || []) {
  tasks.push({ kind: "extra", cmd, timeoutMs: cfg.stopGate?.testTimeoutMs ?? 250000 });
}

// Shared wall-clock budget across every command in the batch above. Since
// every task dispatches together at (approximately) the same instant, `cap`
// (computed per-task, at dispatch time, in runTask) is effectively each
// task's own full configured `timeoutMs` in the common case — this is the
// fix for the old sequential design's flaw: secrets and tests no longer
// compete for the same clock by running one after another, they run
// alongside each other, so the shared budget only ever binds when the *sum
// of what's actually slow* is large (several genuinely slow test runners),
// not merely because a mandatory secrets scan happened to run first.
// Deliberate, disclosed exception, not a silent weakening: a budget-skipped
// "secret" task is logged only, same as "test"/"extra" — given concurrent
// dispatch this is practically unreachable except under genuine multi-
// command time pressure. That's about whether an already time-starved Stop
// attempt gets to run the scan at all, not about what happens once it runs
// and finds something — a real hit is still a hard, non-baselined block.
const budgetDeadline = Date.now() + (cfg.stopGate?.totalBudgetMs ?? 280000);

async function runTask(t) {
  const cap = Math.min(t.timeoutMs, budgetDeadline - Date.now());
  if (cap <= 0) { logEvent({ ev: "stop-budget-exceeded", sid, cmd: t.cmd }); return; }
  const [bin, ...args] = splitCmd(t.cmd);
  // Only record "a scan happened this session" once the scan is genuinely
  // about to be dispatched (cap > 0, right here) — not merely queued onto
  // `tasks`. Writing the marker any earlier would let a budget-skipped
  // attempt (cap <= 0 above) durably mark the session as scanned, silently
  // defeating 1.9's "at least one real scan per session" guarantee for every
  // subsequent clean Stop in that same session.
  if (t.kind === "secret") { try { atomicWrite(scannedMarker, String(Date.now())); } catch {} }
  try {
    await pexec(bin, args, { timeout: cap, maxBuffer: 8e6, cwd: PROJECT_ROOT });
  } catch (e) {
    if (t.kind !== "test" && e.code === "ENOENT") return; // tool absent: skip silently
    if (t.kind === "secret") {
      problems.push(`SECRETS: ${bin} flagged content in the working tree:\n${
        ((e.stdout || "") + (e.stderr || "")).split("\n").slice(0, 15).join("\n")}`);
    } else if (t.kind === "test") {
      const out = ((e.stdout || "") + (e.stderr || "")).split("\n").slice(-30).join("\n");
      problems.push(`REGRESSION: tests passed at session start but fail now (${t.cmd}):\n${out}`);
    } else {
      const out = ((e.stdout || "") + (e.stderr || "")).split("\n").slice(-20).join("\n");
      problems.push(`GUARD FAILED (${t.cmd}):\n${out}`);
    }
  }
}

await Promise.all(tasks.map(runTask));

// Only clear once there was something real to check: session-start.json is
// written by a BACKGROUND snapshot that may still be running on this first
// dirty Stop (results stays [] until it finishes). Clearing unconditionally
// would let a later Stop — once the snapshot finally lands — see isDirty
// false and skip the regression check that never actually ran. An empty
// `results` forever (no stopGate.commands marker matched at all) is exactly
// as cheap to leave dirty as to clear: there's nothing to run either way.
// Unchanged by whether any individual test task above was budget-skipped or
// failed — this is about "was there a session-start snapshot to check
// against," not about this run's outcome.
if (isDirty && results.length) { try { fs.unlinkSync(dirtyPath); } catch {} }

// 3. Acceptance criteria — enforce ONLY if THIS session owns the current
//    acceptance.md content (its recorded hash matches). A concurrent session
//    that overwrote the file owns it instead, so this session is not blocked by
//    someone else's criteria.
const acPath = path.join(STATE_DIR, "acceptance.md");
if (cfg.stopGate?.requireAcceptanceCriteria && fs.existsSync(acPath)) {
  const ac = fs.readFileSync(acPath, "utf8");
  let owns = false;
  try {
    const ref = JSON.parse(fs.readFileSync(path.join(sdir, "acceptance.ref"), "utf8"));
    owns = ref.hash === sha1(ac.trim());
  } catch {}
  if (owns) {
    const unchecked = ac.split("\n").filter((l) => /^\s*[-*]\s*\[ \]/.test(l));
    if (unchecked.length) {
      problems.push(
        `ACCEPTANCE CRITERIA not yet satisfied (from the approved plan). Verify each ` +
        `against the code you wrote; tick it in .craftsman/acceptance.md only if the ` +
        `code genuinely satisfies it, otherwise implement it:\n${unchecked.join("\n")}`
      );
    }
  }
}

if (!problems.length) { logEvent({ ev: "stop", sid, result: "pass" }); process.exit(0); }

logEvent({ ev: "stop", sid, result: "block", count: problems.length });
process.stdout.write(JSON.stringify({
  decision: "block",
  reason: `craftsman blocked completion:\n\n${problems.join("\n\n")}`,
}));
