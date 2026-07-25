#!/usr/bin/env node
// /craftsman:baseline — snapshot pre-existing findings per file so the
// quality gate reports only issues introduced AFTER this point. Run once per
// repo before first use, and again after any large intentional cleanup.
import fs from "node:fs";
import {
  loadConfig, enabled, detectLang, isIgnored, runChecks, writeBaseline,
  logEvent, git,
} from "./lib/core.mjs";

const cfg = loadConfig();
if (!enabled(cfg)) { console.log("craftsman is off — nothing to baseline."); process.exit(0); }

// Prefer git-tracked files; fall back to a shallow walk if not a repo.
let files = (await git(["ls-files"])).split("\n").map((s) => s.trim()).filter(Boolean);
if (!files.length) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(p);
    return [p];
  });
  files = walk(".");
}

const noise = (cfg.noisePatterns || []).map((p) => new RegExp(p));
let baselined = 0, findings = 0, skipped = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const lang = detectLang(file, cfg);
  if (!lang || isIgnored(file, cfg, lang)) continue;
  const { failures } = await runChecks(file, lang, cfg);
  if (!failures.length) { skipped++; continue; }
  const lines = failures
    .flatMap((f) => f.out.split("\n"))
    .filter((l) => l.trim())
    .filter((l) => !noise.some((re) => re.test(l)));
  if (!lines.length) { skipped++; continue; }
  writeBaseline(file, lines);
  baselined++; findings += lines.length;
}

logEvent({ ev: "baseline", files: baselined, findings });
console.log(
  `craftsman baseline complete: ${baselined} file(s) with pre-existing findings ` +
  `snapshotted (${findings} lines). From now on only NEW issues are reported.`
);
