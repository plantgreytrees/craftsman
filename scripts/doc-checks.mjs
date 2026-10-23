#!/usr/bin/env node
// Docs-check adapter (ARCH-ENGINE-20): runs each command in docs.checks
// (e.g. "markdownlint-cli2 **/*.md", "lychee --offline .") and, with --verify,
// `pre-commit run --all-files` once. A missing binary (or, for pre-commit, a
// missing .pre-commit-config.yaml) is skipped silently. Prints one JSON line;
// exits 1 only when a present tool fails. Called from /sync-docs and the
// verification point, never per unit.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, projectContext, splitCmd } from "./lib/core.mjs";

export function onPath(bin, env = process.env, cwd = process.cwd()) {
  if (bin.includes("/")) return fs.existsSync(path.resolve(cwd, bin));
  return (env.PATH || "").split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, bin)));
}

function runOne(cmd, cwd, timeoutMs) {
  const [bin, ...args] = splitCmd(cmd);
  if (!bin || !onPath(bin, process.env, cwd)) return { cmd, status: "skipped" };
  const r = spawnSync(bin, args, { cwd, encoding: "utf8", timeout: timeoutMs });
  if (r.error?.code === "ENOENT") return { cmd, status: "skipped" };
  if (r.status === 0) return { cmd, status: "pass" };
  const output = `${r.stdout || ""}${r.stderr || ""}`.split("\n").filter(Boolean).slice(-20).join("\n");
  return { cmd, status: "fail", output };
}

export function runDocChecks({ root, checks = [], verify = false, timeoutMs = 120000 }) {
  const results = checks.map((cmd) => runOne(cmd, root, timeoutMs));
  if (verify) {
    if (fs.existsSync(path.join(root, ".pre-commit-config.yaml"))) results.push(runOne("pre-commit run --all-files", root, timeoutMs));
    else results.push({ cmd: "pre-commit run --all-files", status: "skipped" });
  }
  return { ok: !results.some((r) => r.status === "fail"), checks: results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const verify = args.includes("--verify");
  const context = projectContext(args.find((a) => !a.startsWith("--")) || ".");
  const cfg = loadConfig(context);
  const result = runDocChecks({ root: context.root, checks: cfg.docs?.checks || [], verify, timeoutMs: cfg.stopGate?.testTimeoutMs });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}
