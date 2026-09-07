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
  sidOf, sessionDir, pruneSessions, logEvent, git, readStdin, markerPresent, have, projectContext,
} from "./lib/core.mjs";
import { recallMemory } from "./plan-memory.mjs";

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { /* no stdin */ }
const sid = sidOf(input);
const context = projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);

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
  try {
    spawn(process.execPath, [path.join(PLUGIN_ROOT, "scripts", "snapshot.mjs"), sid, context.id],
      { detached: true, stdio: "ignore", windowsHide: true, cwd: context.root, env: process.env }).unref();
  } catch { /* snapshot is best-effort */ }
}

const branch = (await git(["branch", "--show-current"], context)).trim();
const rules = topRules(cfg, context);

// Verbose (full prose, one line per rule) is opt-in via sessionContext.verbose
// — useful the first few sessions on a new project. The compact default
// carries the same rules in one line: this text repeats on EVERY session
// start, so its steady-state cost matters far more than its one-time clarity.
const verbose = cfg.sessionContext?.verbose === true;
const standingRules = verbose
  ? [
      `LOOP: work the doc-first loop — UNDERSTAND → PLAN → EXECUTE → SCRUTINISE → SYNC-DOCS. Nothing changes code without a plan doc (docs/plans/) describing it first.`,
      `SCOPE: that requirement narrows for a genuinely small change — one file, no shared-contract/exported-type change, no migration, no security-sensitive surface (/plan calls this "trivial" and skips its own decomposition ceremony for it) — edit directly; the deterministic gates below still apply regardless.`,
      `PLANNING: plan every non-trivial change in the idioms of the TARGET LANGUAGE from the outset — error model, data modeling, abstraction mechanism and concurrency model are language decisions, not neutral ones. Do not design in pseudocode and translate.`,
      `ABSTRACTION BUDGET: an interface/base class/layer needs a second concrete implementor or a stated extension requirement. Otherwise omit it.`,
      `ENFORCEMENT: files you write are auto-formatted, linted and type-checked. Only NEW issues you introduce are reported — never fix pre-existing findings in unrelated code unless asked.`,
    ]
  : [
      `LOOP: UNDERSTAND → PLAN → EXECUTE → SCRUTINISE → SYNC-DOCS (skip planning ceremony only for a genuinely trivial one-file, no-contract, no-security change). Plan in the target language's own idioms. Abstractions need a second implementor. Written files are auto-formatted/linted/type-checked (new issues only).`,
    ];

const parts = [
  `craftsman active. Stack: ${langs.join(", ") || "unknown"}.${branch ? ` Branch: ${branch}.` : ""}`,
  `Available quality tooling: ${present.join(", ") || "none"}.`,
  ...standingRules,
  cfg.security?.enabled ? `Secrets scanning runs before your turn ends.` : "",
  cfg.stopGate?.requireAcceptanceCriteria ? `A plan's acceptance criteria (.craftsman/acceptance.md) are hard-gated at Stop — tick each only when the code genuinely satisfies it.` : "",
  handoff ? `HAND-OFF RESTORED (${handoff.written_at || "unknown time"}${handoffStale ? "; repository advanced — recheck tracker and plan" : ""}): plan ${handoff.plan}; unit ${handoff.unit || "phase"}; completed ${handoff.completed_units?.join(", ") || "none"}; remaining ${handoff.remaining_units?.join(", ") || "none"}; next action: ${handoff.next_action}` : "",
  restoredMemory.length ? `PLAN MEMORY (hints; verify cited files):\n` + restoredMemory.map((entry, i) => `  ${i + 1}. [${entry.category}/${entry.status}/${entry.confidence}] ${entry.summary}`).join("\n") : "",
  rules.length
    ? `RECURRING MISTAKES IN THIS PROJECT (from prior sessions — avoid these):\n` +
      rules.map((r, i) => `  ${i + 1}. [${r.lang}/${r.tool}] ${r.sample}`).join("\n")
    : "",
  missing.length ? `Not installed (checks silently skipped): ${missing.join(", ")}.` : "",
].filter(Boolean);

logEvent({ ev: "session_start", sid, langs, tools: present.length, rules: rules.length });
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: parts.join("\n") },
}));
