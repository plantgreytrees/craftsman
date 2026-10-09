import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TAIL_BYTES, contextEvent, directEvent, readTail } from "./telemetry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TELEMETRY = path.join(HERE, "telemetry.mjs");

const assistant = (usage, extra = {}) => JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-5-5", usage }, ...extra });
const user = (text) => JSON.stringify({ type: "user", message: { content: text } });
const USAGE = { input_tokens: 12, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 9_988, output_tokens: 500 };

function tmpRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-telemetry-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

test("telemetry: the last assistant usage becomes the exact context event", () => {
  const text = [user("hi"), assistant({ input_tokens: 1 }), user("more"), assistant(USAGE, { costUSD: 0.42 }), user("tool result")].join("\n");
  assert.deepEqual(contextEvent({ text, sid: "s1", phase: "orchestrate", unit: "telemetry" }), {
    ev: "context", sid: "s1", phase: "orchestrate", unit: "telemetry", tokens: 50_000, percent: 25, cost: 0.42,
  });
});

test("telemetry: no cost field reports cost null; a 1M model id sizes the window by feature", () => {
  const text = JSON.stringify({ type: "assistant", message: { model: "claude-opus-5-5[1m]", usage: USAGE } });
  const event = contextEvent({ text, sid: "s2" });
  assert.equal(event.cost, null);
  assert.equal(event.percent, 5);
  assert.equal(contextEvent({ text: user("only a user turn"), sid: "s2" }), null);
});

test("telemetry: only a bounded tail of the transcript is read", () => {
  const dir = tmpRepo();
  try {
    const file = path.join(dir, "t.jsonl");
    const early = assistant({ input_tokens: 999_999 });
    const filler = user("x".repeat(TAIL_BYTES));
    fs.writeFileSync(file, [early, filler, user("last")].join("\n") + "\n");
    const tail = readTail(file);
    assert.ok(Buffer.byteLength(tail) <= TAIL_BYTES);
    assert.equal(contextEvent({ text: tail, sid: "s3" }), null, "an entry outside the tail is never parsed");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("telemetry: the Stop hook appends the event to events.jsonl through logEvent", () => {
  const dir = tmpRepo();
  try {
    const transcript = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript, [user("go"), assistant(USAGE)].join("\n") + "\n");
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    const hook = spawnSync(process.execPath, [TELEMETRY], { cwd: dir, env, encoding: "utf8", input: JSON.stringify({ session_id: "hook-sid", transcript_path: transcript }) });
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(hook.stdout, "", "a Stop hook prints nothing");
    const cli = spawnSync(process.execPath, [TELEMETRY, "--transcript", transcript, "--sid", "cli-sid", "--phase", "baseline", "--unit", "u1"], { cwd: dir, env, encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    const events = fs.readFileSync(path.join(dir, ".craftsman", "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
      .filter((e) => e.ev === "context").map(({ ts, ...rest }) => rest);
    assert.deepEqual(events, [
      { ev: "context", sid: "hook-sid", phase: null, unit: null, tokens: 50_000, percent: 25, cost: null },
      { ev: "context", sid: "cli-sid", phase: "baseline", unit: "u1", tokens: 50_000, percent: 25, cost: null },
    ]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("telemetry: a missing or unreadable transcript is a silent no-op", () => {
  const dir = tmpRepo();
  try {
    const r = spawnSync(process.execPath, [TELEMETRY], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8", input: JSON.stringify({ session_id: "x", transcript_path: path.join(dir, "missing.jsonl") }) });
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman", "events.jsonl")), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("telemetry: a measured sample (the mod's session usage) logs the same event shape", () => {
  assert.deepEqual(directEvent({ sid: "m", unit: "u", tokens: "1200", percent: "0.6", cost: "0.01" }),
    { ev: "context", sid: "m", phase: null, unit: "u", tokens: 1200, percent: 0.6, cost: 0.01 });
  assert.equal(directEvent({ sid: "m", tokens: "x", percent: "1" }), null);
  assert.equal(directEvent({ tokens: "1", percent: "1" }), null, "a sample needs its session");
  const dir = tmpRepo();
  try {
    const r = spawnSync(process.execPath, [TELEMETRY, "--sid", "mod-sid", "--tokens", "5000", "--percent", "2.5"], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const [{ ts, ...event }] = fs.readFileSync(path.join(dir, ".craftsman", "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(event, { ev: "context", sid: "mod-sid", phase: null, unit: null, tokens: 5000, percent: 2.5, cost: null });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("telemetry: registered on Stop in hooks/hooks.json", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(HERE, "..", "hooks", "hooks.json"), "utf8")).hooks;
  const stop = hooks.Stop.flatMap((group) => group.hooks).find((h) => h.command.includes("scripts/telemetry.mjs"));
  assert.ok(stop, "telemetry.mjs is a Stop hook");
  assert.ok(stop.timeout <= 10);
});

test("ARCH-MOD-04: telemetry and stats never compare version strings", () => {
  for (const name of ["telemetry.mjs", "stats.mjs"]) {
    const source = fs.readFileSync(path.join(HERE, name), "utf8");
    assert.doesNotMatch(source, /\bversion\b|semver|\d+\.\d+\.\d+/i, `${name} must feature-detect, not version-check`);
  }
});
