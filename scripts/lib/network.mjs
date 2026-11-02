// Network phase for repo-exec (ARCH-LAND-19). A sandboxed unit runner has no
// credentials and must never be given any, so every step that talks to the
// remote either runs in the root session (outside the sandbox) or is deferred:
// the runner does the local git work and queues the push; root drains the queue.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { atomicWrite, logEvent } from "./core.mjs";

const NET_ENV = { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_ASKPASS: "true", SSH_ASKPASS: "true" };

export const FIX = "run the network step from the root session OUTSIDE the sandbox (`repo-exec` action \"network\": step fetch before a run, step drain after it); unattended, auto mode passes it only through the user-scope autoMode.allow entry that `/craftsman:init --user-settings-diff` shows, and if the classifier refuses the call, stop, name this one command and park nothing; do not allowlist credential directories such as ~/.config/gh";

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
export function enqueuePush(root, info, { sha, dst, reason = "" }) {
  const id = `${Date.now().toString(36)}-${process.pid}-${counter++}`;
  const pin = `refs/craftsman/pending/${id}`;
  const result = spawnSync("git", ["-C", root, "update-ref", pin, sha], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`cannot pin ${sha} for deferred push: ${result.stderr}`);
  const entry = { id, kind: "push", dst, pin, sha, reason, queued_at: new Date().toISOString() };
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

// ARCH-LAND-36. Pure: {ok:true} or {ok:false, reason}. The queue is plain JSONL, so any process that can
// write the state directory can forge an entry; root judges each one before it touches origin or a local ref.
// A push goes to feat/ or feature/, or to base only in direct-land mode; a delete removes only a feat/ branch.
const PIN = /^refs\/craftsman\/pending\/[A-Za-z0-9_-]+$/;
const BAD_BRANCH = /[\x00-\x20\x7f~^:?*[\\]|\.\.|\/\/|@\{|^[-+./]|[./]$|\/\.|\.lock(?:\/|$)/;
const plainBranch = (name) => typeof name === "string" && name !== "@" && name.length > 0 && name.length <= 200 && !BAD_BRANCH.test(name) && !name.startsWith("refs/");

export function drainVerdict(entry, { baseBranch, directLand = false } = {}) {
  const refuse = (reason) => ({ ok: false, reason });
  const dst = entry?.dst;
  if (entry?.kind !== "push" && entry?.kind !== "delete") return refuse("unknown entry kind");
  if (!plainBranch(dst)) return refuse("dst is not a plain branch name");
  if (entry.kind === "delete") return dst.startsWith("feat/") && dst !== baseBranch ? { ok: true } : refuse("only a feat/ unit branch may be deleted");
  if (!PIN.test(String(entry.pin))) return refuse("pin is not a refs/craftsman/pending ref");
  if (dst.startsWith("feat/") || dst.startsWith("feature/")) return { ok: true };
  if (dst !== baseBranch) return refuse("dst is outside feat/ and feature/");
  return directLand ? { ok: true } : refuse("base is pushed only by a unit merge in direct-land mode (planning.featureBranches is on)");
}

// Root only. Replays the queue in order; an entry leaves the queue once it has
// pushed, was refused by drainVerdict, or origin refused it (`rejected`, for the
// caller to PARK; `refused` holds the verdict's reason). An auth or reachability
// failure stops the drain and keeps that entry and everything after.
export function drainQueue(root, info, { directLand = false } = {}) {
  const entries = readQueue(info);
  const pushed = [];
  const rejected = [];
  let remaining = entries;
  for (const entry of entries) {
    const verdict = drainVerdict(entry, { baseBranch: info.base_branch, directLand });
    if (!verdict.ok) {
      const state = info.project_root ? { root: info.project_root, stateDir: path.join(info.project_root, ".craftsman") } : null;
      logEvent({ ev: "drain_refused", project: info.project, kind: String(entry?.kind).slice(0, 40), dst: String(entry?.dst).slice(0, 200), reason: verdict.reason }, state);
      rejected.push({ entry, error: new Error(verdict.reason), refused: verdict.reason });
    } else {
      try {
        if (entry.kind === "delete") {
          try { remote(root, ["push", "--quiet", "origin", "--delete", entry.dst]); } catch (error) { if (isUnreachable(error)) throw error; }
        } else {
          remote(root, ["push", "origin", `${entry.pin}:refs/heads/${entry.dst}`]);
          pushed.push(entry);
        }
      } catch (error) {
        if (isUnreachable(error)) {
          writeQueue(info, remaining);
          throw networkError(error);
        }
        rejected.push({ entry, error });
      }
    }
    if (PIN.test(String(entry.pin))) spawnSync("git", ["-C", root, "update-ref", "-d", entry.pin], { stdio: "ignore" });
    remaining = remaining.slice(1);
  }
  writeQueue(info, []);
  return { pushed, rejected };
}
