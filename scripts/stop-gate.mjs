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

// 1. Secrets — always a hard block, never baselined — but re-scan only
// when `git status --ignored` shows real changes (the PostToolUse "dirty"
// marker misses Bash-created files). `--ignored` also catches a freshly
// created `.env`; `.craftsman/` itself is excluded since it's gitignored
// state touched on every hook call. Errors fail safe to treeDirty=true.
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

// Guarantee at least one scan per session regardless of dirtiness, so an
// already-committed secret can't go permanently unscanned. The marker
// signs cfg.security.check so a config change mid-session can't be
// mistaken for "already scanned" (same principle as core.mjs's cacheKey()).
const scannedMarker = path.join(sdir, "secrets-scanned");
const checkSig = sha1(JSON.stringify(cfg.security?.check || []));
let scannedThisSession = false;
try { scannedThisSession = fs.readFileSync(scannedMarker, "utf8") === checkSig; } catch {}
const shouldScan = treeDirty || !scannedThisSession;
if (!shouldScan) logEvent({ ev: "stop-secrets-skipped", sid, reason: "clean" });

// Build one flat task list — secrets, session-start test regressions, extra
// guards — and run it as a single concurrent batch below, instead of three
// independent sequential loops competing for the same wall-clock budget.
const tasks = [];
if (cfg.security?.enabled && shouldScan) {
  for (const cmd of cfg.security.check || []) tasks.push({ kind: "secret", cmd, timeoutMs: 60000 });
}

// 2. Tests — only if they were green when THIS session began, AND this
//    session touched a real source file since then (PostToolUse's "dirty"
//    marker). No edits since start means nothing new to regress, so skip
//    re-running a multi-minute suite on every question-answering turn.
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

// Shared wall-clock budget across the batch; since tasks dispatch
// concurrently, `cap` is effectively each task's own full timeoutMs unless
// several are genuinely slow. Unlike "test"/"extra" (silent skip on a
// budget kill, see `isDirty` above), any kill of a "secret" task — before
// or during the run — is an incomplete scan that "always a hard block,
// never baselined" forbids treating as clean, so it blocks instead.
const budgetDeadline = Date.now() + (cfg.stopGate?.totalBudgetMs ?? 280000);

let allSecretsCompleted = true; // batch-wide: marker only written if every "secret" task actually finished

async function runTask(t) {
  const cap = Math.min(t.timeoutMs, budgetDeadline - Date.now());
  if (cap <= 0) {
    if (t.kind === "secret") {
      allSecretsCompleted = false;
      problems.push(
        `SECRETS SCAN INCOMPLETE: ${t.cmd} — the Stop-gate time budget was already exhausted ` +
        `before the scan could even start. Increase stopGate.totalBudgetMs or reduce other ` +
        `configured checks, then retry.`
      );
      return;
    }
    logEvent({ ev: "stop-budget-exceeded", sid, cmd: t.cmd });
    return;
  }
  const [bin, ...args] = splitCmd(t.cmd);
  try {
    await pexec(bin, args, { timeout: cap, maxBuffer: 8e6, cwd: PROJECT_ROOT });
    // this task completed; allSecretsCompleted only flips false elsewhere —
    // the actual marker write happens once, after the whole batch resolves
  } catch (e) {
    if (t.kind !== "test" && e.code === "ENOENT") {
      if (t.kind === "secret") allSecretsCompleted = false; // never ran — don't count as checked
      return;
    }
    if (t.kind === "secret" && e.killed) {
      // A killed secrets scan (budget or its own timeoutMs) never finished,
      // so we don't know if it would have found something; "hard block,
      // never baselined" forbids treating that unknown as clean, unlike
      // "test"/"extra" which have a safe-skip precedent (see `isDirty` above).
      allSecretsCompleted = false;
      problems.push(cap < t.timeoutMs
        ? `SECRETS SCAN INCOMPLETE: ${bin} was cut short by the Stop-gate time budget before ` +
          `it could finish (needed up to ${t.timeoutMs}ms, only had ${cap}ms available) — ` +
          `increase stopGate.totalBudgetMs or reduce other configured checks, then retry.`
        : `SECRETS SCAN INCOMPLETE: ${bin} did not finish within its own configured limit ` +
          `(${t.timeoutMs}ms) — the scan itself needs more time on this tree; consider a ` +
          `faster tool/narrower scope, then retry.`);
      return;
    }
    // Narrower than core.mjs's runOne() (treats ANY kill as non-finding — no
    // shared budget there to weigh against). Here `e.killed` reliably means
    // `timeout: cap` fired (maxBuffer overflow sets no `killed` flag), so
    // `cap < t.timeoutMs` alone distinguishes a budget cut-short from a
    // full run.
    if (e.killed && cap < t.timeoutMs) { // t.kind is "test" or "extra" here — unchanged
      logEvent({ ev: "stop-budget-exceeded", sid, cmd: t.cmd });
      return;
    }
    if (t.kind === "secret") {
      // Completed (not killed), exited non-zero: a real finding;
      // allSecretsCompleted stays true (this task itself finished).
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

// Mark scanned only once EVERY secret task in the batch actually ran to
// completion; a partial batch (killed/ENOENT'd/never dispatched) stays
// "not yet scanned" so a later clean-tree Stop retries it.
if (tasks.some((t) => t.kind === "secret") && allSecretsCompleted) {
  try { atomicWrite(scannedMarker, checkSig); } catch {}
}

// Only clear once there was something real to check: session-start.json's
// background snapshot may still be running (`results` stays [] until it
// lands). Clearing unconditionally would let a later Stop skip a check
// that never ran.
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
