#!/usr/bin/env node
// /craftsman:baseline — snapshot pre-existing findings per file so the
// quality gate reports only issues introduced AFTER this point. Run once per
// repo before first use, and again after any large intentional cleanup.
import fs from "node:fs";
import path from "node:path";
import {
  loadConfig, enabled, detectLang, isIgnored, runChecks, writeBaseline,
  renderKnownIssuesDoc, logEvent, gitTrackedFiles, PROJECT_ROOT,
} from "./lib/core.mjs";

const cfg = loadConfig();
if (!enabled(cfg)) { console.log("craftsman is off — nothing to baseline."); process.exit(0); }

// Prefer the shared tracked-plus-untracked-not-ignored file list (relative to
// PROJECT_ROOT); fall back to a shallow walk from PROJECT_ROOT if not a repo.
// Always resolved to absolute paths — every downstream helper (isIgnored,
// runChecks) anchors to PROJECT_ROOT too, not wherever this process happened
// to be invoked from.
let rels = await gitTrackedFiles();
if (!rels.length) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(p);
    return [path.relative(PROJECT_ROOT, p)];
  });
  rels = walk(PROJECT_ROOT);
}
const files = rels.map((r) => path.join(PROJECT_ROOT, r));

const noise = (cfg.noisePatterns || []).map((p) => new RegExp(p));
let baselined = 0, findings = 0, skipped = 0;
const knownIssues = []; // { rel, lang, tools, count, sample } — feeds docs/errors/*

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
  knownIssues.push({
    rel: path.relative(PROJECT_ROOT, file).split(path.sep).join("/"),
    lang: lang.name,
    tools: [...new Set(failures.map((f) => f.bin))],
    count: lines.length,
    sample: lines[0],
  });
}

logEvent({ ev: "baseline", files: baselined, findings });
console.log(
  `craftsman baseline complete: ${baselined} file(s) with pre-existing findings ` +
  `snapshotted (${findings} lines). From now on only NEW issues are reported.`
);

// Surface what was just skipped instead of letting it vanish into the
// gitignored .craftsman/baseline/ snapshot — a doc under docs/ so the whole
// team (and future sessions) can see and prioritize it, not just whoever
// happened to run this locally.
const docPath = cfg.baseline?.errorsDoc ?? "docs/errors/KNOWN_ISSUES.md";
if (docPath) {
  const absDocPath = path.join(PROJECT_ROOT, docPath);
  if (knownIssues.length || fs.existsSync(absDocPath)) {
    const dateStr = new Date().toISOString().slice(0, 10);
    fs.mkdirSync(path.dirname(absDocPath), { recursive: true });
    fs.writeFileSync(absDocPath, renderKnownIssuesDoc(knownIssues, dateStr));
    console.log(`Known-issues doc ${knownIssues.length ? "updated" : "cleared"}: ${docPath}`);
  }
}
