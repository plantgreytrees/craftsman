#!/usr/bin/env node
// PostToolUse: format -> check -> feed only NEW findings back to Claude.
// Pre-existing issues (see /craftsman:baseline) are excluded so this is
// usable on an existing tree, not just a greenfield repo.
import fs from "node:fs";
import path from "node:path";
import {
  loadConfig, enabled, detectLang, isIgnored, runChecks, filterBaseline,
  filterAttributed, globToRe, cacheKey, cacheHit, cacheStore, logEvent, recordFailure,
  readStdin, sidOf, sessionDir, atomicWrite, PROJECT_ROOT, projectContext, recordAcceptanceOwnership, advisorySkipped } from "./lib/core.mjs";
import { readScope } from "./scope.mjs";
import { acceptanceNotice, reconcileAcceptance } from "./tracker.mjs";

const t0 = Date.now();

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { advisorySkipped("quality-gate", "bad input"); process.exit(0); }
const active = readScope(input);
if (active?.scope_ambiguous) {
  process.stderr.write("craftsman: quality gate blocked because more than one active project scope matches this session. Activate the intended project scope explicitly before retrying.\n");
  process.exit(2);
}
const context = active?.project_root
  ? { root: active.project_root, stateDir: path.join(active.project_root, ".craftsman"), offFlag: path.join(active.project_root, ".craftsman", "off") }
  : projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);
const file = input?.tool_input?.file_path;
if (!file || !fs.existsSync(file)) process.exit(0);

// Record per-session acceptance-criteria ownership (see stop-gate). The
// acceptance file is per-session state, not lintable source, so short-circuit.
const rel0 = path.relative(context.root, file).split(path.sep).join("/");
if (rel0.endsWith(".craftsman/acceptance.md")) {
  try { recordAcceptanceOwnership(sidOf(input), context); } catch {}
  // Ticking the last criterion is the moment the tracker should move — not
  // whenever the model next remembers to.
  let notice = "";
  try { notice = acceptanceNotice(reconcileAcceptance(context, input)); } catch {}
  if (notice) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notice } }));
  }
  process.exit(0);
}

// Mark this session dirty for the Stop gate: an edit to something a test could
// regress on means the session-start test snapshot can no longer be trusted, so
// Stop must re-verify. That is a source file of a configured language, or a
// file that names the project's test command (package.json, go.mod, ...) —
// and never an ignored path. A docs-only turn leaves nothing to re-run. Bash-made
// edits are caught by the Stop gate's own `git status`, not by this marker.
const lang = detectLang(file, cfg, context);
const namesTestCommand = Object.keys(cfg.stopGate?.commands || {}).some((marker) => globToRe(marker).test(path.basename(file)));
if ((lang || namesTestCommand) && !isIgnored(file, cfg, lang, context)) {
  try { atomicWrite(path.join(sessionDir(sidOf(input), context), "dirty"), String(Date.now())); } catch {}
}

if (!lang || isIgnored(file, cfg, lang, context)) process.exit(0);

// Content-hash cache: unchanged file + unchanged check set => skip entirely.
const key = cacheKey(file, lang, cfg);
if (cacheHit(key, context)) { logEvent({ ev: "gate", file, result: "cached", ms: Date.now() - t0 }); process.exit(0); }

// A tool that crashed is unavailable, never a finding: say so once per session
// and do not run it again (a marker in session state is the cache).
const unavailableMarker = (bin) => path.join(sessionDir(sidOf(input), context), `tool-unavailable-${bin.replace(/[^A-Za-z0-9_.-]/g, "_")}`);
const skipBins = (lang.check || []).map((c) => c.split(/\s+/)[0]).filter((bin) => fs.existsSync(unavailableMarker(bin)));

const { failures, timedOut, skipped, unavailable = [], ms } = await runChecks(file, lang, cfg, context, { skipBins });

const newlyUnavailable = unavailable.filter((bin) => !fs.existsSync(unavailableMarker(bin)));
for (const bin of newlyUnavailable) {
  try { atomicWrite(unavailableMarker(bin), String(Date.now())); } catch {}
}
if (newlyUnavailable.length) {
  logEvent({ ev: "gate", file, lang: lang.name, result: "tool-unavailable", tools: newlyUnavailable });
  process.stdout.write(JSON.stringify({
    systemMessage: `craftsman: ${newlyUnavailable.join(", ")} crashed and is unavailable, so its check is skipped for the rest of this session (not a finding in your code).`,
  }));
}

if (failures.length === 0) {
  if (unavailable.length || skipBins.length) process.exit(0); // an unchecked file is not a pass: never cached
  cacheStore(key, context);
  logEvent({ ev: "gate", file, lang: lang.name, result: timedOut.length ? "timeout" : "pass", ms, skipped, timedOut });
  process.exit(0); // a timeout is never a finding you wrote — never blocks, never shown
}

// Split into lines and drop anything already present at baseline.
const noise = (cfg.noisePatterns || []).map((p) => new RegExp(p));
let rawLines = failures
  .flatMap((f) => f.out.split("\n"))
  .filter((l) => l.trim())
  .filter((l) => !noise.some((re) => re.test(l)));

// Project/package-scoped checks (whole-crate clippy, `go vet ./pkg`,
// staticcheck) can legitimately report on a sibling file, not the one that
// was just edited — keep only lines this file's own baseline can own.
if (lang.projectScoped) rawLines = filterAttributed(rawLines, rel0);

const newLines = cfg.baselineNewOnly ? filterBaseline(file, rawLines, context) : rawLines;

if (newLines.length === 0) {
  cacheStore(key, context);
  logEvent({ ev: "gate", file, lang: lang.name, result: "pass-baselined", ms, preexisting: rawLines.length });
  process.exit(0);
}

for (const f of failures) {
  if (f.out) recordFailure(lang.name, f.bin, f.out.split("\n")[0], cfg, context);
}

const shown = newLines.slice(0, cfg.maxFeedbackLines ?? 40);
const more = newLines.length - shown.length;
logEvent({ ev: "gate", file, lang: lang.name, result: "fail", ms, findings: newLines.length,
           tools: failures.map((f) => f.bin) });

process.stderr.write(
  `craftsman: ${newLines.length} new issue(s) introduced in ${file}. ` +
  `Fix these now, before editing anything else. Pre-existing issues are excluded — ` +
  `do not fix unrelated code.\n\n${shown.join("\n")}` +
  (more > 0 ? `\n… and ${more} more (run the checks yourself to see all).\n` : "\n")
);
process.exit(2); // exit 2 => stderr becomes model-visible feedback
