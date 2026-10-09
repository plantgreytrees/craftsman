import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rootContextRows, rootContextSection } from "./stats.mjs";

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
    { sid: "root-a", samples: 3, peak: 90_000, final: 60_000, peakPercent: 45, units: ["telemetry", "baseline-run"] },
    { sid: "root-b", samples: 1, peak: 10_000, final: 10_000, peakPercent: 5, units: [] },
  ]);
  const section = rootContextSection(EVENTS);
  assert.match(section, /^Root context per run: 2 sessions/);
  assert.match(section, /root-a\s+3 samples · peak 90000 · final 60000 · peak 45% · units telemetry,baseline-run/);
  assert.match(rootContextSection([]), /No context samples yet/);
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
