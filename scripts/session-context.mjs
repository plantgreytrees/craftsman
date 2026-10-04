#!/usr/bin/env node
// SessionStart: inject stack/toolchain context + learned project rules, and kick
// off a BACKGROUND, PER-SESSION test-state snapshot (snapshot.mjs) so session
// OPEN is never blocked by a build. Fully stack-agnostic — detects languages and
// tools from repo markers; everything else is config-driven.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  loadConfig, enabled, topRules, PLUGIN_ROOT, PROJECT_ROOT, STATE_DIR,
  sidOf, sessionDir, compactRequiredFile, pruneSessions, logEvent, git, sha1, readStdin, markerPresent, have, projectContext,
} from "./lib/core.mjs";
import { recallMemory, pruneAllMemory } from "./plan-memory.mjs";
import { compactLedger, trackerDocPath } from "./tracker.mjs";
import { listWorktrees, sweep } from "./worktree-sweep.mjs";

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { /* no stdin */ }
const sid = sidOf(input);
const context = projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);

// SessionStart fires on startup, resume, /clear, AND /compact — the only
// observable proxy this plugin has for "a compact/clear actually happened."
// compact-gate.mjs's block only ever needs to survive until one of those
// fires, so clearing here unconditionally is exactly the mechanical
// counterpart requireCompact()'s marker-write needs (see lib/core.mjs).
try { fs.unlinkSync(compactRequiredFile(sid, context)); } catch {}

const markers = {
  "package.json": "JavaScript/TypeScript", "deno.json": "Deno",
  "pyproject.toml": "Python", "requirements.txt": "Python", "setup.py": "Python",
  "go.mod": "Go", "Cargo.toml": "Rust",
  "pom.xml": "Java", "build.gradle": "Java/Kotlin", "build.gradle.kts": "Kotlin",
  "Gemfile": "Ruby", "composer.json": "PHP",
  "*.sln": "C#/.NET", "*.csproj": "C#/.NET",
  "CMakeLists.txt": "C/C++", "Makefile": "C/C++/Make",
  "mix.exs": "Elixir", "pubspec.yaml": "Dart/Flutter",
  "Dockerfile": "Docker", "docker-compose.yml": "Docker",
};
const markerHits = await Promise.all(Object.entries(markers).map(async ([f, l]) => [l, await markerPresent(f, context)]));
const langs = [...new Set(markerHits.filter(([, hit]) => hit).map(([l]) => l))];

// Tool detection, CACHED weekly (probing binaries spawns a subprocess each) —
// scoped to the detected stack so an unrelated repo isn't probed for 20+
// tools it will never use, and so the "not installed" line only ever names
// tools that would actually matter here.
const TOOLS_BY_LANG = {
  "JavaScript/TypeScript": ["eslint", "prettier", "tsc", "vitest", "jest"],
  Deno: ["eslint", "prettier"],
  Python: ["ruff", "mypy", "black", "pytest"],
  Go: ["go", "gofmt", "staticcheck", "golangci-lint"],
  Rust: ["cargo", "clippy-driver", "rustfmt"],
  Ruby: ["rubocop"],
  PHP: ["phpstan", "php-cs-fixer"],
  "C#/.NET": ["dotnet"],
  "C/C++": ["clang-format"],
};
const wanted = [...new Set([
  ...langs.flatMap((l) => TOOLS_BY_LANG[l] || []),
  "gitleaks", // security scanning applies regardless of detected stack
  "shellcheck", // shell scripts aren't tracked by the marker table above
])];
const CACHE = path.join(context.stateDir, "tooling.json");
let present;
try {
  const c = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  if (Array.isArray(c.present) && Date.now() - c.ts < 7 * 24 * 3600 * 1000
      && Array.isArray(c.wanted) && c.wanted.length === wanted.length && c.wanted.every((w, i) => w === wanted[i])) {
    present = c.present;
  }
} catch { /* stale, missing, or scoped to a different tool set */ }
if (!present) {
  present = [];
  for (const b of wanted) {
    if (await have(b)) present.push(b);
  }
  try { fs.mkdirSync(context.stateDir, { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify({ ts: Date.now(), wanted, present })); } catch {}
}
const missing = wanted.filter((b) => !present.includes(b));

// Housekeeping: drop stale per-session state (best-effort).
pruneSessions();

// Plan-memory garbage collection — rate-limited to once/day (cheap fs work,
// but no reason to re-scan every session start). Physically drops
// superseded/expired records and deletes whole ledgers for plans untouched
// for cfg.planMemory.maxAgeMs (default 45 days) — the manual `compact` action
// alone never does either (see plan-memory.mjs's pruneAllMemory comment).
if (cfg.planMemory?.enabled !== false) {
  const pruneMarker = path.join(context.stateDir, "memory-prune-last.json");
  let lastPrune = 0;
  try { lastPrune = JSON.parse(fs.readFileSync(pruneMarker, "utf8")).ts || 0; } catch {}
  if (Date.now() - lastPrune > 24 * 3600 * 1000) {
    try {
      pruneAllMemory({ maxAgeMs: cfg.planMemory?.maxAgeMs, context });
      fs.mkdirSync(context.stateDir, { recursive: true });
      fs.writeFileSync(pruneMarker, JSON.stringify({ ts: Date.now() }));
    } catch { /* best-effort */ }
  }
}

// Tracker-ledger compaction — same once/day rate limit. The ledger is
// append-only and replayed in full on every claim/transition/status call for
// the entire project lifetime; collapsing to one (latest) event per key keeps
// every future read/write from getting slower forever with no state actually
// lost (see tracker.mjs's compactLedger comment for why this is safe).
{
  const compactMarker = path.join(context.stateDir, "tracker-compact-last.json");
  let lastCompact = 0;
  try { lastCompact = JSON.parse(fs.readFileSync(compactMarker, "utf8")).ts || 0; } catch {}
  if (Date.now() - lastCompact > 24 * 3600 * 1000) {
    try {
      compactLedger(context);
      fs.mkdirSync(context.stateDir, { recursive: true });
      fs.writeFileSync(compactMarker, JSON.stringify({ ts: Date.now() }));
    } catch { /* best-effort */ }
  }
}

let handoff = null;
try {
  handoff = JSON.parse(fs.readFileSync(path.join(sessionDir(sid, context), "handoff.json"), "utf8"));
} catch { /* no hand-off yet, or it was partially written */ }
if (handoff) {
  fs.mkdirSync(sessionDir(sid, context), { recursive: true });
  fs.writeFileSync(path.join(sessionDir(sid, context), "scope-required"), "resume requires fresh scope activation\n");
}

let handoffStale = false;
if (handoff?.repository_commit) {
  const currentCommit = (await git(["rev-parse", "HEAD"], context)).trim();
  handoffStale = Boolean(currentCommit && currentCommit !== handoff.repository_commit);
  if (handoffStale) logEvent({ ev: "handoff_stale", handoff_id: handoff.handoff_id || null, plan: handoff.plan, recorded_commit: handoff.repository_commit, current_commit: currentCommit }, context);
}

let restoredMemory = [];
if (handoff?.plan) {
  try {
    const memory = recallMemory({
      project: input.project || ".", plan: handoff.plan, unit: handoff.unit,
      query: handoff.next_action, max_items: 6, max_chars: 3000, summary_only: true,
    });
    restoredMemory = memory.records;
    logEvent({ ev: "handoff_memory_restored", plan: handoff.plan, unit: handoff.unit || null, count: restoredMemory.length }, context);
  } catch (error) {
    logEvent({ ev: "handoff_memory_restore_failed", plan: handoff.plan, error: error.message }, context);
  }
}

// Kick the test-green snapshot into the BACKGROUND for THIS session (detached).
fs.mkdirSync(sessionDir(sid, context), { recursive: true });
let anyStopCommandMarker = false;
for (const m of Object.keys(cfg.stopGate?.commands || {})) {
  if (await markerPresent(m, context)) { anyStopCommandMarker = true; break; }
}
if (cfg.stopGate?.enabled !== false && cfg.stopGate?.snapshotAtStart !== false && anyStopCommandMarker) {
  try { fs.unlinkSync(path.join(sessionDir(sid, context), "session-start.json")); } catch {}
  const startingTree = sha1(`${(await git(["rev-parse", "HEAD"], context)).trim()}\n${await git(["status", "--porcelain", "--untracked-files=all"], context)}`);
  try {
    spawn(process.execPath, [path.join(PLUGIN_ROOT, "scripts", "snapshot.mjs"), sid, context.id, startingTree],
      { detached: true, stdio: "ignore", windowsHide: true, cwd: context.root, env: process.env }).unref();
  } catch { /* snapshot is best-effort */ }
}

const branch = (await git(["branch", "--show-current"], context)).trim();
const rules = topRules(cfg, context);

// Verbose (full prose, one line per rule) is opt-in via sessionContext.verbose
// — useful the first few sessions on a new project. The compact default is
// deliberately terse: this text repeats on EVERY session start regardless of
// whether the session ever touches a craftsman command, so its steady-state
// cost is a tax on every session, not just craftsman ones — every rule here
// has its full, nuanced explanation in _shared-machinery.md/_shared-analysis.md,
// read in full at the actual moment a command needs it, so this line only
// needs to be a pointer (discoverability + a front-of-mind nudge), not the
// explanation itself.
const verbose = cfg.sessionContext?.verbose === true;
const standingRules = verbose
  ? [
      `LOOP: work the doc-first loop — IDEA → ARCHITECT → PLAN → ORCHESTRATE → SCRUTINISE → SYNC-DOCS (/instruction packs it into one /goal; existing code enters at /understand or /investigate → PLAN). Nothing changes code without a plan doc (docs/plans/) describing it first; one slug names the work throughout; the loop obeys docs/architecture/*.rules.md.`,
      `SCOPE: that requirement narrows for a genuinely small change — one file, no shared-contract/exported-type change, no migration, no security-sensitive surface (/plan calls this "trivial" and skips its own decomposition ceremony for it) — edit directly; the deterministic gates below still apply regardless.`,
      `PLANNING: plan every non-trivial change in the idioms of the TARGET LANGUAGE from the outset — error model, data modeling, abstraction mechanism and concurrency model are language decisions, not neutral ones. Do not design in pseudocode and translate.`,
      `ABSTRACTION BUDGET: an interface/base class/layer needs a second concrete implementor or a stated extension requirement. Otherwise omit it.`,
      `ENFORCEMENT: files you write are auto-formatted, linted and type-checked. Only NEW issues you introduce are reported — never fix pre-existing findings in unrelated code unless asked.`,
    ]
  : [
      `LOOP: non-trivial change → /plan → /orchestrate → /scrutinise → /sync-docs. One-file, no-contract, no-security change → edit directly (gates below still apply). New idea → /idea → /architect → /instruction.`,
    ];

const rootOnly = (cfg.execution?.agentMode || "root-only") !== "subagents";

// Cap unbounded unit-name lists before they go into the standing hand-off
// line — a plan with dozens of units would otherwise grow this line (paid
// on every session start for the life of the run) linearly with unit count.
function summarizeUnits(units) {
  if (!Array.isArray(units) || units.length === 0) return "none";
  if (units.length <= 5) return units.join(", ");
  return `${units.length} total (last 5: ${units.slice(-5).join(", ")})`;
}

// Nudge toward archiving once the tracker has grown enough that re-reading
// it in full (orchestrate's Resume rule does this every loop iteration) is
// a real, permanent, ever-growing tax — only /sync-docs --tracker archives
// shipped rows, and that's prose-only, same gap /compact had before the
// PostToolUse nudge. Cheap: one line-count, already-read-for-branch context.
const trackerPath = trackerDocPath(context); // the main checkout's copy, even from a worktree
const trackerNudgeLines = cfg.tracker?.nudgeLines ?? 300;
let trackerLineCount = 0;
try { trackerLineCount = fs.readFileSync(trackerPath, "utf8").split("\n").length; } catch {}
const trackerBloated = trackerNudgeLines > 0 && trackerLineCount > trackerNudgeLines;

// Lingering worktrees. Merged leftovers from earlier sessions — and Claude
// Code's own .claude/worktrees/ once their session has ended — are removed
// here, mechanically, whenever worktree-sweep.mjs proves them safe: merged,
// clean, not held by a live session. Relying on the model to run the sweep
// meant they lingered whenever it forgot. Anything that failed removal is
// still reported.
let swept = [];
let lingering = [];
try {
  const result = sweep(context.root, { all_merged: true });
  swept = result.removed;
  lingering = listWorktrees(context.root).filter((entry) => entry.removable);
} catch {}

// Deliberately terse below (see comment above standingRules): every rule's
// full explanation lives in the shared docs, read in full at the moment a
// command actually needs it. This block's only job is to be cheap enough
// that a session that never touches a craftsman command barely notices it,
// while still keeping AGENT MODE's directive force — the one line that
// actually prevents token-costly subagent fan-out, so it stays explicit
// rather than compressed into vagueness.
const parts = [
  `craftsman active — ${langs.join(", ") || "unknown stack"}${branch ? ` (${branch})` : ""}.`,
  rootOnly
    ? `AGENT MODE: root-only — never use Task/Agent for implementer/specialist/reviewer work; do every "delegate"/"dispatch"/"fan out" step yourself, sequentially, one at a time, never in parallel. Only exceptions: /plan's plan-strategist, and the one isolated agent each of /scrutinise, /idea and /architect --deep.`
    : "",
  ...standingRules,
  (cfg.security?.enabled || cfg.stopGate?.requireAcceptanceCriteria)
    ? `Stop gate: ${[cfg.security?.enabled && "secrets scan", cfg.stopGate?.requireAcceptanceCriteria && "unticked acceptance criteria"].filter(Boolean).join(" + ")} block completion.`
    : "",
  handoff ? `HAND-OFF RESTORED (${handoff.written_at || "unknown time"}${handoffStale ? "; repo advanced — recheck tracker" : ""}): plan ${handoff.plan}; unit ${handoff.unit || "phase"}; completed ${summarizeUnits(handoff.completed_units)}; remaining ${summarizeUnits(handoff.remaining_units)}; next: ${handoff.next_action}` : "",
  swept.length ? `WORKTREES SWEPT (merged, clean): ${summarizeUnits(swept.map((e) => path.relative(context.root, e.path)))}.` : "",
  lingering.length ? `LINGERING WORKTREES: ${summarizeUnits(lingering.map((e) => path.relative(context.root, e.path)))} — merged, clean, unowned. Remove: printf '%s' '{"action":"sweep","all_merged":true}' | node "${path.join(PLUGIN_ROOT, "scripts", "worktree-sweep.mjs")}"` : "",
  trackerBloated ? `TRACKER.md is ${trackerLineCount} lines — run /sync-docs --tracker to archive shipped rows (never automatic; every /orchestrate iteration re-reads it in full).` : "",
  restoredMemory.length ? `PLAN MEMORY (verify cited files):\n` + restoredMemory.map((entry, i) => `  ${i + 1}. [${entry.category}/${entry.status}] ${entry.summary}`).join("\n") : "",
  rules.length
    ? `RECURRING MISTAKES (avoid):\n` + rules.map((r, i) => `  ${i + 1}. [${r.lang}/${r.tool}] ${r.sample}`).join("\n")
    : "",
  missing.length ? `Tooling not installed (checks skip silently): ${missing.join(", ")}.` : "",
].filter(Boolean);

logEvent({ ev: "session_start", sid, langs, tools: present.length, rules: rules.length });
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: parts.join("\n") },
}));
