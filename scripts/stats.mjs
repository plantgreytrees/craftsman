#!/usr/bin/env node
// /craftsman:stats — cost/benefit report. Shows how often each gate blocks
// and how long it takes, so you can delete the layers that don't earn their
// tokens. This is the empirical answer to "which tools pay for themselves?".
import { loadConfig, readEvents, topRules } from "./lib/core.mjs";

// Root context per run (ARCH-MOD-03): one row per session from its
// {ev:"context"} samples, in first-seen order.
export function rootContextRows(events) {
  const bySid = new Map();
  for (const e of events) {
    if (e.ev !== "context" || typeof e.tokens !== "number") continue;
    const row = bySid.get(e.sid) || { sid: e.sid, samples: 0, peak: 0, final: 0, peakPercent: 0, units: new Set() };
    row.samples += 1;
    row.peak = Math.max(row.peak, e.tokens);
    row.final = e.tokens;
    row.peakPercent = Math.max(row.peakPercent, e.percent || 0);
    if (e.unit) row.units.add(e.unit);
    bySid.set(e.sid, row);
  }
  return [...bySid.values()].map((row) => ({ ...row, units: [...row.units] }));
}

export function rootContextSection(events) {
  const rows = rootContextRows(events);
  const lines = [`Root context per run: ${rows.length} sessions`];
  if (!rows.length) lines.push("  No context samples yet.");
  for (const r of rows) {
    const units = r.units.length ? ` · units ${r.units.join(",")}` : "";
    lines.push(`  ${String(r.sid).padEnd(38)} ${r.samples} samples · peak ${r.peak} · final ${r.final} · peak ${r.peakPercent}%${units}`);
  }
  return lines.join("\n");
}

function main() {
  const cfg = loadConfig();
  const events = readEvents();
  if (!events.length) { console.log("No craftsman events yet. Do some work, then re-run."); return; }

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

  const recalls = events.filter((e) => e.ev === "memory_recall");
  const records = events.filter((e) => e.ev === "memory_record");
  const stale = events.filter((e) => e.ev === "memory_stale");
  const compactions = events.filter((e) => e.ev === "memory_compacted");
  console.log(`\nPlan memory: ${recalls.length} recalls · ${records.length} records · ${stale.length} stale · ${compactions.length} compactions`);
  if (recalls.length) {
    const returned = recalls.reduce((sum, event) => sum + (event.count || 0), 0);
    const chars = recalls.reduce((sum, event) => sum + (event.chars || 0), 0);
    console.log(`  recall output: ${returned} records · ${chars} chars`);
  }

  const rules = topRules(cfg);
  console.log(`\nLearned rules: ${rules.length}`);
  if (!rules.length) {
    console.log("  No learned rules yet.");
  } else {
    for (const r of rules) console.log(`  ${r.lang}/${r.tool} (${r.n} occurrences): ${r.sample}`);
  }

  const specialists = events.filter((e) => e.ev === "specialist");
  console.log(`\nSpecialist reviewers: ${specialists.length} dispatches`);
  if (!specialists.length) {
    console.log("  No specialist-reviewer events yet.");
  } else {
    const byAgent = new Map();
    for (const e of specialists) {
      const bucket = byAgent.get(e.agent) || { dispatches: 0, findings: 0, withFindings: 0 };
      bucket.dispatches += 1;
      bucket.findings += e.count || 0;
      if ((e.count || 0) > 0) bucket.withFindings += 1;
      byAgent.set(e.agent, bucket);
    }
    for (const [agent, b] of [...byAgent.entries()].sort((a, b) => b[1].dispatches - a[1].dispatches)) {
      const hitRate = Math.round((100 * b.withFindings) / b.dispatches);
      console.log(`  ${agent.padEnd(22)} ${b.dispatches} dispatches · ${hitRate}% found something · ${b.findings} findings total`);
    }
  }

  console.log(`\n${rootContextSection(events)}`);

  console.log(`\nRead: a layer with ~0% block rate but non-trivial latency is a candidate to cut.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
