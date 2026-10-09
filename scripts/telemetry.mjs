#!/usr/bin/env node
// Stop hook + CLI: sample the root session's context size (ARCH-MOD-03).
// Reads only the tail of the transcript, takes the last assistant turn's
// usage as the root context, and appends one {ev:"context"} event. Bookkeeping
// only: it prints nothing and always exits 0.
//
//   node scripts/telemetry.mjs --transcript <path> [--phase <p>] [--unit <u>] [--sid <id>]
//   node scripts/telemetry.mjs --sid <id> --tokens <n> --percent <p> [--cost <usd>] [--phase <p>] [--unit <u>]
import fs from "node:fs";
import { loadConfig, enabled, logEvent, readStdin, sidOf } from "./lib/core.mjs";
import { readScope } from "./scope.mjs";

export const TAIL_BYTES = 256 * 1024;
const DEFAULT_WINDOW = 200_000;
const LARGE_WINDOW = 1_000_000;

// The last `max` bytes of a file, cut to whole lines.
export function readTail(file, max = TAIL_BYTES) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, max);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    const text = buffer.toString("utf8");
    return length < size ? text.slice(text.indexOf("\n") + 1) : text;
  } finally { fs.closeSync(fd); }
}

// The newest assistant entry carrying usage, or null.
export function lastUsage(text) {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    const usage = entry?.message?.usage;
    if (entry?.type === "assistant" && usage) return { usage, model: entry.message.model || "", cost: entry.costUSD };
  }
  return null;
}

// Window size by feature detection (ARCH-MOD-04): an explicit config value, a
// model id that advertises the 1M window, or a sample already past 200k.
export function contextWindow(tokens, model, cfg) {
  const configured = Number(cfg?.telemetry?.contextWindow);
  if (configured > 0) return configured;
  if (/\[1m\]/i.test(model) || tokens > DEFAULT_WINDOW) return LARGE_WINDOW;
  return DEFAULT_WINDOW;
}

export function contextEvent({ text, sid, phase = null, unit = null, cfg = {} }) {
  const last = lastUsage(text);
  if (!last) return null;
  const u = last.usage;
  const tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const percent = Math.round((1000 * tokens) / contextWindow(tokens, last.model, cfg)) / 10;
  const cost = typeof last.cost === "number" ? last.cost : null;
  return { ev: "context", sid, phase, unit, tokens, percent, cost };
}

// --tokens/--percent[/--cost] from the CLI: the same event, already measured.
export function directEvent({ sid, phase = null, unit = null, tokens, percent, cost }) {
  const t = Number(tokens);
  const p = Number(percent);
  if (!sid || !Number.isFinite(t) || t < 0 || !Number.isFinite(p)) return null;
  const c = cost === undefined ? null : Number(cost);
  return { ev: "context", sid, phase, unit, tokens: t, percent: p, cost: Number.isFinite(c) ? c : null };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(transcript|phase|unit|sid|tokens|percent|cost)$/.exec(argv[i]);
    if (m && argv[i + 1] !== undefined) args[m[1]] = argv[++i];
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const direct = args.tokens !== undefined;
    const input = args.transcript || direct ? {} : JSON.parse((await readStdin()) || "{}");
    const cfg = loadConfig();
    const transcript = args.transcript || input.transcript_path;
    if (enabled(cfg) && direct) {
      // A sample the caller already measured (the mod reads session usage).
      const event = directEvent(args);
      if (event) logEvent(event);
    } else if (enabled(cfg) && transcript && fs.existsSync(transcript)) {
      const sid = args.sid || sidOf(input);
      const scope = readScope({ ...input, session_id: sid });
      const event = contextEvent({
        text: readTail(transcript),
        sid,
        phase: args.phase ?? scope?.phase ?? null,
        unit: args.unit ?? scope?.unit ?? null,
        cfg,
      });
      if (event) logEvent(event);
    }
  } catch { /* fail open — telemetry never blocks a turn */ }
  process.exit(0);
}
