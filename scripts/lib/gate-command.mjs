// The project's test command from stopGate.commands (marker file -> command).
// Pure over its inputs: `onPath(bin)` and `justTargets(worktree)` are injected
// so the lookup is testable without a real `just` (ARCH-ENGINE-20: tools are
// skipped silently when their binary or config is absent).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function binOnPath(bin) {
  return (process.env.PATH || "").split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, bin)));
}

export function justSummary(worktree) {
  const r = spawnSync("just", ["--summary"], { cwd: worktree, encoding: "utf8", timeout: 10000 });
  return r.status === 0 ? String(r.stdout).split(/\s+/).filter(Boolean) : [];
}

function present(worktree, marker) {
  if (!marker.includes("*")) return fs.existsSync(path.join(worktree, marker));
  let entries = [];
  try { entries = fs.readdirSync(worktree); } catch { return false; }
  const re = new RegExp(`^${marker.replaceAll(".", "\\.").replaceAll("*", ".*")}$`);
  return entries.some((entry) => re.test(entry));
}

// Whether one marker/command pair is usable in the tree: a null or empty
// command is a dropped marker; a `just <target>` command needs `just` on PATH
// and the target in its summary.
export function gateUsable(worktree, marker, command, { onPath = binOnPath, justTargets = justSummary, markerOk = false } = {}) {
  if (typeof command !== "string" || !command.trim() || (!markerOk && !present(worktree, marker))) return false;
  const [bin, target] = command.trim().split(/\s+/);
  if (bin !== "just") return true;
  return onPath("just") && justTargets(worktree).includes(target || "default");
}

export function findGateCommand(worktree, cfg, deps = {}) {
  for (const [marker, command] of Object.entries(cfg?.stopGate?.commands || {})) {
    if (gateUsable(worktree, marker, command, deps)) return command;
  }
  return null;
}
