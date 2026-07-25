// craftsman core engine.
// Node-only, zero npm dependencies (Claude Code already requires Node).
// Derived from the craftsman v0.2 engine. Fully stack-agnostic; behaviour is config-driven.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const pexec = promisify(execFile);

export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

// All mutable per-repo state lives here (git-ignore it).
export const STATE_DIR = path.join(process.cwd(), ".craftsman");
const CACHE_DIR = path.join(STATE_DIR, "cache");
const BASELINE_DIR = path.join(STATE_DIR, "baseline");
const LOG_FILE = path.join(STATE_DIR, "events.jsonl");
const RULES_FILE = path.join(STATE_DIR, "learned-rules.json");
const OFF_FLAG = path.join(STATE_DIR, "off");

// ---------------------------------------------------- session scoping ---
// Per-session state lives under .craftsman/sessions/<sid>/ so concurrent
// sessions never clobber each other's snapshot / acceptance / doc-authority.
// (Separate git worktrees isolate everything already — this covers sessions
// that share one working tree.)
export const SESSIONS_DIR = path.join(STATE_DIR, "sessions");
export function sidOf(input) {
  const raw = (input && input.session_id) || "shared";
  return String(raw).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "shared";
}
export function sessionDir(sid) { return path.join(SESSIONS_DIR, sid); }
export function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file); // rename is atomic on the same filesystem
}
export function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
export function pruneSessions(maxAgeMs = 7 * 24 * 3600 * 1000) {
  try {
    for (const d of fs.readdirSync(SESSIONS_DIR)) {
      const p = path.join(SESSIONS_DIR, d);
      try { if (Date.now() - fs.statSync(p).mtimeMs > maxAgeMs) fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  } catch { /* no sessions dir yet */ }
}

// ---------------------------------------------------------------- config ---

export function loadConfig() {
  const defaults = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "craftsman.config.json"), "utf8")
  );
  const local = path.join(process.cwd(), "craftsman.config.json");
  if (!fs.existsSync(local)) return defaults;
  try {
    return deepMerge(defaults, JSON.parse(fs.readFileSync(local, "utf8")));
  } catch (e) {
    warn(`ignoring malformed ./craftsman.config.json: ${e.message}`);
    return defaults;
  }
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k]
      ? deepMerge(a[k], v)
      : v;
  }
  return out;
}

// ------------------------------------------------------------ kill switch ---

export function enabled(cfg) {
  const env = (process.env.CRAFTSMAN || "").toLowerCase();
  if (env === "off" || env === "0" || env === "false") return false;
  if (fs.existsSync(OFF_FLAG)) return false;
  return cfg.enabled !== false;
}

// ------------------------------------------------------------ glob / skip ---

// Minimal glob -> RegExp. Supports **, *, ?, character classes and {a,b} groups.
export function globToRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") { re += "(?:"; }
    else if (c === "}") { re += ")"; }
    else if (c === ",") { re += "|"; }
    else if ("+.^$()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}

export function isIgnored(file, cfg, lang) {
  const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
  const pats = [...(cfg.ignore || []), ...((lang && lang.ignore) || [])];
  return pats.some((p) => globToRe(p).test(rel) || globToRe(p).test("./" + rel));
}

export function detectLang(file, cfg) {
  const ext = path.extname(file);
  for (const [name, spec] of Object.entries(cfg.languages)) {
    if ((spec.extensions || []).includes(ext)) return { name, ...spec };
  }
  return null;
}

// --------------------------------------------------------------- runners ---

async function which(bin) {
  try { await pexec(process.platform === "win32" ? "where" : "which", [bin]); return true; }
  catch { return false; }
}

const whichCache = new Map();
async function have(bin) {
  if (!whichCache.has(bin)) whichCache.set(bin, await which(bin));
  return whichCache.get(bin);
}

function tokenize(cmdTemplate, file) {
  const rel = path.relative(process.cwd(), file) || file;
  const dir = path.dirname(rel);
  const filled = cmdTemplate
    .replaceAll("{file}", rel)
    .replaceAll("{dir}", dir);
  // naive but sufficient split honouring quoted segments
  const parts = filled.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return parts.map((p) => p.replace(/^["']|["']$/g, ""));
}

async function runOne(cmdTemplate, file, timeoutMs) {
  const [bin, ...args] = tokenize(cmdTemplate, file);
  if (!(await have(bin))) return { skipped: true, bin };
  try {
    const { stdout, stderr } = await pexec(bin, args, {
      timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, cwd: process.cwd(),
    });
    return { ok: true, out: (stdout + stderr).trim(), bin };
  } catch (e) {
    if (e.killed) return { ok: false, timedOut: true, bin, out: `${bin}: timed out` };
    return { ok: false, bin, out: ((e.stdout || "") + (e.stderr || "")).trim() || e.message };
  }
}

/** Run format commands (best-effort, silent) then checks in parallel. */
export async function runChecks(file, lang, cfg) {
  const t0 = Date.now();
  for (const f of lang.format || []) await runOne(f, file, cfg.timeoutMs ?? 20000);

  const results = await Promise.all(
    (lang.check || []).map((c) => runOne(c, file, cfg.timeoutMs ?? 20000))
  );
  const failures = results.filter((r) => r.ok === false);
  const skipped = results.filter((r) => r.skipped).map((r) => r.bin);
  return { failures, skipped, ms: Date.now() - t0 };
}

// ----------------------------------------------------------- diff filter ---

/** Keep only findings whose text is new relative to the recorded baseline. */
export function filterBaseline(file, findings) {
  const key = crypto.createHash("md5").update(path.resolve(file)).digest("hex").slice(0, 12);
  const bpath = path.join(BASELINE_DIR, key + ".txt");
  if (!fs.existsSync(bpath)) return findings;
  const base = new Set(fs.readFileSync(bpath, "utf8").split("\n").map(normLine));
  return findings.filter((l) => !base.has(normLine(l)));
}

export function writeBaseline(file, lines) {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const key = crypto.createHash("md5").update(path.resolve(file)).digest("hex").slice(0, 12);
  fs.writeFileSync(path.join(BASELINE_DIR, key + ".txt"), lines.join("\n"));
}

// strip line/col numbers so an unrelated edit that shifts lines doesn't
// resurrect every pre-existing finding as "new"
function normLine(l) {
  return l.replace(/:\d+(:\d+)?/g, ":N").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------- caching ---

export function cacheKey(file, lang, cfg) {
  const content = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  return crypto.createHash("sha1")
    .update(content)
    .update(lang.name)
    .update(JSON.stringify(lang.check || []))
    // invalidate the cache whenever config changes, so edits to checks,
    // noise filters or ignore rules take effect immediately
    .update(JSON.stringify({ n: cfg.noisePatterns, i: cfg.ignore, b: cfg.baselineNewOnly }))
    .digest("hex");
}

export function cacheHit(key) {
  return fs.existsSync(path.join(CACHE_DIR, key));
}

export function cacheStore(key) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, key), "");
  pruneCache();
}

function pruneCache() {
  try {
    const files = fs.readdirSync(CACHE_DIR)
      .map((f) => ({ f, t: fs.statSync(path.join(CACHE_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(2000)) fs.unlinkSync(path.join(CACHE_DIR, f));
  } catch { /* non-fatal */ }
}

// --------------------------------------------------------------- logging ---

export function logEvent(ev) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: Date.now(), ...ev }) + "\n");
  } catch { /* never break the hook on logging */ }
}

export function readEvents() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// -------------------------------------------------------- learned rules ---

export function recordFailure(lang, tool, sample, cfg) {
  const cap = cfg.learnedRules?.max ?? 10;
  let rules = [];
  try { rules = JSON.parse(fs.readFileSync(RULES_FILE, "utf8")); } catch {}
  const sig = `${lang}:${tool}:${(sample.match(/[A-Z][A-Z0-9_]{3,}|\b[a-z-]+\d{3,}\b/) || [""])[0]}`;
  const hit = rules.find((r) => r.sig === sig);
  if (hit) { hit.n++; hit.last = Date.now(); hit.sample = sample.slice(0, 200); }
  else rules.push({ sig, n: 1, last: Date.now(), lang, tool, sample: sample.slice(0, 200) });
  rules.sort((a, b) => (b.n - a.n) || (b.last - a.last));
  try {
    atomicWrite(RULES_FILE, JSON.stringify(rules.slice(0, cap * 3), null, 0)); // atomic: safe under concurrent sessions
  } catch {}
}

export function topRules(cfg) {
  const cap = cfg.learnedRules?.max ?? 10;
  const minN = cfg.learnedRules?.minOccurrences ?? 3;
  try {
    return JSON.parse(fs.readFileSync(RULES_FILE, "utf8"))
      .filter((r) => r.n >= minN).slice(0, cap);
  } catch { return []; }
}

// ----------------------------------------------------------------- utils ---

export function readStdin() {
  return new Promise((res) => {
    let d = ""; process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => res(d));
    setTimeout(() => res(d), 5000).unref?.();
  });
}

export function warn(msg) { process.stderr.write(`[craftsman] ${msg}\n`); }

export async function git(args) {
  try { const { stdout } = await pexec("git", args, { cwd: process.cwd(), maxBuffer: 8e6 }); return stdout; }
  catch { return ""; }
}
