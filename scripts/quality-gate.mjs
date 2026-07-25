#!/usr/bin/env node
// PostToolUse: format -> check -> feed only NEW findings back to Claude.
// Pre-existing issues (see /craftsman:baseline) are excluded so this is
// usable on an existing tree, not just a greenfield repo.
import fs from "node:fs";
import path from "node:path";
import {
  loadConfig, enabled, detectLang, isIgnored, runChecks, filterBaseline,
  cacheKey, cacheHit, cacheStore, logEvent, recordFailure, readStdin,
  sidOf, sessionDir, sha1, atomicWrite,
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
const rel0 = path.relative(process.cwd(), file).split(path.sep).join("/");
if (rel0.endsWith(".craftsman/acceptance.md")) {
  try {
    const ac = fs.readFileSync(file, "utf8");
    atomicWrite(path.join(sessionDir(sidOf(input)), "acceptance.ref"),
      JSON.stringify({ hash: sha1(ac.trim()), ts: Date.now() }));
  } catch {}
  process.exit(0);
}

const lang = detectLang(file, cfg);
if (!lang || isIgnored(file, cfg, lang)) process.exit(0);

// Content-hash cache: unchanged file + unchanged check set => skip entirely.
const key = cacheKey(file, lang, cfg);
if (cacheHit(key)) { logEvent({ ev: "gate", file, result: "cached", ms: Date.now() - t0 }); process.exit(0); }

const { failures, skipped, ms } = await runChecks(file, lang, cfg);

if (failures.length === 0) {
  cacheStore(key);
  logEvent({ ev: "gate", file, lang: lang.name, result: "pass", ms, skipped });
  process.exit(0);
}

// Split into lines and drop anything already present at baseline.
const noise = (cfg.noisePatterns || []).map((p) => new RegExp(p));
const rawLines = failures
  .flatMap((f) => f.out.split("\n"))
  .filter((l) => l.trim())
  .filter((l) => !noise.some((re) => re.test(l)));
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
