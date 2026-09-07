#!/usr/bin/env node
// Deterministic backstop for `_shared-execution.md` step 5's mandatory
// specialist gates. Before this script, "does this diff need ui-ux-reviewer /
// migration-reviewer / api-reviewer / dependency-auditor / performance-reviewer
// / observability-reviewer" was pure prose the orchestrating model had to
// remember and apply correctly, unit after unit, with nothing to catch a
// missed one. This gives the same answer from the diff every time.
//
// Usage: node gate-select.mjs <git-range>
// Prints one gate name per line (a subset of ui, migration, api, dependency,
// performance, observability), or nothing if none apply. Exit 0 always —
// this is advisory routing, not a pass/fail check, so a git failure fails
// safe to "no gates" (never silently claims a gate that couldn't be checked
// is required, but never blocks a unit on its own error either — the prose
// rules in _shared-execution.md remain the floor, this is a widening net).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const range = process.argv[2];

if (!range || range.startsWith("-")) {
  process.stderr.write(`[craftsman] gate-select: expected a git range argument, got ${JSON.stringify(range)}\n`);
  process.exit(0);
}

const MANIFEST_BASENAMES = new Set([
  "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "requirements.txt", "poetry.lock", "pipfile.lock", "pipfile",
  "go.mod", "go.sum", "cargo.toml", "cargo.lock",
  "gemfile", "gemfile.lock", "composer.json", "composer.lock", "pom.xml",
]);
const UI_EXT = new Set([".tsx", ".jsx", ".vue", ".svelte", ".html", ".css", ".scss", ".less"]);
const API_EXT = new Set([".proto", ".graphql", ".gql"]);

const MIGRATION_PATH_RE = /(^|\/)migrations?\//i;
const API_PATH_RE = /(^|\/)(routes?|controllers?|graphql|api)(\/|$)/i;
const DDL_RE = /\b(CREATE|ALTER|DROP)\s+TABLE\b|\bADD\s+COLUMN\b|\bDROP\s+COLUMN\b/i;
const ROUTE_REGISTRATION_RE = /\b(app|router)\.(get|post|put|delete|patch)\(|@(Get|Post|Put|Delete|Patch|RestController|Controller)\(|\brpc\s+\w+\s*\(/;
const LOOP_RE = /\b(for\s*\(|while\s*\(|\.forEach\(|\.map\()/;
const CALL_RE = /\bawait\s|\.query\(|\bfetch\(|axios\.|\.exec\(|\bSELECT\s|\.findOne\(|\.findAll\(|\.find\(/i;
const OUTBOUND_RE = /\bfetch\(|axios\.|http\.request|grpc|new\s+Worker\(|setInterval\(|cron\.schedule\(|queue\.(add|process)\(/i;
const CATCH_RE = /\bcatch\s*\(/;

function extname(file) { return path.extname(file).toLowerCase(); }
function basename(file) { return path.basename(file).toLowerCase(); }

// Only the diff's ADDED lines feed the content heuristics (performance,
// observability, DDL, route registration) — removed/context lines would
// otherwise trigger a gate for code that's leaving, not arriving.
function addedLines(diffText) {
  return diffText.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join("\n");
}

async function main() {
  let files = [];
  let diffText = "";
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", range]);
    files = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch (e) {
    process.stderr.write(`[craftsman] gate-select: git diff --name-only failed: ${e.message}\n`);
    return;
  }
  if (!files.length) return;
  try {
    const { stdout } = await execFileAsync("git", ["diff", range], { maxBuffer: 16e6 });
    diffText = stdout;
  } catch (e) {
    process.stderr.write(`[craftsman] gate-select: git diff failed: ${e.message}\n`);
  }
  const added = addedLines(diffText);

  const gates = new Set();
  for (const file of files) {
    if (UI_EXT.has(extname(file))) gates.add("ui");
    if (MIGRATION_PATH_RE.test(file) || extname(file) === ".sql") gates.add("migration");
    if (API_PATH_RE.test(file) || API_EXT.has(extname(file)) || /^openapi[.\-]/i.test(basename(file))) gates.add("api");
    if (MANIFEST_BASENAMES.has(basename(file)) || /\.csproj$/i.test(file)) gates.add("dependency");
  }
  if (DDL_RE.test(added)) gates.add("migration");
  if (ROUTE_REGISTRATION_RE.test(added)) gates.add("api");
  if (LOOP_RE.test(added) && CALL_RE.test(added)) gates.add("performance");
  if (CATCH_RE.test(added) || OUTBOUND_RE.test(added)) gates.add("observability");

  for (const gate of gates) console.log(gate);
}

await main();
