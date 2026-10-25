#!/usr/bin/env node
// Approval record (ARCH-APPROVAL-01/04/05/06/07): JSON on stdin, JSON on stdout.
// Actions: prepare, attach-url, check, pending, fallback (landed is module-only, reached by repo-exec). Records live in the
// main checkout's .craftsman/approvals so worktree sessions and SessionStart see one place.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite, logEvent, loadConfig, mainCheckoutRoot, projectContext, splitCmd } from "./lib/core.mjs";
import { CHOICES, recommend, renderApproval } from "./lib/approval-page.mjs";
import { runIdFor } from "./lib/approval-gate.mjs";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { scanTree, scanContent } from "./secrets-scan.mjs";
import { runDocChecks, onPath } from "./doc-checks.mjs";

const QUESTION = { question: "Merge now or Open PR?", options: ["Merge now", "Open PR"] };

function dirs(root) {
  const main = mainCheckoutRoot(root);
  return { state: path.join(main, ".craftsman"), approvals: path.join(main, ".craftsman", "approvals") };
}
function fileFor(root, run) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(run ?? ""))) throw new Error("invalid run id");
  return path.join(dirs(root).approvals, `${run}`);
}
const load = (root, run) => {
  try { return JSON.parse(fs.readFileSync(`${fileFor(root, run)}.json`, "utf8")); } catch { return null; }
};
const save = (root, rec) => atomicWrite(`${fileFor(root, rec.run)}.json`, `${JSON.stringify(rec, null, 2)}\n`);
const log = (root, ev) => logEvent(ev, { stateDir: dirs(root).state });
const refuse = (reason) => ({ ok: false, refused: true, reason });

// Read-modify-write under a per-run mkdir lock; waits briefly, breaks a lock left by a crash.
function withLock(root, run, action, tries = 2000) {
  const lock = `${fileFor(root, run)}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let age = 0;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
      if (age > 30000) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
      if (i > tries) throw new Error(`approval record is busy: ${run}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try { return action(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

// Default runners take the directory to inspect (the detached worktree at head_sha).
// Secret findings carry file:line:rule only, never the value.
export function defaultRunners(root) {
  return {
    secrets: (dir = root) => {
      const cfg = loadConfig({ root });
      const out = [];
      let ran = 0;
      for (const cmd of cfg.security?.check || []) {
        const [bin, ...args] = splitCmd(cmd);
        if (!bin || !onPath(bin, process.env, dir)) continue;
        ran++;
        const r = spawnSync(bin, args, { cwd: dir, encoding: "utf8", timeout: cfg.stopGate?.testTimeoutMs });
        if (r.status !== 0) out.push({ file: "(security.check)", line: 0, rule: `${path.basename(bin)} exit ${r.status ?? "timeout"}` });
      }
      if (!ran) return scanTree(dir).map((f) => ({ file: f.file, line: f.line, rule: f.rule }));
      return out;
    },
    docChecks: (dir = root) => {
      const cfg = loadConfig({ root });
      return runDocChecks({ root: dir, checks: cfg.docs?.checks || [], verify: true, timeoutMs: cfg.stopGate?.testTimeoutMs });
    },
  };
}

// Run fn in a detached temp worktree at sha; the main checkout is never touched.
function inDetachedTree(root, sha, fn) {
  const main = mainCheckoutRoot(root);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "approval-tree-"));
  const dir = path.join(tmp, "tree");
  try {
    execFileSync("git", ["-C", main, "worktree", "add", "--detach", dir, String(sha)], { stdio: "pipe" });
  } catch {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { error: `cannot check out head_sha ${sha} to scan` };
  }
  try { return { value: fn(dir) }; } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { execFileSync("git", ["-C", main, "worktree", "prune"], { stdio: "pipe" }); } catch { /* best effort */ }
  }
}

export function prepare(input, { root = ".", runners, now = () => new Date().toISOString(), lockTries } = {}) {
  if (!input.plan || !input.feature) return refuse("plan and feature are required");
  if (!/^[0-9a-f]{40}$/.test(String(input.head_sha ?? ""))) return refuse("head_sha must be a 40-hex commit sha");
  try {
    execFileSync("git", ["-C", mainCheckoutRoot(root), "rev-parse", "--verify", "--quiet", `${input.head_sha}^{commit}`], { stdio: "pipe" });
  } catch { return refuse(`head_sha ${input.head_sha} is not a commit in this repository`); }
  const runId = runIdFor(input.plan, input.feature);
  if (input.run !== undefined && input.run !== runId) return refuse(`run must be ${runId}`);
  let file;
  try { file = fileFor(root, runId); } catch (e) { return refuse(e.message); }
  const scanned = runners
    ? { value: { findings: runners.secrets(), docs: null } }
    : inDetachedTree(root, input.head_sha, (dir) => {
      const r = defaultRunners(root);
      const findings = r.secrets(dir);
      return { findings, docs: findings.length ? null : r.docChecks(dir) };
    });
  if (scanned.error) return refuse(scanned.error);
  const findings = scanned.value.findings;
  if (findings.length) {
    return { ok: false, refused: true, reason: "secrets scan found findings; no approval page", findings: findings.map((f) => ({ file: f.file, line: f.line, rule: f.rule })) };
  }
  const docs = scanned.value.docs || runners.docChecks();
  const pre = (docs.checks || []).find((c) => /pre-commit/.test(c.cmd));
  const others = (docs.checks || []).filter((c) => c !== pre);
  const ev = input.evidence || {};
  const evidence = {
    ...ev,
    gates: [...(ev.gates || []), ...others.map((c) => `${c.cmd}: ${c.status}`)],
    precommit: pre ? pre.status : ev.precommit || "",
  };
  const cfgLines = loadConfig({ root }).repoExec?.approval?.prLines;
  const run = { ...input, run: runId, evidence, prLines: cfgLines ?? input.prLines };
  const recommendation = recommend(run);
  const { html, markdown } = renderApproval(run);
  const leaks = [["approval.md", markdown], ["approval.html", html]]
    .flatMap(([file, text]) => scanContent(String(text)).map((f) => ({ file, line: f.line, rule: f.rule })));
  if (leaks.length) return { ok: false, refused: true, reason: "rendered approval page contains secret-shaped text; no approval page", findings: leaks };
  let refused;
  try { refused = withLock(root, runId, () => {
    const prev = load(root, runId);
    if (prev?.status === "landed" && prev.landed_mode !== "open-pr") return refuse("record is already landed; start a new run");
    const history = [...(prev?.history || [])];
    if (prev) history.push({ status: prev.status, head_sha: prev.head_sha, choice: prev.choice ?? null, requested_at: prev.requested_at, decided_at: prev.decided_at ?? null, landed_sha: prev.landed_sha ?? null, landed_mode: prev.landed_mode ?? null, published_at: prev.published_at ?? null, superseded_at: now() });
    save(root, {
      run: runId, plan: input.plan, feature: input.feature, base: input.base, head_sha: input.head_sha, feature_heads: input.feature_heads || [],
      recommendation, requested_at: now(), url: null, status: "requested", history, markdown,
    });
    log(root, { ev: "approval_requested", run: runId, recommendation });
    return null;
  }, lockTries); } catch (e) { return refuse(e.message); }
  if (refused) return refused;
  return { ok: true, html, markdown, recommendation, docs_ok: docs.ok, record: `${file}.json` };
}

export function attachUrl(input, { root = ".", lockTries } = {}) {
  try { return withLock(root, input.run, () => attachUrlLocked(input, { root }), lockTries); } catch (e) { return refuse(e.message); }
}

function attachUrlLocked({ run, url }, { root }) {
  const rec = load(root, run);
  if (!rec) return refuse("no approval record");
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return refuse("url must be https");
  save(root, { ...rec, url });
  return { ok: true };
}

export function check(input, { root = "." } = {}) {
  try { return withLock(root, input.run, () => checkLocked(input, { root })); } catch (e) { return refuse(e.message); }
}

// The terminal answer is a QUESTION.options label; it is stamped decided now (ARCH-APPROVAL-07).
const fromFallback = (row) => {
  const i = QUESTION.options.indexOf(row?.choice);
  return i < 0 ? row : { ...row, choice: CHOICES[i], decided_at: new Date().toISOString() };
};

function checkLocked({ run, row: given, writer_is_owner, source }, { root }) {
  const row = source === "fallback" ? fromFallback(given) : given;
  const rec = load(root, run);
  if (!rec) return refuse("no approval record");
  if (rec.status !== "requested") return refuse(`record status is ${rec.status}, not requested`);
  if (writer_is_owner !== true) return refuse("writer is not the artifact owner");
  if (!row || !CHOICES.includes(row.choice)) return refuse("choice must be merge or open-pr");
  if (!rec.head_sha || row.head_sha !== rec.head_sha) return refuse("head_sha does not match the recorded head");
  const at = Date.parse(row.decided_at);
  if (!(at >= Date.parse(rec.requested_at))) return refuse("decision predates the approval request");
  save(root, { ...rec, status: "decided", choice: row.choice, decided_at: new Date().toISOString() });
  log(root, { ev: "approval_decided", run, choice: row.choice });
  return { ok: true, choice: row.choice };
}

export function landed(input, { root = ".", lockTries } = {}) {
  try { return withLock(root, input.run, () => landedLocked(input, { root }), lockTries); } catch (e) { return refuse(e.message); }
}

function landedLocked({ run, sha, mode }, { root }) {
  const rec = load(root, run);
  if (!rec) return refuse("no approval record");
  if (rec.status !== "decided") return refuse(`record status is ${rec.status}, not decided`);
  save(root, { ...rec, status: "landed", landed_sha: sha, landed_mode: mode });
  log(root, { ev: "approval_landed", run, sha, mode });
  return { ok: true };
}

// Single-use publish (ARCH-LAND-24): a landed record may authorise one tracker publish.
export function markPublished(run, { root = ".", lockTries } = {}) {
  try {
    return withLock(root, run, () => {
      const rec = load(root, run);
      if (!rec) return refuse("no approval record");
      if (rec.status !== "landed") return refuse(`record status is ${rec.status}, not landed`);
      if (rec.published_at) return refuse("record already published");
      save(root, { ...rec, published_at: new Date().toISOString() });
      return { ok: true };
    }, lockTries);
  } catch (e) { return refuse(e.message); }
}

export function pending(_input, { root = "." } = {}) {
  const d = dirs(root).approvals;
  let names = [];
  try { names = fs.readdirSync(d).filter((n) => n.endsWith(".json")); } catch { /* none yet */ }
  const runs = names.map((n) => load(root, n.slice(0, -5))).filter((r) => r && r.status === "decided")
    .map((r) => ({ run: r.run, plan: r.plan, choice: r.choice, url: r.url }));
  return { ok: true, runs };
}

export function fallback({ run }, { root = "." } = {}) {
  const rec = load(root, run);
  if (!rec) return refuse("no approval record");
  const file = `${fileFor(root, run)}.md`;
  atomicWrite(file, String(rec.markdown ?? ""));
  return { ok: true, file, ...QUESTION };
}

const ACTIONS = { prepare, "attach-url": attachUrl, check, pending, fallback };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { /* empty */ }
  const fn = ACTIONS[process.argv[2] || input.action];
  const root = input.project ? projectContext(input.project).root : projectContext(".").root;
  const out = fn ? fn(input, { root }) : refuse("unknown action");
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exit(out.ok ? 0 : 1);
}
