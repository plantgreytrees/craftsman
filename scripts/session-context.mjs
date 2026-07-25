#!/usr/bin/env node
// SessionStart: inject stack/toolchain context + learned project rules, and kick
// off a BACKGROUND, PER-SESSION test-state snapshot (snapshot.mjs) so session
// OPEN is never blocked by a build. Fully stack-agnostic — detects languages and
// tools from repo markers; everything else is config-driven.
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, enabled, topRules, PLUGIN_ROOT, STATE_DIR, sidOf, sessionDir, pruneSessions, logEvent, git, readStdin } from "./lib/core.mjs";

const pexec = promisify(execFile);
const cfg = loadConfig();
if (!enabled(cfg)) process.exit(0);

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { /* no stdin */ }
const sid = sidOf(input);

// literal-or-glob marker presence (some ecosystems have no single canonical root file)
function markerPresent(marker) {
  if (marker.includes("*")) {
    try {
      const re = new RegExp("^" + marker.replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$");
      return fs.readdirSync(process.cwd()).some((f) => re.test(f));
    } catch { return false; }
  }
  return fs.existsSync(marker);
}

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
const langs = [...new Set(Object.entries(markers)
  .filter(([f]) => markerPresent(f)).map(([, l]) => l))];

// Tool detection, CACHED weekly (probing binaries spawns a subprocess each).
const wanted = ["ruff", "mypy", "black", "eslint", "prettier", "tsc", "pytest", "vitest", "jest",
                "go", "gofmt", "staticcheck", "golangci-lint", "cargo", "clippy-driver", "rustfmt",
                "rubocop", "phpstan", "php-cs-fixer", "dotnet", "gitleaks", "shellcheck", "clang-format"];
const CACHE = path.join(STATE_DIR, "tooling.json");
let present;
try {
  const c = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  if (Array.isArray(c.present) && Date.now() - c.ts < 7 * 24 * 3600 * 1000) present = c.present;
} catch { /* stale or missing */ }
if (!present) {
  present = [];
  for (const b of wanted) { try { await pexec("which", [b]); present.push(b); } catch {} }
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify({ ts: Date.now(), present })); } catch {}
}
const missing = wanted.filter((b) => !present.includes(b));

// Housekeeping: drop stale per-session state (best-effort).
pruneSessions();

// Kick the test-green snapshot into the BACKGROUND for THIS session (detached).
fs.mkdirSync(sessionDir(sid), { recursive: true });
if (cfg.stopGate?.enabled !== false && cfg.stopGate?.snapshotAtStart !== false
    && Object.keys(cfg.stopGate?.commands || {}).some(markerPresent)) {
  try { fs.unlinkSync(path.join(sessionDir(sid), "session-start.json")); } catch {}
  try {
    spawn(process.execPath, [path.join(PLUGIN_ROOT, "scripts", "snapshot.mjs"), sid],
      { detached: true, stdio: "ignore", windowsHide: true, cwd: process.cwd(), env: process.env }).unref();
  } catch { /* snapshot is best-effort */ }
}

const branch = (await git(["branch", "--show-current"])).trim();
const rules = topRules(cfg);

const parts = [
  `craftsman active. Stack: ${langs.join(", ") || "unknown"}.${branch ? ` Branch: ${branch}.` : ""}`,
  `Available quality tooling: ${present.join(", ") || "none"}.`,
  `LOOP: work the doc-first loop — UNDERSTAND → PLAN → EXECUTE → SCRUTINISE → SYNC-DOCS. Nothing changes code without a plan doc (docs/plans/) describing it first.`,
  `PLANNING: plan every non-trivial change in the idioms of the TARGET LANGUAGE from the outset — error model, data modeling, abstraction mechanism and concurrency model are language decisions, not neutral ones. Do not design in pseudocode and translate.`,
  `ABSTRACTION BUDGET: an interface/base class/layer needs a second concrete implementor or a stated extension requirement. Otherwise omit it.`,
  `ENFORCEMENT: files you write are auto-formatted, linted and type-checked. Only NEW issues you introduce are reported — never fix pre-existing findings in unrelated code unless asked.`,
  cfg.security?.enabled ? `Secrets scanning runs before your turn ends.` : "",
  cfg.stopGate?.requireAcceptanceCriteria ? `A plan's acceptance criteria (.craftsman/acceptance.md) are hard-gated at Stop — tick each only when the code genuinely satisfies it.` : "",
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
