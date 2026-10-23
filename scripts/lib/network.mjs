// Network phase for repo-exec (ARCH-LAND-19). A sandboxed unit runner has no
// credentials and must never be given any, so every step that talks to the
// remote either runs in the root session (outside the sandbox) or is deferred:
// the runner does the local git work and queues the push; root drains the queue.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { atomicWrite } from "./core.mjs";

const NET_ENV = { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_ASKPASS: "true", SSH_ASKPASS: "true" };

export const FIX = "run the network step from the root session OUTSIDE the sandbox (`repo-exec` action \"network\": step fetch before a run, step drain after it); do not allowlist credential directories such as ~/.config/gh";

// Credentials never reach a log, evidence line or transcript: URL userinfo and
// well-known token shapes are removed from every message built here.
export function scrub(text) {
  return String(text ?? "")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@")
    .replace(/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, "***")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "***")
    .replace(/\bglpat-[A-Za-z0-9_-]{10,}\b/g, "***")
    .replace(/(authorization:\s*(?:basic|bearer)\s+)\S+/gi, "$1***");
}

// Auth, proxy-denial and reachability failures — all "this process cannot reach
// the remote as itself", as opposed to a remote that answered and refused.
const UNREACHABLE = /could not read (?:Username|Password)|terminal prompts disabled|Authentication failed|Permission denied \(publickey|Host key verification failed|HTTP (?:401|407)|returned error: (?:401|407)|CONNECT tunnel failed|Could not resolve host|Failed to connect to|Connection (?:refused|timed out)|Could not read from remote repository|Network is unreachable|Proxy Authentication/;

export function isUnreachable(error) {
  return UNREACHABLE.test(`${error?.stderr || ""}${error?.stdout || ""}${error?.message || ""}`);
}

export class NetworkError extends Error {
  constructor(detail, action = null) {
    super(`network step needs credentials this process does not have (${scrub(detail).trim().split("\n").slice(-2).join(" | ")}); ${FIX}`);
    this.name = "NetworkError";
    this.needsNetwork = true;
    this.action = action;
  }
}

export function networkError(error, action = null) {
  return new NetworkError(`${error?.stderr || ""}${error?.message || ""}`, action);
}

// Raised BEFORE any side effect, so root can run `action` outside the sandbox
// and the caller resumes from a clean state.
export class NeedsNetwork extends Error {
  constructor(reason, action) {
    super(`${reason}; ${FIX}`);
    this.name = "NeedsNetwork";
    this.needsNetwork = true;
    this.action = action;
  }
}

export function remote(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: NET_ENV, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status === 0) return String(result.stdout || "").trim();
  const error = new Error(scrub(`git ${args[0]} failed: ${result.stderr || result.error?.message || ""}`).trim());
  error.stderr = scrub(result.stderr || "");
  error.stdout = scrub(result.stdout || "");
  throw error;
}

const probed = new Map();

// "online" (this process can reach origin as itself) or "offline". Order:
// input.network, CRAFTSMAN_NETWORK, then one `ls-remote` probe per process.
export function networkMode(root, input = {}) {
  const forced = input.network ?? process.env.CRAFTSMAN_NETWORK;
  if (forced !== undefined && forced !== "") {
    if (forced !== "online" && forced !== "offline") throw new Error(`network must be "online" or "offline" (got ${scrub(forced)})`);
    return forced;
  }
  if (!probed.has(root)) {
    const result = spawnSync("git", ["-C", root, "ls-remote", "--exit-code", "origin", "HEAD"], { encoding: "utf8", env: NET_ENV, stdio: ["ignore", "ignore", "pipe"], timeout: 15000 });
    probed.set(root, result.status === 0 ? "online" : "offline");
  }
  return probed.get(root);
}

function netDir(info) { return path.join(info.common_git_dir, ".craftsman", "network"); }
const queueFile = (info) => path.join(netDir(info), "queue.jsonl");
const fetchedFile = (info) => path.join(netDir(info), "fetched.json");

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }

export function recordFetch(info, branch) {
  const state = readJson(fetchedFile(info), {});
  state[branch] = new Date().toISOString();
  fs.mkdirSync(netDir(info), { recursive: true });
  atomicWrite(fetchedFile(info), JSON.stringify(state, null, 2) + "\n");
}

// Offline, origin/<branch> is only as fresh as the last root fetch. Missing or
// older than maxAgeMinutes → NeedsNetwork (fail closed, nothing touched).
export function requireFreshRef(root, info, branch, maxAgeMinutes, action) {
  const at = Date.parse(readJson(fetchedFile(info), {})[branch] || "");
  const have = spawnSync("git", ["-C", root, "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`], { encoding: "utf8" }).status === 0;
  const age = at ? (Date.now() - at) / 60000 : Infinity;
  if (have && age <= maxAgeMinutes) return;
  throw new NeedsNetwork(`origin/${branch} is ${have && at ? `${Math.round(age)} minutes old (limit ${maxAgeMinutes})` : "not fetched"} and this process cannot reach origin`, action);
}

export function readQueue(info) {
  let text = "";
  try { text = fs.readFileSync(queueFile(info), "utf8"); } catch { return []; }
  return text.split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}

function writeQueue(info, entries) {
  fs.mkdirSync(netDir(info), { recursive: true });
  atomicWrite(queueFile(info), entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : ""));
}

let counter = 0;

// Queue a plain push of <sha> to refs/heads/<dst> (never forced). The sha is
// pinned under refs/craftsman/pending so a deleted branch or removed temp
// worktree cannot lose it before root drains.
export function enqueuePush(root, info, { sha, dst, upstream = false, reason = "" }) {
  const id = `${Date.now().toString(36)}-${process.pid}-${counter++}`;
  const pin = `refs/craftsman/pending/${id}`;
  const result = spawnSync("git", ["-C", root, "update-ref", pin, sha], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`cannot pin ${sha} for deferred push: ${result.stderr}`);
  const entry = { id, kind: "push", dst, upstream, pin, sha, reason, queued_at: new Date().toISOString() };
  fs.mkdirSync(netDir(info), { recursive: true });
  fs.appendFileSync(queueFile(info), JSON.stringify(entry) + "\n");
  return entry;
}

export function enqueueDelete(info, branch) {
  const entry = { id: `${Date.now().toString(36)}-${process.pid}-${counter++}`, kind: "delete", dst: branch, queued_at: new Date().toISOString() };
  fs.mkdirSync(netDir(info), { recursive: true });
  fs.appendFileSync(queueFile(info), JSON.stringify(entry) + "\n");
  return entry;
}

export const pendingCount = (info) => readQueue(info).length;

// Root only. Replays the queue in order; an entry leaves the queue once it has
// pushed or origin refused it (`rejected`, for the caller to PARK). An auth or
// reachability failure stops the drain and keeps that entry and everything after.
export function drainQueue(root, info) {
  const entries = readQueue(info);
  const pushed = [];
  const rejected = [];
  let remaining = entries;
  for (const entry of entries) {
    try {
      if (entry.kind === "delete") {
        try { remote(root, ["push", "--quiet", "origin", "--delete", entry.dst]); } catch (error) { if (isUnreachable(error)) throw error; }
      } else {
        remote(root, ["push", "origin", `${entry.pin}:refs/heads/${entry.dst}`]);
        if (entry.upstream) spawnSync("git", ["-C", root, "branch", "--set-upstream-to", `origin/${entry.dst}`, entry.dst], { stdio: "ignore" });
        pushed.push(entry);
      }
    } catch (error) {
      if (isUnreachable(error)) {
        writeQueue(info, remaining);
        throw networkError(error);
      }
      rejected.push({ entry, error });
    }
    if (entry.pin) spawnSync("git", ["-C", root, "update-ref", "-d", entry.pin], { stdio: "ignore" });
    remaining = remaining.slice(1);
  }
  writeQueue(info, []);
  return { pushed, rejected };
}
