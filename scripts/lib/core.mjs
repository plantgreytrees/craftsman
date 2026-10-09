// craftsman core engine.
// Node-only, zero npm dependencies (Claude Code already requires Node).
// Derived from the craftsman v0.2 engine. Fully stack-agnostic; behaviour is config-driven.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const pexec = promisify(execFile);

export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// -------------------------------------------------------------- git root ---
// Every hook/command runs with cwd wherever the harness or the model's last
// `cd` left it — NOT reliably the repo root. All craftsman state, config
// resolution and check invocations anchor to the actual project root instead,
// so a session opened one directory up (or a Bash tool mid-`cd`) can't split
// state across two ".craftsman/" directories or silently mis-detect the stack.
//
// Trusting `git rev-parse --show-toplevel` from bare process.cwd() is not
// enough on its own: a Bash call earlier in the session may have `cd`'d into
// an entirely unrelated git checkout (e.g. exploring a plugin's own cached
// repo) and never `cd`'d back before this hook fired. That still resolves to
// a real, valid git root — just the wrong one — so every downstream check
// (including the worktree sweep in stop-gate.mjs) ends up reasoning about a
// stranger repo's branches and worktrees. CLAUDE_PROJECT_DIR is the harness's
// own declaration of which project this session belongs to, so cwd-based
// detection is only trusted when it lands at or inside that project dir (or
// the project dir sits inside it, covering a session opened one level up).
//
// So the root never depends on cwd (ARCH-STATE-01): a hook always has
// CLAUDE_PROJECT_DIR, and its git toplevel is the root. A Bash-run script has
// no CLAUDE_PROJECT_DIR, so SessionStart pins the root per session
// (CLAUDE_CODE_SESSION_ID) and the script reads the pin. The pin is honoured
// only when cwd is not inside some other repository — a test fixture or a
// deliberately different checkout keeps its own root. A bare CLI with neither
// falls back to cwd's toplevel: there is no session to agree with.
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
export function writeRootPin(sid, root, tmp = os.tmpdir()) {
  if (!sid || sid === "shared") return null;
  const file = rootPinPath(sid, tmp);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
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
      // The pin sits in the shared temp dir: trust only one this user wrote.
      const file = rootPinPath(env.CLAUDE_CODE_SESSION_ID, tmp);
      const owner = fs.statSync(file).uid;
      if (typeof process.getuid !== "function" || owner === process.getuid()) pinned = fs.readFileSync(file, "utf8").trim();
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
    if (!isGitRoot(root)) throw new Error(`workspace project ${id} is not a Git root`);
    if (roots.has(root)) throw new Error(`workspace projects share a root: ${id}`);
    roots.add(root);
    projects[id] = { id, root, relativeRoot: path.relative(workspaceRoot, root).split(path.sep).join("/") };
  }
  return { file, workspaceRoot, projects };
}

export function resolveSelectedProject(project = ".") {
  const manifest = loadWorkspaceManifest();
  if (!manifest) {
    if (project !== ".") throw new Error(`workspace project "${project}" requested but no workspace manifest is configured`);
    return { id: ".", root: PROJECT_ROOT, workspaceRoot: PROJECT_ROOT, manifest: null };
  }
  if (project === ".") return { id: ".", root: PROJECT_ROOT, workspaceRoot: manifest.workspaceRoot, manifest };
  const selected = manifest.projects[project];
  if (!selected) throw new Error(`unknown workspace project: ${project}`);
  return { id: selected.id, root: selected.root, workspaceRoot: manifest.workspaceRoot, manifest };
}

export function projectContext(project = ".") {
  const selected = resolveSelectedProject(project);
  const stateDir = path.join(selected.root, ".craftsman");
  return { ...selected, stateDir, offFlag: path.join(stateDir, "off") };
}

export function isGitRoot(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim() === root;
  } catch { return false; }
}

// The main checkout that owns `root`, even when `root` is a linked worktree.
// Shared, cross-session state (the tracker ledger and its TRACKER.md view)
// lives here: written inside a worktree it is invisible to every other
// session until a merge, and each worktree's copy drifts. The first entry of
// `git worktree list` is always the main working tree; a bare main repo, or
// a root that isn't a git checkout at all, keeps `root` itself.
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
// Isolated fresh-context agents: one command invocation grants exactly one
// dispatch of its named agent, even under root-only agent mode — /scrutinise →
// `scrutineer`, /idea → `idea-critic`, /architect --deep → `architect-analyst`.
// Granted by orchestrate-scope-guard.mjs when the command is invoked, spent by
// agent-mode-guard.mjs when the dispatch happens. Spending is a rename, which
// only one caller can win, so two parallel dispatches can't both slip through.
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
// implement + up to 3 reviews + 2 fix rounds (ARCH-ENGINE-05) + close.
export const RUNNER_DISPATCHES_PER_UNIT = 7;
export function grantRunnerDispatches(count, sid, context = null) {
  const grant = agentGrantFile("runner", sid, context);
  try {
    fs.mkdirSync(path.dirname(grant), { recursive: true });
    fs.writeFileSync(grant, `${Math.max(0, Math.floor(count))}\n`);
  } catch {}
  return grant;
}
export function spendRunnerDispatch(sid, context = null) {
  const grant = agentGrantFile("runner", sid, context);
  const held = `${grant}.spent-${process.pid}-${Date.now()}`;
  try { fs.renameSync(grant, held); } catch { return false; }
  let left = 0;
  try { left = Number.parseInt(fs.readFileSync(held, "utf8"), 10) || 0; } catch {}
  try {
    if (left > 1) fs.writeFileSync(held, `${left - 1}\n`), fs.renameSync(held, grant);
    else fs.unlinkSync(held);
  } catch {}
  return left >= 1;
}
export const scrutineerGrantFile =(sid, context = null) => agentGrantFile("scrutineer", sid, context);
export const grantScrutineer = (sid, context = null) => grantAgent("scrutineer", sid, context);
export const spendScrutineerGrant = (sid, context = null) => spendAgentGrant("scrutineer", sid, context);
export function sharedStateDir(context = null) {
  try {
    const commonGitDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: context?.root || PROJECT_ROOT, encoding: "utf8",
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

// Session-owned worktree ledger. The binding above is released before the
// locked merge, so by Stop time it can no longer answer "did THIS session
// create that worktree?" — and the Stop sweep must never police a worktree
// belonging to a concurrent session or to the human. repo-exec.mjs records
// every worktree it prepares for a session here and forgets it on cleanup;
// the sweep consults this list and ignores everything else. Best-effort by
// design: a ledger write must never fail a worktree lifecycle step, and a
// missing ledger simply means "this session owns nothing" — i.e. it fails
// open, never into a spurious block.
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
// identity covers the criteria, NOT their tick state: hashing the raw content
// meant ticking a box by any path the PostToolUse hook doesn't see (sed, a
// script) silently dropped ownership, and the gate went quiet exactly when an
// agent was claiming to be done. A concurrent session rewriting the criteria
// still changes the identity, which is what ownership exists to detect.
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
// Every criterion as { line, unit, done }. `- [ ] [unit:<id>] …` scopes a
// criterion to one plan unit (its tracker unit or scope_id); untagged lines
// belong to the whole plan.
export function acceptanceCriteria(text) {
  return String(text).split("\n").filter((l) => ACCEPTANCE_LINE.test(l)).map((line) => ({
    line: line.trim(),
    unit: /^\s*[-*]\s*\[[ xX]\]\s*\[unit:([^\]\s]+)\]/.exec(line)?.[1] || null,
    done: ACCEPTANCE_LINE.exec(line)[2] !== " ",
  }));
}
export function uncheckedAcceptance(text) {
  return acceptanceCriteria(text).filter((c) => !c.done);
}

export function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
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

export function loadConfig(context = null) {
  const defaults = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "craftsman.config.json"), "utf8")
  );
  const local = path.join(context?.root || PROJECT_ROOT, "craftsman.config.json");
  if (!fs.existsSync(local)) return defaults;
  try {
    return deepMerge(defaults, JSON.parse(fs.readFileSync(local, "utf8")));
  } catch (e) {
    warn(`ignoring malformed ./craftsman.config.json: ${e.message}`);
    return defaults;
  }
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
  if (fs.existsSync(context?.offFlag || OFF_FLAG)) return false;
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
// Cached whole-repo tracked-plus-untracked-not-ignored file listing, used both
// for stack-marker presence (any depth — a .csproj two directories down, a
// go.mod in a monorepo service) and available to any caller that needs the
// set. `--others --exclude-standard` adds files on disk but not yet
// staged/committed (a freshly scaffolded package.json/go.mod), while still
// respecting .gitignore.
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
    return { ok: false, bin, out: ((e.stdout || "") + (e.stderr || "")).trim() || e.message };
  }
}

/** Run format commands (best-effort, silent) then checks in parallel.
 * `failures` excludes timeouts — a slow tool on a big file isn't a defect
 * the model introduced, so it's reported separately and never blocks. */
export async function runChecks(file, lang, cfg, context = null) {
  const t0 = Date.now();
  for (const f of lang.format || []) await runOne(f, file, cfg.timeoutMs ?? 20000, context);

  const results = await Promise.all(
    (lang.check || []).map((c) => runOne(c, file, cfg.timeoutMs ?? 20000, context))
  );
  const failures = results.filter((r) => r.ok === false && !r.timedOut);
  const timedOut = results.filter((r) => r.timedOut).map((r) => r.bin);
  const skipped = results.filter((r) => r.skipped).map((r) => r.bin);
  return { failures, timedOut, skipped, ms: Date.now() - t0 };
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
