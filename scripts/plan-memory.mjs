#!/usr/bin/env node
// Plan-scoped decision ledger. This is advisory context, never execution state.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { atomicWrite, logEvent, projectContext, readStdin } from "./lib/core.mjs";

const MAX_SUMMARY = 1600;
const MAX_ITEMS = 12;
const DEFAULT_CHARS = 6000;
const MAX_READ_BYTES = 256 * 1024;
const LOCK_WAIT_MS = 2000;
const CATEGORIES = new Set([
  "decision", "dependency", "contract-consumer", "tooling-gotcha",
  "failed-approach", "review-finding", "acceptance-result", "unresolved-risk",
]);

function planKey(plan) {
  const value = String(plan || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!value || value.includes("..") || value.split("/").some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error("plan must be a relative path with safe path segments");
  }
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function memoryFile(context, plan) {
  return path.join(context.stateDir, "plans", planKey(plan) + ".memory.jsonl");
}

function withMemoryLock(file, action) {
  const lock = `${file}.lock`;
  const started = Date.now();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  while (true) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, "owner"), `${process.pid}\n`);
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || Date.now() - started >= LOCK_WAIT_MS) throw new Error(`memory ledger is busy: ${file}`);
      try {
        const owner = Number(fs.readFileSync(path.join(lock, "owner"), "utf8").trim());
        let alive = false;
        try { process.kill(owner, 0); alive = true; } catch {}
        if (!alive && Date.now() - fs.statSync(lock).mtimeMs > LOCK_WAIT_MS * 2) {
          fs.rmSync(lock, { recursive: true, force: true });
        }
      } catch {}
      const wait = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(wait, 0, 0, 10);
    }
  }
  try { return action(); }
  finally { try { fs.rmSync(lock, { recursive: true, force: true }); } catch {} }
}

function gitIdentity(context) {
  try {
    return execFileSync("git", ["-C", context.root, "rev-parse", "HEAD"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return null; }
}

function planHash(context, plan) {
  try {
    return execFileSync("git", ["-C", context.root, "hash-object", "--", plan], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return null; }
}

function normalizeRecord(input, context) {
  if (!input || typeof input !== "object") throw new Error("memory record must be an object");
  if (typeof input.plan !== "string" || !input.plan.trim()) throw new Error("memory.plan must be a non-empty string");
  if (!CATEGORIES.has(input.category)) throw new Error(`memory.category must be one of: ${[...CATEGORIES].join(", ")}`);
  if (typeof input.summary !== "string" || !input.summary.trim()) throw new Error("memory.summary must be a non-empty string");
  if (input.summary.length > MAX_SUMMARY) throw new Error(`memory.summary must be at most ${MAX_SUMMARY} characters`);
  const sourceFiles = Array.isArray(input.source_files) ? input.source_files : [];
  if (sourceFiles.length > 24 || sourceFiles.some((file) => typeof file !== "string" || !file.trim() || file.length > 240 || path.isAbsolute(file) || file.split(/[\\/]/).includes(".."))) {
    throw new Error("memory.source_files must contain safe relative paths");
  }
  const status = input.status || "unproven";
  if (!["verified", "unproven", "superseded"].includes(status)) throw new Error("memory.status is invalid");
  const confidence = input.confidence || (status === "verified" ? "high" : "low");
  if (!["high", "medium", "low"].includes(confidence)) throw new Error("memory.confidence is invalid");
  const record = {
    id: typeof input.id === "string" && input.id ? input.id : null,
    plan: input.plan,
    project: context.id,
    unit: typeof input.unit === "string" ? input.unit : null,
    scope_id: typeof input.scope_id === "string" ? input.scope_id : null,
    category: input.category,
    summary: input.summary.trim(),
    source_files: [...new Set(sourceFiles)],
    source_commit: typeof input.source_commit === "string" ? input.source_commit : gitIdentity(context),
    plan_hash: typeof input.plan_hash === "string" ? input.plan_hash : planHash(context, input.plan),
    status,
    confidence,
    expires_at: typeof input.expires_at === "string" ? input.expires_at : null,
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.filter((tag) => typeof tag === "string" && tag.length <= 80).slice(0, 12))] : [],
    created_at: new Date().toISOString(),
  };
  record.id ||= crypto.createHash("sha256").update(JSON.stringify({ ...record, created_at: "" })).digest("hex").slice(0, 16);
  return record;
}

function readRecords(file) {
  if (!fs.existsSync(file)) return [];
  const stats = fs.statSync(file);
  const start = Math.max(0, stats.size - MAX_READ_BYTES);
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.alloc(Math.max(0, stats.size - start));
  try { fs.readSync(fd, buffer, 0, buffer.length, start); }
  finally { fs.closeSync(fd); }
  const content = buffer.toString("utf8");
  const lines = start ? content.slice(content.indexOf("\n") + 1) : content;
  return lines.split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function freshness(record, context) {
  if (record.plan_hash && planHash(context, record.plan) && record.plan_hash !== planHash(context, record.plan)) return "plan-changed";
  if (record.source_commit) {
    try {
      execFileSync("git", ["-C", context.root, "merge-base", "--is-ancestor", record.source_commit, "HEAD"], { stdio: "ignore" });
    } catch { return "commit-unavailable"; }
  }
  if (record.source_files?.length && record.source_commit) {
    try {
      execFileSync("git", ["-C", context.root, "diff", "--quiet", record.source_commit, "HEAD", "--", ...record.source_files], { stdio: "ignore" });
    } catch { return "source-changed"; }
  }
  return null;
}

function active(record, now, context, includeStale) {
  if (record.status === "superseded" || (record.expires_at && Date.parse(record.expires_at) <= now)) return false;
  const stale = freshness(record, context);
  if (stale) {
    if (includeStale) return true;
    logEvent({ ev: "memory_stale", id: record.id, plan: record.plan, reason: stale }, context);
    return stale !== "commit-unavailable";
  }
  return true;
}

function terms(query) {
  return String(query || "").toLowerCase().split(/[^a-z0-9_-]+/).filter((term) => term.length > 2).slice(0, 12);
}

function score(record, queryTerms) {
  if (!queryTerms.length) return 1;
  const haystack = [record.summary, record.category, ...(record.tags || []), ...(record.source_files || [])].join(" ").toLowerCase();
  return queryTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
}

export function recordMemory(input) {
  const context = input.context || projectContext(input.project || ".");
  const record = normalizeRecord(input, context);
  const file = memoryFile(context, record.plan);
  withMemoryLock(file, () => fs.appendFileSync(file, JSON.stringify(record) + "\n", { encoding: "utf8" }));
  logEvent({ ev: "memory_record", plan: record.plan, unit: record.unit, category: record.category, status: record.status }, context);
  return record;
}

export function recallMemory(input) {
  const context = input.context || projectContext(input.project || ".");
  if (typeof input.plan !== "string" || !input.plan.trim()) throw new Error("memory.plan must be a non-empty string");
  const queryTerms = terms(input.query);
  const maxItems = Math.min(Math.max(Number(input.max_items) || 6, 1), MAX_ITEMS);
  const maxChars = Math.min(Math.max(Number(input.max_chars) || DEFAULT_CHARS, 500), 12000);
  const now = Date.now();
  const records = readRecords(memoryFile(context, input.plan))
    .filter((record) => active(record, now, context, input.include_stale === true))
    .filter((record) => !input.unit || record.unit === input.unit)
    .filter((record) => !input.scope_id || record.scope_id === input.scope_id)
    .filter((record) => !input.category || record.category === input.category)
    .map((record, index) => ({ record, index, relevance: score(record, queryTerms) }))
    .filter((entry) => !queryTerms.length || entry.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.record.created_at.localeCompare(a.record.created_at));
  const result = [];
  let chars = 0;
  for (const entry of records) {
    const rendered = JSON.stringify(entry.record);
    if (result.length >= maxItems || chars + rendered.length > maxChars) break;
    result.push(entry.record);
    chars += rendered.length;
  }
  const output = input.summary_only
    ? result.map(({ id, category, summary, status, confidence, source_commit }) => ({ id, category, summary, status, confidence, source_commit }))
    : result;
  logEvent({ ev: "memory_recall", plan: input.plan, unit: input.unit || null, scope_id: input.scope_id || null, count: output.length, chars, summary_only: input.summary_only === true }, context);
  return { project: context.id, plan: input.plan, count: output.length, records: output };
}

export function compactMemory(input) {
  const context = input.context || projectContext(input.project || ".");
  if (typeof input.plan !== "string" || !input.plan.trim()) throw new Error("memory.plan must be a non-empty string");
  const file = memoryFile(context, input.plan);
  return withMemoryLock(file, () => {
    const records = readRecords(file);
    const groups = new Map();
    for (const record of records.filter((entry) => entry.status !== "superseded")) {
      const key = `${record.unit || "phase"}:${record.category}`;
      const group = groups.get(key) || [];
      group.push(record);
      groups.set(key, group);
    }
    if (groups.size === records.length) return { plan: input.plan, records_before: records.length, records_after: records.length, entries_superseded: 0 };
    const summaries = [...groups.values()].map((group) => {
      const latest = group.at(-1);
      return normalizeRecord({
        plan: input.plan, unit: latest.unit, scope_id: latest.scope_id, category: latest.category,
        summary: group.map((entry) => entry.summary).join(" | ").slice(0, MAX_SUMMARY),
        source_files: [...new Set(group.flatMap((entry) => entry.source_files || []))].slice(0, 24),
        source_commit: latest.source_commit, plan_hash: latest.plan_hash, status: latest.status,
      }, context);
    });
    atomicWrite(file, summaries.map((record) => JSON.stringify(record)).join("\n") + "\n");
    logEvent({ ev: "memory_compacted", plan: input.plan, records_before: records.length, records_after: summaries.length, entries_superseded: records.length - summaries.length }, context);
    return { plan: input.plan, records_before: records.length, records_after: summaries.length, entries_superseded: records.length - summaries.length };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    const output = input.action === "record" ? recordMemory(input) : input.action === "recall" ? recallMemory(input) : input.action === "compact" ? compactMemory(input) : (() => { throw new Error("action must be record, recall, or compact"); })();
    process.stdout.write(JSON.stringify(output) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: plan memory failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}