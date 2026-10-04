#!/usr/bin/env node
// Update every install of this plugin to the latest commit of its marketplace.
//
// plugin.json leaves `version` unset, so Claude Code versions each install by
// the commit it was copied from and every push to main is an update. An
// install is recorded per scope, though — the user install plus one per
// project/local install — and `claude plugin update` only moves the one it is
// pointed at. This refreshes the marketplace once, then updates each install
// from its own directory, so no copy is left behind on an old commit.
//
// Running sessions keep the copy they loaded until /reload-plugins (hooks
// switch then) or a restart; each project then runs /craftsman:init's
// `--update` to refresh its own surfaces against the new release.
//
//   node scripts/self-update.mjs [--dry-run] [--json]
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";

const NAME = "craftsman";

function cli(args, cwd) {
  return execFileSync("claude", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000 });
}

export function craftsmanInstalls(list) {
  return list.filter((p) => String(p.id || "").startsWith(`${NAME}@`));
}

export function selfUpdate({ run = cli, dryRun = false, exists = fs.existsSync, home = os.homedir() } = {}) {
  const installs = craftsmanInstalls(JSON.parse(run(["plugin", "list", "--json"], home)));
  if (!installs.length) throw new Error(`no ${NAME} install found in \`claude plugin list\``);
  const marketplaces = [...new Set(installs.map((p) => p.id.split("@")[1]))];
  const results = [];
  if (!dryRun) for (const m of marketplaces) run(["plugin", "marketplace", "update", m], home);
  for (const install of installs) {
    const where = install.projectPath || home;
    const row = { id: install.id, scope: install.scope, project: install.projectPath || null, before: install.version };
    if (install.projectPath && !exists(install.projectPath)) { results.push({ ...row, status: "skipped", reason: "project directory is gone" }); continue; }
    if (dryRun) { results.push({ ...row, status: "would-update" }); continue; }
    try {
      run(["plugin", "update", install.id, "--scope", install.scope], where);
      results.push({ ...row, status: "updated" });
    } catch (error) {
      results.push({ ...row, status: "failed", reason: String(error.stderr || error.message).trim().split("\n")[0] });
    }
  }
  if (!dryRun) {
    const after = craftsmanInstalls(JSON.parse(run(["plugin", "list", "--json"], home)));
    for (const row of results) {
      const now = after.find((p) => p.scope === row.scope && (p.projectPath || null) === row.project);
      row.after = now?.version ?? null;
      if (row.status === "updated" && row.after === row.before) row.status = "current";
    }
  }
  return { marketplaces, results, dryRun };
}

function render({ marketplaces, results, dryRun }) {
  const lines = [`marketplace ${dryRun ? "to refresh" : "refreshed"}: ${marketplaces.join(", ")}`];
  for (const r of results) {
    const where = r.project ? `${r.scope} ${r.project}` : r.scope;
    const change = r.after && r.after !== r.before ? `${r.before} → ${r.after}` : r.before;
    lines.push(`  ${r.status.padEnd(12)} ${where} — ${change}${r.reason ? ` (${r.reason})` : ""}`);
  }
  const projects = results.filter((r) => r.project && r.status === "updated").map((r) => r.project);
  lines.push("next: /reload-plugins (or restart) in any open session, so hooks switch to the new copy.");
  if (projects.length) lines.push(`then run /craftsman:init (\`--update\`) in: ${projects.join(", ")}`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Set(process.argv.slice(2));
  try {
    const outcome = selfUpdate({ dryRun: args.has("--dry-run") });
    console.log(args.has("--json") ? JSON.stringify(outcome, null, 2) : render(outcome));
    if (outcome.results.some((r) => r.status === "failed")) process.exitCode = 1;
  } catch (error) {
    console.error(`craftsman: self-update failed — ${error.message}`);
    process.exitCode = 1;
  }
}
