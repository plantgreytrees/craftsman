// craftsman core engine.
// Node-only, zero npm dependencies (Claude Code already requires Node).
// Derived from the craftsman v0.2 engine. Fully stack-agnostic; behaviour is config-driven.
import { execFile, execFileSync } from "node:child_process";
import { applyUserConfig } from "./user-config.mjs";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { loadIndex, descendantSlugs } from "./plan-index.mjs";

const pexec = promisify(execFile);

export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// -------------------------------------------------------------- git root ---
// State anchors to the project root, never cwd (ARCH-STATE-01): a hook uses
// CLAUDE_PROJECT_DIR's toplevel; a Bash-run script reads the per-session pin
// SessionStart wrote, unless cwd is inside another repo (a fixture keeps its
// own root). A bare CLI falls back to cwd's toplevel.
function gitTop(dir) {
  try {
    return path.resolve(execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim()) || null;
  } catch { return null; }
}
function gitCommonDir(dir) {
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--git-common-dir"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out ? path.resolve(dir, out) : null;
  } catch { return null; }
}
const pinSid = (sid) => String(sid).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
export function rootPinPath(sid, tmp = os.tmpdir()) {
  return path.join(tmp, "craftsman-roots", pinSid(sid));
}
// The pins sit in the shared temp dir: trust a pin, and the craftsman-roots
// dir holding it, only when it is the real thing (lstat — no symlink), this
// user owns it, and neither group nor others can write it.
function ownedPrivate(p, kind) {
  const st = fs.lstatSync(p);
  if (kind === "dir" ? !st.isDirectory() : !st.isFile()) return false;
  if (typeof process.getuid !== "function") return true;
  return st.uid === process.getuid() && (st.mode & 0o022) === 0;
}
export function writeRootPin(sid, root, tmp = os.tmpdir()) {
  if (!sid || sid === "shared") return null;
  const file = rootPinPath(sid, tmp);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    if (!ownedPrivate(path.dirname(file), "dir")) return null;
    // Write-then-rename replaces a planted symlink rather than following it.
    const tmpFile = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, path.resolve(root) + "\n", { flag: "wx", mode: 0o600 });
    fs.renameSync(tmpFile, file);
    return file;
  } catch { return null; }
}
export function resolveProjectRoot({ env = process.env, cwd = process.cwd(), tmp = os.tmpdir() } = {}) {
  if (env.CLAUDE_PROJECT_DIR) {
    const projectDir = path.resolve(env.CLAUDE_PROJECT_DIR);
    const top = gitTop(projectDir);
    // Keep the harness's spelling when it is the toplevel (macOS /var vs
    // /private/var), so tool paths compare against the same prefix.
    let same = false;
    try { same = !!top && fs.realpathSync(projectDir) === fs.realpathSync(top); } catch {}
    return { root: same || !top ? projectDir : top, source: "project-dir" };
  }
  if (env.CLAUDE_CODE_SESSION_ID) {
    let pinned = null;
    try {
      const file = rootPinPath(env.CLAUDE_CODE_SESSION_ID, tmp);
      if (ownedPrivate(path.dirname(file), "dir") && ownedPrivate(file, "file")) pinned = fs.readFileSync(file, "utf8").trim();
    } catch {}
    if (pinned && fs.existsSync(pinned)) {
      const here = gitCommonDir(cwd);
      if (!here || here === gitCommonDir(pinned)) return { root: pinned, source: "session-pin" };
    }
  }
  return { root: gitTop(cwd) || path.resolve(cwd), source: "cwd" };
}
const RESOLVED_ROOT = resolveProjectRoot();
export const PROJECT_ROOT = RESOLVED_ROOT.root;
export const ROOT_SOURCE = RESOLVED_ROOT.source;

// Workspace mode is explicit. We never walk parent directories or enumerate
// sibling repositories looking for projects: that would be both expensive and
// an accidental context expansion in large workspaces.
export function workspaceManifestPath() {
  return process.env.CRAFTSMAN_WORKSPACE_MANIFEST
    ? path.resolve(process.env.CRAFTSMAN_WORKSPACE_MANIFEST)
    : path.join(PROJECT_ROOT, "craftsman.workspace.json");
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

export function loadWorkspaceManifest() {
  const file = workspaceManifestPath();
  if (!fs.existsSync(file)) return null;
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`invalid workspace manifest ${file}: ${error.message}`); }
  if (!value || value.version !== 1 || !value.projects || typeof value.projects !== "object") {
    throw new Error(`invalid workspace manifest ${file}: expected version 1 and projects`);
  }
  const workspaceRoot = fs.realpathSync(path.dirname(file));
  const projects = {};
  const roots = new Set();
  for (const [id, entry] of Object.entries(value.projects)) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`invalid workspace project id: ${id}`);
    if (!entry || typeof entry.root !== "string" || !entry.root.trim() || path.isAbsolute(entry.root)) {
      throw new Error(`workspace project ${id} needs a relative root`);
    }
    const lexical = path.resolve(workspaceRoot, entry.root);
    if (!isInside(workspaceRoot, lexical)) throw new Error(`workspace project ${id} escapes workspace root`);
    if (!fs.existsSync(lexical)) throw new Error(`workspace project ${id} does not exist: ${entry.root}`);
    const root = fs.realpathSync(lexical);
    if (!isInside(workspaceRoot, root)) throw new Error(`workspace project ${id} resolves outside workspace root`);
    // A superproject worktree carries its submodules as empty directories. Those are
    // listed but marked uninitialised, so a command that does not touch them still
    // loads; anything that needs one fails in resolveSelectedProject (ARCH-LAND-07).
    const initialized = isGitRoot(root);
    if (!initialized && fs.readdirSync(root).length) throw new Error(`workspace project ${id} is not a Git root`);
    if (roots.has(root)) throw new Error(`workspace projects share a root: ${id}`);
    roots.add(root);
    projects[id] = { id, root, initialized, relativeRoot: path.relative(workspaceRoot, root).split(path.sep).join("/"), declaredRoot: path.posix.normalize(entry.root.replaceAll("\\", "/")).replace(/^(\.\/)+/, "").replace(/\/+$/, "") };
  }
  return { file, workspaceRoot, projects };
}

// A plan unit may name its project by manifest id (`ui_nuxt`) or by the root path the
// manifest declares for it (`src/UI/ui_nuxt`). Returns the id, "." or null.
export function projectIdOf(manifest, ref) {
  if (!manifest || typeof ref !== "string" || !ref.trim()) return null;
  if (ref === ".") return ".";
  if (Object.hasOwn(manifest.projects, ref)) return ref;
  const wanted = path.posix.normalize(ref.replaceAll("\\", "/")).replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  if (!wanted || wanted === "." || wanted.startsWith("/") || wanted.startsWith("..")) return null;
  const hit = Object.values(manifest.projects).find((project) => project.relativeRoot === wanted || project.declaredRoot === wanted);
  return hit ? hit.id : null;
}

export function resolveSelectedProject(project = ".") {
  const manifest = loadWorkspaceManifest();
  if (!manifest) {
    if (project !== ".") throw new Error(`workspace project "${project}" requested but no workspace manifest is configured`);
    return { id: ".", root: PROJECT_ROOT, workspaceRoot: PROJECT_ROOT, manifest: null };
  }
  if (project === ".") return { id: ".", root: PROJECT_ROOT, workspaceRoot: manifest.workspaceRoot, manifest };
  const selected = manifest.projects[projectIdOf(manifest, project)];
  if (!selected) throw new Error(`unknown workspace project: ${project}`);
  if (selected.initialized === false) {
    throw new Error(`workspace project ${selected.id} is not checked out (an uninitialised submodule in this worktree): run \`git -C ${manifest.workspaceRoot} submodule update --init -- ${selected.relativeRoot}\``);
  }
  return { id: selected.id, root: selected.root, workspaceRoot: manifest.workspaceRoot, manifest };
}

export function projectContext(project = ".") {
  const selected = resolveSelectedProject(project);
  const stateDir = path.join(selected.root, ".craftsman");
  return { ...selected, stateDir, offFlag: path.join(stateDir, "off") };
}

export function isGitRoot(root) {
  try {
    // stderr ignored: outside a repo git's "fatal: not a git repository" would otherwise reach the user on every hook
    return execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === root;
  } catch { return false; }
}

// The main checkout that owns `root`, even when `root` is a linked worktree.
// Cross-session state (the tracker ledger, TRACKER.md) lives here, not in a
// worktree copy that drifts. A bare repo or non-git root keeps `root`.
const mainRoots = new Map();
export function mainCheckoutRoot(root = PROJECT_ROOT) {
  const key = path.resolve(root);
  if (mainRoots.has(key)) return mainRoots.get(key);
  let main = key;
  try {
    const listing = execFileSync("git", ["-C", key, "worktree", "list", "--porcelain"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    const [first] = listing.split(/\n\n/);
    const candidate = /^worktree (.+)$/m.exec(first)?.[1];
    if (candidate && !/^bare$/m.test(first) && fs.existsSync(candidate)) main = path.resolve(candidate);
  } catch { /* not a git checkout — the root is its own main */ }
  mainRoots.set(key, main);
  return main;
}

export async function git(args, context = null) {
  try { const { stdout } = await pexec("git", args, { cwd: context?.root || PROJECT_ROOT, maxBuffer: 8e6 }); return stdout; }
  catch { return ""; }
}

// All mutable per-repo state lives here (git-ignore it).
export const STATE_DIR = path.join(PROJECT_ROOT, ".craftsman");
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
export function sessionDir(sid, context = null) {
  return path.join(context?.stateDir || STATE_DIR, "sessions", sid);
}

// A marker is a regular file: `mkdir` can make a directory of the same name
// without writing anything, so a directory never counts (ARCH-SAFETY-05).
const isFlagFile = (file) => { try { return fs.statSync(file).isFile(); } catch { return false; } };
const grantMtime = (file) => { try { const st = fs.statSync(file); return st.isFile() ? st.mtimeMs : null; } catch { return null; } };
const grantTtl = (ttl) => typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0;

// Pure grant rule: the session's own marker lives for ttlMs, the global
// doc-write-pending marker for the shorter pendingTtlMs. A malformed TTL
// grants nothing.
export function grantValid({ pendingMtime, sessionMtime, now, pendingTtlMs, ttlMs }) {
  if (!grantTtl(pendingTtlMs) || !grantTtl(ttlMs)) return false;
  if (typeof pendingMtime === "number" && now - pendingMtime < pendingTtlMs) return true;
  return typeof sessionMtime === "number" && now - sessionMtime < ttlMs;
}

// The one doc-write authority check (ARCH-DOCS-07, ARCH-STATE-06): grants live
// at the root STATE_DIR (context.grantStateDir overrides, for tests). Read-only
// by default; with `claim` a pending grant is claimed into this session's
// marker and a held marker is refreshed, as the pre-guard needs.
export function hasDocWriteGrant({ sid, claim = false } = {}, context = null) {
  const guard = loadConfig(context).docWriteGuard || {};
  const stateDir = context?.grantStateDir ?? STATE_DIR;
  const marker = sid ? path.join(sessionDir(sidOf({ session_id: sid }), { stateDir }), "doc-write") : null;
  const pending = path.join(stateDir, "doc-write-pending");
  const now = Date.now();
  const opts = { now, pendingTtlMs: guard.pendingTtlMs ?? 1800000, ttlMs: guard.ttlMs ?? 3600000 };
  const sessionMtime = marker ? grantMtime(marker) : null;
  const held = grantValid({ ...opts, pendingMtime: null, sessionMtime });
  const ok = held || grantValid({ ...opts, pendingMtime: grantMtime(pending), sessionMtime: null });
  if (ok && claim && marker) {
    try {
      if (!held) {
        fs.mkdirSync(path.dirname(marker), { recursive: true });
        fs.writeFileSync(marker, `claimed ${new Date().toISOString()}\n`);
      } else {
        const t = new Date(); fs.utimesSync(marker, t, t);
      }
    } catch {}
  }
  return ok;
}
// Isolated fresh-context agents: one command invocation grants exactly one
// dispatch of its named agent, even under root-only agent mode — /scrutinise →
// `scrutineer`, /idea → `idea-critic`, /architect --deep → `architect-analyst`.
// orchestrate-scope-guard grants it, agent-mode-guard spends it by a rename
// only one caller can win.
export const GRANTED_AGENTS = ["scrutineer", "idea-critic", "architect-analyst"];
// Writer and spender compute the path from (sid, project id) on the pinned
// root alone — never from the caller's cwd or a sub-project's own state dir
// (ARCH-STATE-02, ARCH-STATE-06).
export function agentGrantFile(agent, sid, context = null) {
  const project = context?.id && context.id !== "." ? `@${context.id}` : "";
  return path.join(SESSIONS_DIR, sid, `${agent}-grant${project}`);
}
export function grantAgent(agent, sid, context = null) {
  const grant = agentGrantFile(agent, sid, context);
  try {
    fs.mkdirSync(path.dirname(grant), { recursive: true });
    fs.writeFileSync(grant, new Date().toISOString() + "\n");
  } catch {}
  return grant;
}
export function spendAgentGrant(agent, sid, context = null) {
  const grant = agentGrantFile(agent, sid, context);
  const spent = `${grant}.spent-${process.pid}-${Date.now()}`;
  try { fs.renameSync(grant, spent); } catch { return false; }
  try { fs.unlinkSync(spent); } catch {}
  return true;
}
// /auto's per-unit runners (ARCH-AUTO-06): a counted grant, not a flag — one
// unit needs several dispatches (implement, review rounds, close). The file
// holds the dispatches left; each spend takes exactly one. Same rename-first
// claim as spendAgentGrant, so two racing spenders never both take the last.
export const RUNNER_AGENTS = ["unit-runner", "implementer", "code-reviewer"];
// implement + up to 3 reviews + 2 fix rounds (ARCH-ENGINE-05) + land + park/block.
export const RUNNER_DISPATCHES_PER_UNIT = 8;
// +1 per feature for its land-feature call (ARCH-AUTO-08).
export const RUNNER_DISPATCHES_PER_FEATURE = 1;
export const runnerDispatchCount = (units, features = 0) =>
  Math.max(0, Math.floor(units)) * RUNNER_DISPATCHES_PER_UNIT + Math.max(0, Math.floor(features)) * RUNNER_DISPATCHES_PER_FEATURE;
export function grantRunnerDispatches(count, sid, context = null) {
  const grant = agentGrantFile("runner", sid, context);
  try {
    fs.mkdirSync(path.dirname(grant), { recursive: true });
    fs.writeFileSync(grant, `${Math.max(0, Math.floor(count))}\n`);
  } catch {}
  return grant;
}
// While another spender holds the grant (its `.spent-` file exists) the
// rename misses for a moment, so it is retried briefly before denying; with
// no holder, a missing grant denies at once.
const SPEND_RETRIES = 20;
const SPEND_RETRY_MS = 10;
function grantHeld(grant) {
  const prefix = `${path.basename(grant)}.spent-`;
  try { return fs.readdirSync(path.dirname(grant)).some((f) => f.startsWith(prefix)); } catch { return false; }
}
export function spendRunnerDispatch(sid, context = null) {
  const grant = agentGrantFile("runner", sid, context);
  const held = `${grant}.spent-${process.pid}-${Date.now()}`;
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(grant, held); break; }
    catch {
      if (attempt >= SPEND_RETRIES || !grantHeld(grant)) return false;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SPEND_RETRY_MS);
    }
  }
  let left = 0;
  try { left = Number.parseInt(fs.readFileSync(held, "utf8"), 10) || 0; } catch {}
  try {
    if (left > 1) fs.writeFileSync(held, `${left - 1}\n`), fs.renameSync(held, grant);
    else fs.unlinkSync(held);
  } catch {}
  return left >= 1;
}
// /auto's marker (ARCH-AUTO-06, ARCH-LAND-05): `{plan, at}` in the root
// session dir, never live past a day. Runner grants (autoActive) need a
// PENDING/IN_PROGRESS row or no rows yet; the force block (autoForceBlock)
// also holds while PARKED/BLOCKED rows await Phase C, until every row lands.
export const AUTO_MARKER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// FEATURE_MERGED is still open: the feature is not landed (ARCH-AUTO-08).
const OPEN_STATUSES = new Set(["PENDING", "IN_PROGRESS", "FEATURE_MERGED"]);
const LANDED_STATUSES = new Set(["MERGED", "COMPLETE"]);
export const autoMarkerFile = (sid) => path.join(sessionDir(sid), "auto-active");
// The plan slug a command's arguments name: its first non-flag word, with an
// optional docs/plans/ prefix and .md suffix. null when it isn't slug-shaped.
export function planSlugOf(args) {
  const slug = (String(args || "").trim().split(/\s+/).find((a) => !a.startsWith("-")) || "")
    .replace(/^docs\/plans\//, "").replace(/\.md$/, "");
  return /^[A-Za-z0-9._-]+$/.test(slug) ? slug : null;
}
export function writeAutoMarker(sid, plan, at = new Date().toISOString()) {
  const file = autoMarkerFile(sid);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ plan: plan || null, at }) + "\n");
  } catch {}
  return file;
}
export function readAutoMarker(sid) {
  try {
    const marker = JSON.parse(fs.readFileSync(autoMarkerFile(sid), "utf8"));
    return marker && typeof marker === "object" && Number.isFinite(Date.parse(marker.at)) ? marker : null;
  } catch { return null; } // absent, or a legacy timestamp-only marker
}
// A slug resolves through plan-index: an epic or story owns its descendants'
// rows (ARCH-AUTO-09). An unindexed slug stands for itself.
function planSlugs(plan, context) {
  try {
    const root = mainCheckoutRoot(context?.root || PROJECT_ROOT);
    const index = loadIndex(root);
    if (index.get(plan)) return new Set([plan, ...descendantSlugs(plan, { index })]);
  } catch {}
  return new Set([plan]);
}
function planStatuses(plan, context) {
  const slugs = planSlugs(plan, context);
  const ledger = path.join(mainCheckoutRoot(context?.root || PROJECT_ROOT), ".craftsman", "tracker", "events.jsonl");
  const latest = new Map();
  let text = "";
  try { text = fs.readFileSync(ledger, "utf8"); } catch { return []; }
  for (const line of text.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (slugs.has(planSlugOf(event.plan))) latest.set(event.key, event.status);
    } catch {}
  }
  return [...latest.values()];
}
function autoMarkerHolds(sid, context, now, holds) {
  const marker = readAutoMarker(sid);
  if (!marker || now - Date.parse(marker.at) > AUTO_MARKER_MAX_AGE_MS) return false;
  if (!marker.plan) return true;
  const statuses = planStatuses(marker.plan, context);
  return !statuses.length || statuses.some(holds);
}
export const autoActive = (sid, context = null, now = Date.now()) =>
  autoMarkerHolds(sid, context, now, (status) => OPEN_STATUSES.has(status));
export const autoForceBlock = (sid, context = null, now = Date.now()) =>
  autoMarkerHolds(sid, context, now, (status) => !LANDED_STATUSES.has(status));

export const scrutineerGrantFile =(sid, context = null) => agentGrantFile("scrutineer", sid, context);
export const grantScrutineer = (sid, context = null) => grantAgent("scrutineer", sid, context);
export const spendScrutineerGrant = (sid, context = null) => spendAgentGrant("scrutineer", sid, context);
export function sharedStateDir(context = null) {
  try {
    const commonGitDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: context?.root || PROJECT_ROOT, encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"], // outside a repository git says so on stderr, which a denial must not carry
    }).trim();
      if (commonGitDir) return path.resolve(path.resolve(context?.root || PROJECT_ROOT, commonGitDir), ".craftsman");
  } catch {}
  return context?.stateDir || STATE_DIR;
}
export function worktreeBindingPath(input, context = null) {
  const selected = context || (input?.project ? projectContext(input.project) : null);
  const worktree = input?.worktree_path || selected?.worktreePath || selected?.root || PROJECT_ROOT;
  const suffix = sha1(path.resolve(worktree)).slice(0, 16);
  return path.join(sharedStateDir(selected), "sessions", sidOf(input), `${suffix}-worktree-binding.json`);
}
export function readWorktreeBinding(input, context = null) {
  try { return JSON.parse(fs.readFileSync(worktreeBindingPath(input, context), "utf8")); }
  catch { return null; }
}
export function readWorktreeBindings(input, context = null) {
  const dir = path.dirname(worktreeBindingPath(input, context));
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith("-worktree-binding.json"))
      .map((name) => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); }
        catch { return null; }
      })
      .filter((binding) => binding?.session_id === sidOf(input));
  } catch { return []; }
}
export function writeWorktreeBinding(input, binding, context = null) {
  atomicWrite(worktreeBindingPath(input, context), JSON.stringify(binding, null, 2) + "\n");
}
export function clearWorktreeBinding(input, context = null) {
  try { fs.unlinkSync(worktreeBindingPath(input, context)); } catch {}
}

// Session-owned worktree ledger: repo-exec records each worktree it prepares
// and forgets it on cleanup; the Stop sweep touches only these, never another
// session's or the human's. Best-effort — a missing ledger means "owns nothing".
export function sessionWorktreeLedgerPath(input, context = null) {
  const selected = context || (input?.project ? projectContext(input.project) : null);
  return path.join(sharedStateDir(selected), "sessions", sidOf(input), "worktrees.json");
}
export function readSessionWorktrees(input, context = null) {
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionWorktreeLedgerPath(input, context), "utf8"));
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch { return []; }
}
export function recordSessionWorktree(input, worktree, context = null) {
  try {
    const resolved = path.resolve(worktree);
    const current = readSessionWorktrees(input, context);
    if (current.includes(resolved)) return;
    atomicWrite(sessionWorktreeLedgerPath(input, context), JSON.stringify([...current, resolved], null, 2) + "\n");
  } catch { /* best-effort ledger — never break the worktree lifecycle */ }
}
export function forgetSessionWorktree(input, worktree, context = null) {
  try {
    const resolved = path.resolve(worktree);
    const current = readSessionWorktrees(input, context);
    const remaining = current.filter((entry) => entry !== resolved);
    if (remaining.length === current.length) return;
    atomicWrite(sessionWorktreeLedgerPath(input, context), JSON.stringify(remaining, null, 2) + "\n");
  } catch { /* best-effort ledger — never break the worktree lifecycle */ }
}

// Acceptance criteria (.craftsman/acceptance.md). A session "owns" the file
// when its recorded identity matches — the Stop gate then enforces it. The
// identity covers the criteria, not their tick state, so a tick by sed keeps
// ownership while a concurrent rewrite of the criteria still changes it.
const ACCEPTANCE_LINE = /^(\s*[-*]\s*)\[([ xX])\]/;
export function acceptancePath(context = null) {
  return path.join((context || projectContext(".")).stateDir, "acceptance.md");
}
export function acceptanceIdentity(text) {
  return sha1(String(text).split("\n").map((l) => l.replace(ACCEPTANCE_LINE, "$1[ ]").trimEnd()).join("\n").trim());
}
export function recordAcceptanceOwnership(sid, context = null) {
  const ac = fs.readFileSync(acceptancePath(context), "utf8");
  atomicWrite(path.join(sessionDir(sid, context), "acceptance.ref"),
    JSON.stringify({ hash: sha1(ac.trim()), identity: acceptanceIdentity(ac), ts: Date.now() }));
}
export function ownsAcceptance(sid, text, context = null) {
  try {
    const ref = JSON.parse(fs.readFileSync(path.join(sessionDir(sid, context), "acceptance.ref"), "utf8"));
    return ref.identity ? ref.identity === acceptanceIdentity(text) : ref.hash === sha1(String(text).trim());
  } catch { return false; }
}
// Every criterion as { line, unit, feature, plan, done }. Leading tags, any
// order: `[unit:<id>]` one plan unit, `[feature:<id>]` one feature's
// land-feature (ARCH-TRACKER-08), `[plan:<slug>]` one whole plan (ARCH-TRACKER-15).
export function acceptanceCriteria(text) {
  return String(text).split("\n").filter((l) => ACCEPTANCE_LINE.test(l)).map((line) => {
    const tags = {};
    for (let rest = line.replace(ACCEPTANCE_LINE, ""), m; (m = /^\s*\[(unit|feature|plan):([^\]\s]+)\]/.exec(rest)); rest = rest.slice(m[0].length)) tags[m[1]] ??= m[2];
    return { line: line.trim(), unit: tags.unit || null, feature: tags.feature || null,
      plan: tags.plan ? planSlugOf(tags.plan) : null, done: ACCEPTANCE_LINE.exec(line)[2] !== " " };
  });
}
// A feature's land-feature criteria: its `[feature:<id>]` lines, plus untagged
// ones when it is the last feature; with `plan`, another plan's line never matches.
export function featureCriteria(text, featureId, isLast = false, plan = null) {
  const mine = plan == null ? null : planSlugOf(plan);
  return acceptanceCriteria(text).filter((c) => !(mine != null && c.plan != null && c.plan !== mine) &&
    (c.feature != null ? c.feature === String(featureId) : isLast && !c.unit));
}
export function uncheckedAcceptance(text) {
  return acceptanceCriteria(text).filter((c) => !c.done);
}

// Claude Code's own config dir: transcripts under projects/, live sessions
// under sessions/<pid>.json.
export const claudeHome = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");

// The pid of a still-running Claude Code session, or null. A process we may
// not signal (EPERM) is alive.
export function liveClaudeSession(sid) {
  const dir = path.join(claudeHome(), "sessions");
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")); } catch { return null; }
  for (const name of names) {
    let record;
    try { record = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { continue; }
    if (record?.sessionId !== sid || !Number.isInteger(record.pid)) continue;
    try { process.kill(record.pid, 0); return record.pid; }
    catch (error) { if (error.code === "EPERM") return record.pid; }
  }
  return null;
}

export function atomicWrite(file, data, { mode } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, mode ? { mode } : undefined);
  fs.renameSync(tmp, file); // rename is atomic on the same filesystem
}
export function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
export function pruneSessions(maxAgeMs = 7 * 24 * 3600 * 1000, context = null) {
  const sessionsDir = context?.stateDir
    ? path.join(context.stateDir, "sessions")
    : SESSIONS_DIR;
  try {
    for (const d of fs.readdirSync(sessionsDir)) {
      const p = path.join(sessionsDir, d);
      try { if (Date.now() - fs.statSync(p).mtimeMs > maxAgeMs) fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  } catch { /* no sessions dir yet */ }
}

// ---------------------------------------------------------------- config ---

// The project config files loadConfig merges over the defaults, in order (run.sh scans the same list for protectedPaths; launcher.test pins that).
export const PROJECT_CONFIG_FILES = ["craftsman.config.json", "craftsman.project.json"];
export function loadConfig(context = null) {
  const defaults = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "craftsman.config.json"), "utf8")
  );
  // The project's own values: craftsman.config.json, then craftsman.project.json over it. The second file exists for a repo
  // whose craftsman.config.json IS the shipped default (this plugin's own), which cannot hold project-only values.
  // An absent file adds nothing; a malformed one is ignored with a warning.
  const root = context?.root || PROJECT_ROOT;
  let merged = applyUserConfig(defaults, process.env);
  for (const name of PROJECT_CONFIG_FILES) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      merged = deepMerge(merged, JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (e) {
      warn(`ignoring malformed ./${name}: ${e.message}`);
    }
  }
  return merged;
}

export function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k]
      ? deepMerge(a[k], v)
      : v;
  }
  return out;
}

// ------------------------------------------------------------ kill switch ---

// A session opened above a repo (CLAUDE_PROJECT_DIR is not a git root) works
// only through a registered workspace manifest (ARCH-STATE-01): without one
// there is no project to anchor state to, so craftsman stays off.
const unanchored = new Map();
export function rootUnanchored(root = PROJECT_ROOT) {
  const key = path.resolve(root);
  if (!unanchored.has(key)) unanchored.set(key, !isGitRoot(key) && !fs.existsSync(workspaceManifestPath()));
  return unanchored.get(key);
}
export function enabled(cfg, context = null) {
  const env = (process.env.CRAFTSMAN || "").toLowerCase();
  if (env === "off" || env === "0" || env === "false") return false;
  if (ROOT_SOURCE === "project-dir" && rootUnanchored()) return false;
  if (isFlagFile(context?.offFlag || OFF_FLAG)) return false;
  return cfg.enabled !== false;
}

// ARCH-SAFETY-05/08: the safety hooks (pre-guard, agent-mode-guard) have one off switch, and it is the
// user's own environment. CRAFTSMAN=off, .craftsman/off and `enabled:false` in the config switch off
// the quality, doc and tracker machinery only: a tool call could set the last two. Not being in a git
// repository switches off that same machinery and leaves safety on, because an unanchored session is
// exactly where nothing else is watching.
export function safetyEnabled(env = process.env) {
  return String(env.CRAFTSMAN_SAFETY || "").toLowerCase() !== "off";
}

// The orchestration plumbing that keeps state per project (scope activation, the scope-required flag,
// command markers): safety, but meaningless without a repo to anchor state to (ARCH-STATE-01), so it
// writes nothing for an unanchored root.
export function orchestrationEnabled(env = process.env) {
  return safetyEnabled(env) && !(ROOT_SOURCE === "project-dir" && rootUnanchored());
}

// Which craftsman command ran in a session, and by which route ("prompt" = the user typed it,
// "skill" = a Skill tool call). The doc writers and /toggle are told to run doc-write.mjs and
// toggle.mjs; pre-guard lets those scripts through only after the command that owns them.
export const DOC_WRITER_COMMANDS = ["plan", "orchestrate", "auto", "sync-docs", "idea", "architect", "builtin-check"];
// `instruction` writes nothing under docs/, so it is not a doc writer; it is recorded because goal-token.mjs mints only after it (or /auto).
export const RECORDED_COMMANDS = [...DOC_WRITER_COMMANDS, "toggle", "instruction"];
const COMMAND_TTL_MS = 3600000;
const commandsFile = (sid, context) => path.join(sessionDir(sidOf({ session_id: sid }), context), "commands.json");
export function recordCommand(sid, command, via, context = null) {
  const file = commandsFile(sid, context);
  let known = {};
  try { known = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  // The user's typed command outranks a model's Skill call for the same command while it is fresh.
  const held = known[command];
  if (via !== "prompt" && held?.via === "prompt" && Date.now() - Date.parse(held.at) < COMMAND_TTL_MS) return;
  known[command] = { via, at: new Date().toISOString() };
  atomicWrite(file, JSON.stringify(known) + "\n");
}
export function commandInvoked(sid, names, { context = null, via = null, ttlMs = COMMAND_TTL_MS, now = Date.now() } = {}) {
  let known;
  try { known = JSON.parse(fs.readFileSync(commandsFile(sid, context), "utf8")); } catch { return false; }
  return names.some((name) => {
    const entry = known?.[name];
    return entry && (!via || entry.via === via) && now - Date.parse(entry.at) < ttlMs;
  });
}

// ARCH-SAFETY-05: the authority scripts (doc-write.mjs on, toggle.mjs off, goal-token.mjs) trust the session id from their
// environment, which any process can set. pre-guard alone knows the real session of the tool call, so when it lets such a
// command through it leaves a one-shot nonce for that session and script, and the script consumes it. A script started any
// other way (an interpreter, a spawned child, a borrowed id) finds none and refuses. Nothing skips it: not the script's own
// environment and not a file, because anything a child process or another session can set or lend would be a way round. Under
// CRAFTSMAN_SAFETY=off pre-guard enforces nothing, so doc-write.mjs is a no-op there rather than a bypass (see that script).
const NONCE_TTL_MS = 60000;
const nonceFile = (sid, name, context) => path.join(sessionDir(sidOf({ session_id: sid }), context), `nonce-${name}`);
export function mintNonce(sid, name, { context = null, now = Date.now() } = {}) {
  try { atomicWrite(nonceFile(sid, name, context), `${now}\n`); } catch { /* no state dir: the script will refuse, which is the safe side */ }
}
export function consumeNonce(sid, name, { context = null, now = Date.now(), ttlMs = NONCE_TTL_MS } = {}) {
  const file = nonceFile(sid, name, context);
  let minted;
  try { minted = Number(fs.readFileSync(file, "utf8")); fs.unlinkSync(file); } catch { return false; }
  return Number.isFinite(minted) && now - minted >= 0 && now - minted < ttlMs;
}

// ARCH-SAFETY-04: an advisory hook still fails open on bad input, but never silently. The
// first skip of each hook in a session says so; later ones stay quiet. The input is bad, so the
// session id comes from the environment, not from stdin.
export function advisorySkipped(hook, reason, { env = process.env, stateDir = STATE_DIR } = {}) {
  const marker = path.join(sessionDir(sidOf({ session_id: env.CLAUDE_CODE_SESSION_ID }), { stateDir }), `advisory-skipped-${hook}`);
  if (fs.existsSync(marker)) return false;
  try { atomicWrite(marker, String(Date.now())); } catch { /* no state dir: the notice still goes out, once per call */ }
  process.stdout.write(JSON.stringify({ systemMessage: `craftsman: ${hook} skipped (${reason}), advisory only` }) + "\n");
  return true;
}

// hooks/run.sh names its once-per-session marker after the session id, or "shared" when the id
// holds anything but [A-Za-z0-9_-]. Same rule here, so SessionStart finds the marker it left.
export const launcherMarker = (sid, tmp = os.tmpdir()) => path.join(
  tmp, `craftsman-launcher-${process.getuid?.() ?? 0}`, `node-missing-${/^[A-Za-z0-9_-]+$/.test(String(sid || "")) ? sid : "shared"}`);

// Which of the project config files hold a value (`test` on its parsed content), as "a.json and b.json" for a message.
function projectFilesSetting(context, test) {
  const root = context?.root || PROJECT_ROOT;
  const names = PROJECT_CONFIG_FILES.filter((name) => {
    try { return Boolean(test(JSON.parse(fs.readFileSync(path.join(root, name), "utf8")))); } catch { return false; }
  });
  return names.join(" and ");
}

/** Why craftsman is not fully running, as short reasons (SessionStart). `safety` lists what turns
 * the guards off; `quality` lists what turns off only the quality, doc and tracker machinery. */
export function guardState({ cfg, context = null, env = process.env, tmp = os.tmpdir(), sid } = {}) {
  const safety = [];
  const quality = [];
  if (["off", "0", "false"].includes(String(env.CRAFTSMAN || "").toLowerCase())) quality.push("CRAFTSMAN=off is set in the environment");
  if (isFlagFile(context?.offFlag || OFF_FLAG)) quality.push(".craftsman/off exists");
  if (cfg?.enabled === false) quality.push(`enabled is false in ${projectFilesSetting(context, (c) => c?.enabled === false) || "the project config"}`);
  if (String(env.CRAFTSMAN_SAFETY || "").toLowerCase() === "off") safety.push("CRAFTSMAN_SAFETY=off is set in the environment");
  if (fs.existsSync(launcherMarker(sid, tmp))) safety.push("node was missing earlier this session (hooks/run.sh left its marker)");
  return { safety, quality };
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

export function isIgnored(file, cfg, lang, context = null) {
  const rel = path.relative(context?.root || PROJECT_ROOT, file).split(path.sep).join("/");
  const pats = [...(cfg.ignore || []), ...((lang && lang.ignore) || [])];
  return pats.some((p) => globToRe(p).test(rel) || globToRe(p).test("./" + rel));
}

export function detectLang(file, cfg, context = null) {
  const ext = path.extname(file);
  const base = path.basename(file);
  const root = context?.root || PROJECT_ROOT;
  const rel = path.relative(root, file).split(path.sep).join("/");
  for (const [name, spec] of Object.entries(cfg.languages)) {
    if ((spec.extensions || []).includes(ext)) return { name, ...spec };
    if ((spec.filenames || []).includes(base)) return { name, ...spec };
    if ((spec.paths || []).some((glob) => globToRe(glob).test(rel))) return { name, ...spec };
  }
  return null;
}

// ------------------------------------------------------------ repo markers ---
// Cached tracked-plus-untracked-not-ignored file listing, for stack markers
// at any depth (a nested .csproj, a fresh go.mod) and any caller needing it.
const _gitFiles = new Map();
// `{ fresh: true }` forces a recompute (tests exercising freshly-changed
// on-disk state within one process); every real caller uses the default,
// memoized read.
export async function gitTrackedFiles({ fresh = false, context = null } = {}) {
  const root = context?.root || PROJECT_ROOT;
  if (_gitFiles.has(root) && !fresh) return _gitFiles.get(root);
  const out = await git(["ls-files", "--others", "--cached", "--exclude-standard"], context);
  const files = out.split("\n").map((s) => s.trim()).filter(Boolean);
  _gitFiles.set(root, files);
  return files;
}

/** Does `marker` (a literal filename or a `*`-glob like "*.csproj") exist
 * anywhere in the repo? Prefers the tracked-plus-untracked-not-ignored file
 * list (works at any depth, respects .gitignore, one process spawn total);
 * falls back to a shallow multi-level directory walk when there's no git repo
 * to ask. */
export async function markerPresent(marker, context = null) {
  const root = context?.root || PROJECT_ROOT;
  const files = await gitTrackedFiles({ context });
  if (files.length) {
    if (marker.includes("*")) {
      const re = globToRe(marker.includes("/") ? marker : "**/" + marker);
      return files.some((f) => re.test(f));
    }
    return files.some((f) => f === marker || f.endsWith("/" + marker));
  }
  // Non-git fallback: shallow walk (depth 3) from PROJECT_ROOT.
  const re = marker.includes("*")
    ? new RegExp("^" + marker.replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$")
    : null;
  const matches = (name) => (re ? re.test(name) : name === marker);
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    for (const e of entries) {
      if (matches(e.name)) return true;
      if (depth > 0 && e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")) {
        if (walk(path.join(dir, e.name), depth - 1)) return true;
      }
    }
    return false;
  };
  return walk(root, 2);
}

// --------------------------------------------------------------- runners ---

// Warn only once per process when the probe binary itself (which/where) is
// missing — distinct from the probe running and simply not finding `bin`.
let warnedProbeMissing = false;
async function which(bin) {
  const probeBin = process.platform === "win32" ? "where" : "which";
  try { await pexec(probeBin, [bin]); return true; }
  catch (e) {
    if (e.code === "ENOENT") {
      if (!warnedProbeMissing) {
        warnedProbeMissing = true;
        warn(`${probeBin} not found — tool presence checks will report every tool as absent`);
      }
    }
    return false;
  }
}

// Exported so session-context.mjs's batch tool-probe loop can share this
// exact presence-check + cache instead of reimplementing the platform-branch
// and ENOENT-distinction logic above.
const whichCache = new Map();
export async function have(bin) {
  if (!whichCache.has(bin)) whichCache.set(bin, await which(bin));
  return whichCache.get(bin);
}

// Quote-aware token split shared by tokenize() (per-file {file}/{dir}
// substitution) and splitCmd() (no per-file template — a plain configured
// command like a secrets scan or an extraCheck).
function splitTokens(str) {
  const raw = str.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return raw.map((tok) => tok.replace(/^["']|["']$/g, ""));
}

export function tokenize(cmdTemplate, file, context = null) {
  const rel = path.relative(context?.root || PROJECT_ROOT, file) || file;
  const dir = path.dirname(rel);
  // Substitute per-token so a {file}/{dir} value containing a space still
  // becomes exactly one argument, instead of splitting the path in two.
  return splitTokens(cmdTemplate).map((tok) =>
    tok.replaceAll("{file}", rel).replaceAll("{dir}", dir)
  );
}

/** Quote-aware split for a configured command with no per-file template
 * (stop-gate.mjs's secrets/test/extraChecks commands, snapshot.mjs's test
 * commands) — same quoting rules as tokenize(), minus the {file}/{dir}
 * substitution these call sites have no use for. */
export function splitCmd(str) {
  return splitTokens(str);
}

async function runOne(cmdTemplate, file, timeoutMs, context = null) {
  const [bin, ...args] = tokenize(cmdTemplate, file, context);
  if (!(await have(bin))) return { skipped: true, bin };
  try {
    const { stdout, stderr } = await pexec(bin, args, {
      timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, cwd: context?.root || PROJECT_ROOT,
    });
    return { ok: true, out: (stdout + stderr).trim(), bin };
  } catch (e) {
    if (e.killed) return { ok: false, timedOut: true, bin, out: `${bin}: timed out` };
    // A tool that could not start, was killed by a signal or exited 126+ (not executable, not found,
    // a crash) failed itself; it says nothing about the file.
    if (typeof e.code === "string" || e.signal || (typeof e.code === "number" && e.code >= 126)) return { skipped: true, unavailable: true, bin };
    return {
      ok: false, bin, out: ((e.stdout || "") + (e.stderr || "")).trim() || e.message,
      stdout: e.stdout || "", code: e.code,
    };
  }
}

/** eslint's `--format json` output as the `path:line:col: message
 * [Error/rule-id]` lines the baseline and `extractSig` already key on (the
 * shape of the `unix` formatter eslint 9 removed). `null` when the text is not
 * eslint's JSON, so a crash can never be read as findings. */
export function parseEslintJson(text) {
  let files;
  try { files = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(files)) return null;
  const lines = [];
  for (const f of files) {
    if (!f || typeof f.filePath !== "string" || !Array.isArray(f.messages)) return null;
    for (const m of f.messages) {
      const severity = m.severity === 2 ? "Error" : "Warning";
      lines.push(`${f.filePath}:${m.line ?? 1}:${m.column ?? 1}: ${m.message} [${severity}${m.ruleId ? `/${m.ruleId}` : ""}]`);
    }
  }
  return lines;
}

const usesEslintJson = (bin, cmdTemplate) => /(^|[\\/])eslint(\.cmd)?$/.test(bin) && /(--format|-f)[ =]json\b/.test(cmdTemplate);

// An eslint JSON run is a finding only when it exited 1 with parseable JSON that
// holds messages. Exit 2, a crash or unparseable output means the tool itself
// failed: unavailable, never something the model must fix.
function normalizeEslintJson(result) {
  if (result.ok !== false || result.timedOut) return result;
  const lines = result.code === 1 ? parseEslintJson(result.stdout) : null;
  if (lines === null) return { skipped: true, unavailable: true, bin: result.bin };
  return lines.length ? { ...result, out: lines.join("\n") } : { ok: true, out: "", bin: result.bin };
}

/** Run format commands (best-effort, silent) then checks in parallel.
 * `failures` excludes timeouts — a slow tool on a big file isn't a defect
 * the model introduced, so it's reported separately and never blocks.
 * `unavailable` lists tools that crashed; `skipBins` names tools already known
 * to be unavailable this session, which are not run again. */
export async function runChecks(file, lang, cfg, context = null, { skipBins = [] } = {}) {
  const t0 = Date.now();
  for (const f of lang.format || []) await runOne(f, file, cfg.timeoutMs ?? 20000, context);

  const results = await Promise.all(
    (lang.check || []).map(async (c) => {
      const [bin] = tokenize(c, file, context);
      if (skipBins.includes(bin)) return { skipped: true, bin };
      const result = await runOne(c, file, cfg.timeoutMs ?? 20000, context);
      return usesEslintJson(bin, c) ? normalizeEslintJson(result) : result;
    })
  );
  const failures = results.filter((r) => r.ok === false && !r.timedOut);
  const timedOut = results.filter((r) => r.timedOut).map((r) => r.bin);
  const skipped = results.filter((r) => r.skipped).map((r) => r.bin);
  const unavailable = results.filter((r) => r.unavailable).map((r) => r.bin);
  return { failures, timedOut, skipped, unavailable, ms: Date.now() - t0 };
}

// ----------------------------------------------------------- diff filter ---

/** Keep only findings whose text is new relative to the recorded baseline. */
export function filterBaseline(file, findings, context = null) {
  const key = crypto.createHash("md5").update(path.resolve(file)).digest("hex").slice(0, 12);
  const bpath = path.join(context?.stateDir || STATE_DIR, "baseline", key + ".txt");
  if (!fs.existsSync(bpath)) return findings;
  const base = new Set(fs.readFileSync(bpath, "utf8").split("\n").map(normLine));
  return findings.filter((l) => !base.has(normLine(l)));
}

export function writeBaseline(file, lines, context = null) {
  const baselineDir = path.join(context?.stateDir || STATE_DIR, "baseline");
  fs.mkdirSync(baselineDir, { recursive: true });
  const key = crypto.createHash("md5").update(path.resolve(file)).digest("hex").slice(0, 12);
  fs.writeFileSync(path.join(baselineDir, key + ".txt"), lines.join("\n"));
}

// collapse to one line and cap length for a markdown table cell; escape "|"
// so a finding message can never break the table's column structure
function tableSafe(s, maxLen = 90) {
  const oneLine = String(s).replace(/\s+/g, " ").trim();
  const cut = oneLine.length > maxLen ? oneLine.slice(0, maxLen - 1) + "…" : oneLine;
  return cut.replace(/\|/g, "\\|");
}

/** Render the "known pre-existing issues" doc `/craftsman:baseline` writes to
 * `docs/errors/` — the baselined findings the quality gate is intentionally
 * NOT reporting again, made visible instead of silently disappearing into the
 * gitignored `.craftsman/baseline/` snapshot. Pure function of the entries
 * baseline.mjs collects (`{ rel, lang, tools, count, sample }`) plus the run
 * date, so the table's exact shape is unit-testable without touching disk. */
export function renderKnownIssuesDoc(entries, dateStr) {
  if (!entries.length) {
    return `# Known pre-existing issues\n\n` +
      `> Auto-generated by \`/craftsman:baseline\` — last run ${dateStr}. Not hand-edited: ` +
      `regenerated on every baseline run.\n\n` +
      `No pre-existing issues found as of the last baseline run.\n`;
  }
  const sorted = [...entries].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, e) => s + e.count, 0);
  const rows = sorted.map((e) =>
    `| \`${e.rel}\` | ${e.lang} | ${e.tools.join(", ")} | ${e.count} | ${tableSafe(e.sample)} |`
  ).join("\n");
  return `# Known pre-existing issues

> Auto-generated by \`/craftsman:baseline\` — last run ${dateStr}. These are
> lint/type findings that already existed in this repo when craftsman started
> tracking it (or as of the last large cleanup); the quality gate intentionally
> does not report them again as "new," so they are recorded here instead of
> silently disappearing. **Not hand-edited** — this file is regenerated
> wholesale on every \`/craftsman:baseline\` run. Track follow-up work (an
> owner, a ticket, a priority) elsewhere and link back to a row here if useful.

${entries.length} file(s), ${total} finding(s) total, sorted worst-first.

| File | Language | Tool(s) | Findings | Sample |
|---|---|---|---:|---|
${rows}
`;
}

// strip line/col numbers so an unrelated edit that shifts lines doesn't
// resurrect every pre-existing finding as "new"
export function normLine(l) {
  return l.replace(/:\d+(:\d+)?/g, ":N").replace(/\s+/g, " ").trim();
}

// Normalize a path for comparison: forward slashes, no leading "./" — go
// vet's `./{dir}` package-spec convention means its own output can carry a
// "./" prefix `rel` never does, and different tools resolve paths relative
// to slightly different bases, so exact string equality isn't reliable here.
function normPath(p) {
  return p.split(path.sep).join("/").replace(/^\.\//, "");
}

/** For project/package-scoped checks (whole-crate clippy, `go vet ./pkg`,
 * staticcheck) whose output can legitimately name a sibling file, not just
 * the one that was edited: keep only lines attributable to `rel` — a line
 * with no recognizable "path:line" prefix can't be attributed, so it's
 * dropped rather than risked as a false attribution to the edited file.
 * Matched by path suffix (not exact equality) since a tool may resolve the
 * path relative to a different base than `rel`'s — erring toward keeping a
 * real finding over losing it to a base-path mismatch this can't observe. */
export function filterAttributed(lines, rel) {
  const relNorm = normPath(rel);
  return lines.filter((l) => {
    const m = l.match(/^(\S[^:]*):\d+/);
    if (!m) return false;
    const lineNorm = normPath(m[1]);
    return lineNorm === relNorm || lineNorm.endsWith("/" + relNorm) || relNorm.endsWith("/" + lineNorm);
  });
}

// ---------------------------------------------------------------- caching ---

export function cacheKey(file, lang, cfg) {
  const content = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  return crypto.createHash("sha1")
    .update(content)
    .update(lang.name)
    .update(JSON.stringify(lang.check || []))
    // Deliberate allow-list, not every lang.* field: extensions/ignore don't
    // affect check/format output, so a future field that does needs a human
    // decision to add it here, not silent omission.
    .update(JSON.stringify(lang.format || []))
    .update(String(!!lang.projectScoped))
    // invalidate the cache whenever config changes, so edits to checks,
    // noise filters or ignore rules take effect immediately
    .update(JSON.stringify({ n: cfg.noisePatterns, i: cfg.ignore, b: cfg.baselineNewOnly }))
    .digest("hex");
}

export function cacheHit(key, context = null) {
  return fs.existsSync(path.join(context?.stateDir || STATE_DIR, "cache", key));
}

export function cacheStore(key, context = null) {
  const cacheDir = path.join(context?.stateDir || STATE_DIR, "cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, key), "");
  pruneCache(cacheDir);
}

function pruneCache(cacheDir = CACHE_DIR) {
  try {
    // Runs on every cache write (every gate pass on every file edit) — a
    // cheap unstated readdir count first means the stat+sort below (the
    // actually expensive part) only runs once the dir is actually over cap,
    // not on every single edit in a repo that never gets that large.
    const names = fs.readdirSync(cacheDir);
    if (names.length <= 2000) return;
    const files = names
      .map((f) => ({ f, t: fs.statSync(path.join(cacheDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(2000)) fs.unlinkSync(path.join(cacheDir, f));
  } catch { /* non-fatal */ }
}

// --------------------------------------------------------------- logging ---

export function logEvent(ev, context = null) {
  if (ROOT_SOURCE === "project-dir" && rootUnanchored(context?.root ?? PROJECT_ROOT)) return; // no state for an unanchored root
  const stateDir = context?.stateDir || STATE_DIR;
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.appendFileSync(path.join(stateDir, "events.jsonl"), JSON.stringify({ ts: Date.now(), ...ev }) + "\n");
  } catch { /* never break the hook on logging */ }
}

export function readEvents() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// -------------------------------------------------------- learned rules ---

/** Pull a tool-specific rule id out of one finding line, so recurring
 * mistakes group by their actual rule instead of every finding from a given
 * tool colliding on one generic signature. Tries, in order: eslint's `--format
 * unix` `[Error/rule-id]` / `[Warning/rule-id]` suffix (the formatter this
 * plugin actually configures by default); a bare trailing `(rule-id)`, as
 * some other formatters/linters emit; a leading tool code (ruff/mypy/C#-style
 * `E501`, `CS0246`); then a generic uppercase-or-digit-suffixed fallback. */
export function extractSig(tool, sample) {
  let m = sample.match(/\[(?:Error|Warning)\/([a-zA-Z][\w-]*(?:\/[a-zA-Z][\w-]*)?)\]\s*$/);
  if (m) return m[1];
  m = sample.match(/\(([a-z][a-z0-9-]{2,}(?:\/[a-z][a-z0-9-]{2,})?)\)\s*$/);
  if (m) return m[1];
  m = sample.match(/\b([A-Z]{1,4}\d{2,4})\b/);
  if (m) return m[1];
  m = sample.match(/[A-Z][A-Z0-9_]{3,}|\b[a-z-]+\d{3,}\b/);
  return m ? m[0] : "";
}

// craftsman.config.json ships `learnedRules.enabled` and EXTENDING.md documents
// the block, but nothing read the flag — setting it false still collected and
// still narrated. Absent means on, so existing configs are unaffected.
export function learnedRulesEnabled(cfg) {
  return cfg?.learnedRules?.enabled !== false;
}

export function recordFailure(lang, tool, sample, cfg, context = null) {
  if (!learnedRulesEnabled(cfg)) return; // opted out: don't even take the lock
  const rulesFile = path.join(context?.stateDir || STATE_DIR, "learned-rules.json");
  const lock = `${rulesFile}.lock`;
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 10000;
  while (true) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || Date.now() >= deadline) return;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 30000) fs.rmSync(lock, { recursive: true, force: true });
      } catch {}
      Atomics.wait(waitBuffer, 0, 0, 10);
    }
  }
  const cap = cfg.learnedRules?.max ?? 10;
  try {
    let rules = [];
    try { rules = JSON.parse(fs.readFileSync(rulesFile, "utf8")); } catch {}
    const sig = `${lang}:${tool}:${extractSig(tool, sample)}`;
    const hit = rules.find((r) => r.sig === sig);
    if (hit) { hit.n++; hit.last = Date.now(); hit.sample = sample.slice(0, 200); }
    else rules.push({ sig, n: 1, last: Date.now(), lang, tool, sample: sample.slice(0, 200) });
    rules.sort((a, b) => (b.n - a.n) || (b.last - a.last));
    try { atomicWrite(rulesFile, JSON.stringify(rules.slice(0, cap * 3), null, 0)); } catch {}
  } finally {
    try { fs.rmSync(lock, { recursive: true, force: true }); } catch {}
  }
}

export function topRules(cfg, context = null) {
  if (!learnedRulesEnabled(cfg)) return []; // opted out: surface nothing, even if rules were collected earlier
  const cap = cfg.learnedRules?.max ?? 10;
  const minN = cfg.learnedRules?.minOccurrences ?? 3;
  const maxAgeMs = cfg.learnedRules?.maxAgeMs ?? 30 * 24 * 3600 * 1000;
  try {
    return JSON.parse(fs.readFileSync(path.join(context?.stateDir || STATE_DIR, "learned-rules.json"), "utf8"))
      .filter((r) => r.n >= minN && Date.now() - r.last < maxAgeMs)
      .slice(0, cap);
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

// True when the module at `metaUrl` is the process entry script. Compares
// realpaths of both sides so a space, a `%` or a symlinked script is handled,
// unlike the `file://${argv[1]}` template-literal idiom.
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}
// Split criteria into those a session binds to and legacy untagged ones.
// `[unit:]` decides alone; `[plan:]` binds iff touched; untagged binds only
// when the session touched no plan, else it is listed in `legacy`.
export function bindingAcceptance(text, { units = [], plans = [] } = {}) {
  const u = new Set(units), p = new Set(plans.map((x) => planSlugOf(x)));
  const binding = [], legacy = [];
  for (const c of acceptanceCriteria(text)) {
    if (c.unit) { if (u.has(c.unit)) binding.push(c); }
    else if (c.plan) { if (p.has(c.plan)) binding.push(c); }
    else (p.size === 0 ? binding : legacy).push(c);
  }
  return { binding, legacy };
}
