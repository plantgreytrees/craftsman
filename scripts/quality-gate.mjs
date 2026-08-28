#!/usr/bin/env node
// PostToolUse: format -> check -> feed only NEW findings back to Claude.
// Pre-existing issues (see /craftsman:baseline) are excluded so this is
// usable on an existing tree, not just a greenfield repo.
import fs from "node:fs";
import path from "node:path";
import {
  loadConfig, enabled, detectLang, isIgnored, runChecks, filterBaseline,
  filterAttributed, cacheKey, cacheHit, cacheStore, logEvent, recordFailure,
  readStdin, sidOf, sessionDir, sha1, atomicWrite, PROJECT_ROOT,
} from "./lib/core.mjs";

const t0 = Date.now();
const cfg = loadConfig();
if (!enabled(cfg)) process.exit(0);

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const file = input?.tool_input?.file_path;
if (!file || !fs.existsSync(file)) process.exit(0);

// Record per-session acceptance-criteria ownership (see stop-gate). The
// acceptance file is per-session state, not lintable source, so short-circuit.
const rel0 = path.relative(PROJECT_ROOT, file).split(path.sep).join("/");
if (rel0.endsWith(".craftsman/acceptance.md")) {
  try {
    const ac = fs.readFileSync(file, "utf8");
    atomicWrite(path.join(sessionDir(sidOf(input)), "acceptance.ref"),
      JSON.stringify({ hash: sha1(ac.trim()), ts: Date.now() }));
  } catch {}
  process.exit(0);
}

// Mark this session dirty for the Stop gate: any real edit means the
// session-start test snapshot can no longer be trusted as still-current, so
// Stop must re-verify. Set unconditionally (before any language/ignore
// filtering) so a false negative here — silently skipping a real regression
// check — can't happen; the cost of an occasional unnecessary re-run is cheap
// by comparison.
try { atomicWrite(path.join(sessionDir(sidOf(input)), "dirty"), String(Date.now())); } catch {}

const lang = detectLang(file, cfg);
if (!lang || isIgnored(file, cfg, lang)) process.exit(0);

// Content-hash cache: unchanged file + unchanged check set => skip entirely.
const key = cacheKey(file, lang, cfg);
if (cacheHit(key)) { logEvent({ ev: "gate", file, result: "cached", ms: Date.now() - t0 }); process.exit(0); }

const { failures, timedOut, skipped, ms } = await runChecks(file, lang, cfg);

if (failures.length === 0) {
  cacheStore(key);
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

const newLines = cfg.baselineNewOnly ? filterBaseline(file, rawLines) : rawLines;

if (newLines.length === 0) {
  cacheStore(key);
  logEvent({ ev: "gate", file, lang: lang.name, result: "pass-baselined", ms, preexisting: rawLines.length });
  process.exit(0);
}

for (const f of failures) {
  if (f.out) recordFailure(lang.name, f.bin, f.out.split("\n")[0], cfg);
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
