#!/usr/bin/env node
// /craftsman:stats — cost/benefit report. Shows how often each gate blocks
// and how long it takes, so you can delete the layers that don't earn their
// tokens. This is the empirical answer to "which tools pay for themselves?".
import { loadConfig, readEvents, topRules } from "./lib/core.mjs";

const cfg = loadConfig();
const events = readEvents();
if (!events.length) { console.log("No craftsman events yet. Do some work, then re-run."); process.exit(0); }

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const gate = events.filter((e) => e.ev === "gate");
const stop = events.filter((e) => e.ev === "stop");
const pre = events.filter((e) => e.ev === "preguard");
const ss = events.filter((e) => e.ev === "session_start");

const gms = gate.map((e) => e.ms).filter((n) => typeof n === "number");
const byResult = (arr) => arr.reduce((m, e) => ((m[e.result] = (m[e.result] || 0) + 1), m), {});

const first = new Date(events[0].ts).toISOString().slice(0, 10);
const last = new Date(events[events.length - 1].ts).toISOString().slice(0, 10);

console.log(`craftsman stats  (${first} → ${last}, ${events.length} events)\n`);

console.log(`PostToolUse quality gate: ${gate.length} runs`);
const gr = byResult(gate);
for (const [k, v] of Object.entries(gr)) console.log(`  ${k.padEnd(16)} ${v}  (${Math.round((100 * v) / gate.length)}%)`);
if (gms.length) console.log(`  latency: p50 ${pct(gms, 50)}ms · p95 ${pct(gms, 95)}ms · max ${Math.max(...gms)}ms`);
const blockRate = gate.length ? Math.round((100 * (gr.fail || 0)) / gate.length) : 0;
console.log(`  block rate (new issues found): ${blockRate}%`);
const cacheRate = gate.length ? Math.round((100 * (gr.cached || 0)) / gate.length) : 0;
console.log(`  cache hit rate: ${cacheRate}%\n`);

console.log(`PreToolUse protected-path blocks: ${pre.length}`);
console.log(`Stop gate: ${stop.length} runs · blocked ${stop.filter((e) => e.result === "block").length}`);
console.log(`SessionStart injections: ${ss.length}`);

const router = events.filter((e) => e.ev === "router");
console.log(`\nReview router: ${router.length} decisions`);
if (!router.length) {
  console.log("  No review-router events yet.");
} else {
  const rr = byResult(router);
  for (const [k, v] of Object.entries(rr)) console.log(`  ${k.padEnd(16)} ${v}  (${Math.round((100 * v) / router.length)}%)`);
  const escalateRate = router.length ? Math.round((100 * (rr.ESCALATE || 0)) / router.length) : 0;
  console.log(`  escalate rate: ${escalateRate}%`);
}

const rules = topRules(cfg);
console.log(`\nLearned rules: ${rules.length}`);
if (!rules.length) {
  console.log("  No learned rules yet.");
} else {
  for (const r of rules) console.log(`  ${r.lang}/${r.tool} (${r.n} occurrences): ${r.sample}`);
}

console.log(`\nRead: a layer with ~0% block rate but non-trivial latency is a candidate to cut.`);
