import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rootContextRows, rootContextSection, latencySection, renderSection, preguardBlocks, blocksByReason, guardUnparsedRecent, guardReasonsSection, approvalSection } from "./stats.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = (sid, tokens, percent, unit = null) => ({ ts: 1, ev: "context", sid, phase: "orchestrate", unit, tokens, percent, cost: null });

const EVENTS = [
  ctx("root-a", 40_000, 20, "telemetry"),
  { ts: 2, ev: "gate", result: "pass", ms: 5 },
  ctx("root-b", 10_000, 5),
  ctx("root-a", 90_000, 45, "baseline-run"),
  ctx("root-a", 60_000, 30, "telemetry"),
];

test("stats: root context per run — samples, peak, final and peak percent per sid", () => {
  assert.deepEqual(rootContextRows(EVENTS), [
    { sid: "root-a", samples: 3, peak: 90_000, final: 60_000, peakPercent: 45, baseline: null, growth: null, units: ["telemetry", "baseline-run"] },
    { sid: "root-b", samples: 1, peak: 10_000, final: 10_000, peakPercent: 5, baseline: null, growth: null, units: [] },
  ]);
  const section = rootContextSection(EVENTS);
  assert.match(section, /^Root context per run: 2 sessions/);
  assert.match(section, /root-a\s+3 samples · peak 90000 · final 60000 · peak 45% · units telemetry,baseline-run/);
  assert.match(rootContextSection([]), /No context samples yet/);
});

test("stats: baseline, peak and growth per session; the baseline is not a sample", () => {
  const events = [{ ...ctx("s", 12_000, 6), phase: "baseline" }, ctx("s", 30_000, 15), ctx("s", 50_000, 25), { ...ctx("s", 99, 1), phase: "baseline" }];
  const [row] = rootContextRows(events);
  assert.deepEqual([row.baseline, row.peak, row.growth, row.samples], [12_000, 50_000, 38_000, 2]);
  assert.match(rootContextSection(events), /baseline 12000 · growth 38000/);
});

test("stats: the CLI prints the root context section from events.jsonl", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-stats-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    fs.mkdirSync(path.join(dir, ".craftsman"));
    fs.writeFileSync(path.join(dir, ".craftsman", "events.jsonl"), EVENTS.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const r = spawnSync(process.execPath, [path.join(HERE, "stats.mjs")], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Root context per run: 2 sessions/);
    assert.match(r.stdout, /root-b\s+1 samples · peak 10000/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const lat = (ev, ms) => ({ ts: 1, ev, ms });
const TIMEOUTS = { "quality-gate.mjs": 60, "pre-guard.mjs": 10, "stop-gate.mjs": 300 };

test("stats: latency p50/p95 per ms-carrying event type, flagged over 80% of timeout, n<20 marked", () => {
  const slow = Array.from({ length: 25 }, (_, i) => lat("gate", i < 10 ? 100 : 50_000)); // p95 50s > 48s
  const fast = Array.from({ length: 25 }, (_, i) => lat("stop", i + 1)); // well under 240s
  const small = [lat("preguard", 9000), lat("preguard", 9500)]; // 9.5s > 8s, n<20
  const section = latencySection([...slow, ...fast, ...small, { ev: "router", result: "x" }], TIMEOUTS);
  const line = (ev) => section.split("\n").find((l) => l.trim().startsWith(ev));
  assert.match(line("gate"), /p50 50000ms · p95 50000ms FLAG/);
  assert.doesNotMatch(line("gate"), /n<20/);
  assert.match(line("stop"), /p50 13ms · p95 24ms$/);
  assert.doesNotMatch(line("stop"), /FLAG|n<20/);
  assert.match(line("preguard"), /n<20 FLAG/);
  assert.doesNotMatch(section, /router/);
  assert.match(latencySection([], TIMEOUTS), /No latency samples yet/);
});

test("stats: an allowed preguard event is not a block but is in the ms percentiles", () => {
  const events = [
    { ts: 1, ev: "preguard", result: "allowed", ms: 10 },
    { ts: 2, ev: "preguard", result: "blocked", ms: 30 },
  ];
  assert.deepEqual(preguardBlocks(events), [events[1]]);
  assert.equal(events.filter((e) => e.ev === "preguard").length, 2); // old count treated both as blocks
  assert.match(latencySection(events, TIMEOUTS), /preguard\s+n=2 · p50 30ms · p95 30ms/);
});

test("stats: docguard and *_blocked events are ranked by reason too", () => {
  const ev = [
    { ev: "docguard", result: "blocked", file: "(command the parser cannot prove safe: the shell keyword while)" },
    { ev: "docguard", result: "blocked", file: "(command the parser cannot prove safe: the shell keyword while)" },
    { ev: "docguard", result: "allowed", file: "docs/plans/x.md" },
    { ev: "scope_blocked", tool: "Read" },
    { ev: "git_guard_blocked", command: "git commit" },
    { ev: "tracker_doc_synced" },
  ];
  assert.deepEqual(blocksByReason(ev), [
    { reason: "command the parser cannot prove safe: the shell keyword while", count: 2 },
    { reason: "scope_blocked", count: 1 },
    { reason: "git_guard_blocked", count: 1 },
  ]);
});

test("stats: blocks-by-reason table and last-7-days guard_unparsed list", () => {
  const now = 10 * 24 * 3600 * 1000;
  const ev = [
    { ts: now - 1000, ev: "preguard", result: "blocked", reason: "secrets" },
    { ts: now - 2000, ev: "preguard", result: "blocked", reason: "secrets" },
    { ts: now - 3000, ev: "preguard", result: "blocked", pattern: ".env" },
    { ts: now, ev: "preguard", result: "allowed" },
    { ts: now - 1000, ev: "guard_unparsed", reason: "subshell", command: "echo $(x)" },
    { ts: now - 8 * 24 * 3600 * 1000, ev: "guard_unparsed", reason: "old", command: "old" },
  ];
  assert.deepEqual(blocksByReason(ev), [{ reason: "secrets", count: 2 }, { reason: ".env", count: 1 }]);
  assert.equal(guardUnparsedRecent(ev, now).length, 1);
  const out = guardReasonsSection(ev, now);
  assert.match(out, /by reason: secrets\s+2/);
  assert.match(out, /guard_unparsed \(last 7 days\): 1/);
  assert.match(out, /subshell: echo \$\(x\)/);
  assert.doesNotMatch(out, /old/);
  // 5.2: every line is indented, so no new top-level section name appears
  assert.ok(out.split("\n").every((l) => l.startsWith("  ")));
});

test("stats: approval section pairs requested with decided by run (ARCH-APPROVAL-06)", () => {
  const ev = [
    { ts: 1000, ev: "approval_requested", run: "a" },
    { ts: 2000, ev: "approval_requested", run: "b" },
    { ts: 11_000, ev: "approval_decided", run: "a", choice: "merge" },
    { ts: 32_000, ev: "approval_decided", run: "b", choice: "open-pr" },
    { ts: 40_000, ev: "approval_decided", run: "orphan", choice: "merge" },
  ];
  const out = approvalSection(ev);
  assert.match(out, /^  approvals: 2 decided · p50 30s · p95 30s$/);
  assert.match(approvalSection([]), /^  approvals: none decided yet$/);
});

test("stats: dashboard_render p50/p95 over rendered runs, skipped counted apart, not in hook latency", () => {
  const ev = (ms, skipped = false) => ({ ts: 1, ev: "dashboard_render", ms, skipped, sections: 7 });
  const events = [ev(10), ev(20), ev(30), ev(0, true), ev(0, true)];
  assert.equal(renderSection(events), "Dashboard render: 3 rendered · p50 20ms · p95 30ms · 2 skipped");
  assert.match(renderSection([]), /no samples yet/);
  assert.doesNotMatch(latencySection(events, TIMEOUTS), /dashboard_render/);
});
