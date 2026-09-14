#!/usr/bin/env node
// Stop: final gate. Blocks "done" only for regressions caused THIS session, plus
// secrets, project guards, and unticked acceptance criteria. ALL state is read
// per-session (sessions/<sid>/…), so concurrent sessions never block on each
// other's baseline, authority, or acceptance criteria.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, enabled, PROJECT_ROOT, projectContext, sidOf, sessionDir, sha1, logEvent, readStdin, splitCmd, atomicWrite, readWorktreeBindings, readSessionWorktrees } from "./lib/core.mjs";
import { readScope } from "./scope.mjs";
import { scanTree } from "./secrets-scan.mjs";

const pexec = promisify(execFile);
let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const active = readScope(input);
const context = active?.project_root
  ? { root: active.project_root, stateDir: path.join(active.project_root, ".craftsman"), offFlag: path.join(active.project_root, ".craftsman", "off") }
  : projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context) || cfg.stopGate?.enabled === false) process.exit(0);
// Loop guard: we already blocked once this turn — let it end.
if (input.stop_hook_active === true) process.exit(0);

const sid = sidOf(input);
const sdir = sessionDir(sid, context);

// Clear THIS session's doc-write authority (never touch another session's).
try { fs.unlinkSync(path.join(sdir, "doc-write")); } catch {}

const problems = [];

// A session cannot finish while it still owns an implementation worktree.
// This is session-local: another concurrent session's active binding is not
// a reason to block this Stop hook.
for (const binding of readWorktreeBindings(input, {
  root: context.root,
  stateDir: context.stateDir,
  worktreePath: active?.worktree_path || context.root,
})) {
  problems.push(
    `WORKTREE BINDING ACTIVE: unit ${binding.unit || "(unknown)"} still owns ` +
    `${binding.worktree_path || "an unknown worktree"} on branch ${binding.branch || "(unknown)"}. ` +
    `Release it with scripts/scope.mjs before completing or entering the locked merge.`
  );
}

// Worktree sweep (mechanical) — _shared-execution.md's Finalization block says
// "the run doesn't reach COMPLETE while any worktree survives," but nothing
// ever enforced it; a skipped `repo-exec.mjs cleanup` left a merged unit's
// worktree on disk purely on trust.
//
// Strictly session-local: the only worktrees considered are the ones THIS
// session prepared via repo-exec.mjs (its session ledger, written on prepare
// and cleared on cleanup). A worktree created by a concurrent session, an
// earlier session, or by hand is never this Stop hook's business — blocking
// on those made the gate fire on work it had no part in and no authority to
// clean up. No ledger (nothing prepared here, or a pre-ledger session) means
// nothing to sweep, so the gate stays silent.
//
// Within that set, only an already-merged branch blocks: an unmerged/parked
// worktree is a legitimate state the run itself records as BLOCKED/PARKED.
const ownedWorktrees = new Set(
  readSessionWorktrees(input, context).map((entry) => path.resolve(entry))
);
if (ownedWorktrees.size > 0) {
  try {
    const { stdout: listOut } = await pexec("git", ["worktree", "list", "--porcelain"], { cwd: context.root });
    const primary = path.resolve(context.root);
    const entries = listOut.split("\n\n").map((block) => {
      const lines = block.split("\n");
      const worktreeLine = lines.find((l) => l.startsWith("worktree "));
      const branchLine = lines.find((l) => l.startsWith("branch "));
      return {
        path: worktreeLine ? worktreeLine.slice("worktree ".length).trim() : null,
        branch: branchLine ? branchLine.slice("branch refs/heads/".length).trim() : null,
      };
    }).filter((e) => e.path && path.resolve(e.path) !== primary && ownedWorktrees.has(path.resolve(e.path)));
    for (const entry of entries) {
      if (!entry.branch) continue; // detached/bare — not this plugin's worktree shape, skip rather than guess
      let merged = false;
      try {
        await pexec("git", ["merge-base", "--is-ancestor", entry.branch, "HEAD"], { cwd: context.root });
        merged = true;
      } catch { /* not merged (or error) — fail safe, never block on an unmerged/parked worktree */ }
      if (merged) {
        problems.push(
          `WORKTREE NOT SWEPT: ${entry.path} (branch ${entry.branch}) was prepared by this session and is ` +
          `already fully merged but still exists — its cleanup step was skipped. Run: ` +
          `git worktree remove "${entry.path}" && git branch -d ${entry.branch} && git worktree prune.`
        );
      }
    }
  } catch { /* not a git repo, git absent, or worktree list failed — fail safe, never block on this */ }
}

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
  const { stdout } = await pexec("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: context.root });
  const relevant = stdout.split("\n").filter((l) => l.length > 0 && !isCraftsmanStateLine(l));
  if (cfg.security?.enabled) {
    const { stdout: ignoredSecrets } = await pexec(
      "git", ["status", "--porcelain", "--ignored", "--", ".env", ".env.*"], { cwd: context.root }
    );
    relevant.push(...ignoredSecrets.split("\n").filter((l) => l.length > 0 && !isCraftsmanStateLine(l)));
  }
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
    await pexec(bin, args, { timeout: cap, maxBuffer: 8e6, cwd: context.root });
    // this task completed; allSecretsCompleted only flips false elsewhere —
    // the actual marker write happens once, after the whole batch resolves
  } catch (e) {
    if (t.kind !== "test" && e.code === "ENOENT") {
      if (t.kind === "secret") {
        // No external scanner on PATH — fall back to the built-in scan rather
        // than just blocking, so a bare machine can still finish work. Opt
        // out with security.builtinFallback: false if this is unwanted.
        if (cfg.security?.builtinFallback === false) {
          allSecretsCompleted = false;
          problems.push(
            `SECRETS SCAN UNAVAILABLE: ${bin} was not found. Install the configured scanner ` +
            `or remove this security check explicitly before completing.`
          );
          return;
        }
        const findings = scanTree(context.root);
        if (findings.length) {
          allSecretsCompleted = false;
          problems.push(
            `SECRETS (built-in fallback — ${bin} not found): flagged content in the working tree:\n` +
            findings.slice(0, 15).map((f) => `${f.file}:${f.line}: ${f.rule} — ${f.redacted}`).join("\n")
          );
        }
        // A clean fallback is complete; findings remain incomplete until resolved.
      }
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
    // `timeout: cap` fired (maxBuffer overflow sets no `killed` flag).
    if (e.killed) {
      if (cap < t.timeoutMs) {
        logEvent({ ev: "stop-budget-exceeded", sid, cmd: t.cmd });
        return;
      }
      const label = t.kind === "test" ? "TESTS" : "GUARD";
      problems.push(
        `${label} INCOMPLETE: ${t.cmd} did not finish within its own configured limit ` +
        `(${t.timeoutMs}ms) — increase stopGate.testTimeoutMs or make the command faster, then retry.`
      );
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
const acPath = path.join(context.stateDir, "acceptance.md");
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
