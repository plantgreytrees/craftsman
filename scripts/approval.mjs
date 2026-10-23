#!/usr/bin/env node
// Approval record (ARCH-APPROVAL-01/04/05/06/07): JSON on stdin, JSON on stdout.
// Actions: prepare, attach-url, check, landed, pending, fallback. Records live in the
// main checkout's .craftsman/approvals so worktree sessions and SessionStart see one place.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite, logEvent, loadConfig, mainCheckoutRoot, projectContext } from "./lib/core.mjs";
import { recommend, renderApproval } from "./lib/approval-page.mjs";
import { scanTree } from "./secrets-scan.mjs";
import { runDocChecks } from "./doc-checks.mjs";

const CHOICES = ["merge", "open-pr"];
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

// Default runners; tests inject stubs. Secret findings carry file:line:rule only, never the value.
export function defaultRunners(root) {
  return {
    secrets: () => scanTree(root).map((f) => ({ file: f.file, line: f.line, rule: f.rule })),
    docChecks: () => {
      const cfg = loadConfig(projectContext(root));
      return runDocChecks({ root, checks: cfg.docs?.checks || [], verify: true, timeoutMs: cfg.stopGate?.testTimeoutMs });
    },
  };
}

export function prepare(input, { root = ".", runners = defaultRunners(root), now = () => new Date().toISOString() } = {}) {
  let file;
  try { file = fileFor(root, input.run); } catch (e) { return refuse(e.message); }
  const findings = runners.secrets();
  if (findings.length) {
    return { ok: false, refused: true, reason: "secrets scan found findings; no approval page", findings: findings.map((f) => ({ file: f.file, line: f.line, rule: f.rule })) };
  }
  const docs = runners.docChecks();
  const pre = (docs.checks || []).find((c) => /pre-commit/.test(c.cmd));
  const others = (docs.checks || []).filter((c) => c !== pre);
  const ev = input.evidence || {};
  const evidence = {
    ...ev,
    gates: [...(ev.gates || []), ...others.map((c) => `${c.cmd}: ${c.status}`)],
    precommit: pre ? pre.status : ev.precommit || "",
  };
  const run = { ...input, evidence, prLines: input.prLines };
  const recommendation = recommend(run);
  const { html, markdown } = renderApproval(run);
  save(root, {
    run: input.run, plan: input.plan, base: input.base, head_sha: input.head_sha, feature_heads: input.feature_heads || [],
    recommendation, requested_at: now(), url: null, status: "requested",
  });
  log(root, { ev: "approval_requested", run: input.run, recommendation });
  return { ok: true, html, markdown, recommendation, docs_ok: docs.ok, record: `${file}.json` };
}

export function attachUrl({ run, url }, { root = "." } = {}) {
  const rec = load(root, run);
  if (!rec) return refuse("no approval record");
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return refuse("url must be https");
  save(root, { ...rec, url });
  return { ok: true };
}

export function check({ run, row, writer_is_owner }, { root = "." } = {}) {
  const rec = load(root, run);
  if (!rec) return refuse("no approval record");
  if (rec.status !== "requested") return refuse(`record status is ${rec.status}, not requested`);
  if (writer_is_owner !== true) return refuse("writer is not the artifact owner");
  if (!row || !CHOICES.includes(row.choice)) return refuse("choice must be merge or open-pr");
  if (!rec.head_sha || row.head_sha !== rec.head_sha) return refuse("head_sha does not match the recorded head");
  save(root, { ...rec, status: "decided", choice: row.choice, decided_at: new Date().toISOString() });
  log(root, { ev: "approval_decided", run, choice: row.choice });
  return { ok: true, choice: row.choice };
}

export function landed({ run, sha, mode }, { root = "." } = {}) {
  const rec = load(root, run);
  if (!rec) return refuse("no approval record");
  if (rec.status !== "decided") return refuse(`record status is ${rec.status}, not decided`);
  save(root, { ...rec, status: "landed", landed_sha: sha, landed_mode: mode });
  log(root, { ev: "approval_landed", run, sha, mode });
  return { ok: true };
}

export function pending(_input, { root = "." } = {}) {
  const d = dirs(root).approvals;
  let names = [];
  try { names = fs.readdirSync(d).filter((n) => n.endsWith(".json")); } catch { /* none yet */ }
  const runs = names.map((n) => load(root, n.slice(0, -5))).filter((r) => r && r.status === "decided")
    .map((r) => ({ run: r.run, plan: r.plan, choice: r.choice, url: r.url }));
  return { ok: true, runs };
}

export function fallback({ run, markdown }, { root = "." } = {}) {
  const rec = load(root, run);
  if (!rec) return refuse("no approval record");
  const file = `${fileFor(root, run)}.md`;
  atomicWrite(file, String(markdown ?? ""));
  return { ok: true, file, ...QUESTION };
}

const ACTIONS = { prepare, "attach-url": attachUrl, check, landed, pending, fallback };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { /* empty */ }
  const fn = ACTIONS[process.argv[2] || input.action];
  const root = input.project ? projectContext(input.project).root : projectContext(".").root;
  const out = fn ? fn(input, { root }) : refuse("unknown action");
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exit(out.ok ? 0 : 1);
}
