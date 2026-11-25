// The project's test command from stopGate.commands (marker file -> command).
// Pure over its inputs: `onPath(bin)` and `justTargets(worktree)` are injected
// so the lookup is testable without a real `just` (ARCH-ENGINE-22: tools are
// skipped silently when their binary or config is absent). A command whose program is absent is not usable, so no gate
// command is found and the caller skips it rather than throw on a spawn that cannot start.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { splitCmd, globToRe } from "./core.mjs";
import { isScoped } from "./changed.mjs";

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

// A command's program is present when it is on PATH or, when it names a path (a slash), an existing file relative to the
// worktree (an absolute path resolves to itself). The program is the first token as the runner splits it, quotes honoured.
function programPresent(worktree, command, onPath) {
  const [bin] = splitCmd(command, { root: worktree });
  if (!bin) return false;
  return bin.includes("/") || bin.includes(path.sep) ? fs.existsSync(path.resolve(worktree, bin)) : onPath(bin);
}

// Whether one marker/command pair is usable in the tree: a null or empty
// command is a dropped marker; a `just <target>` command needs `just` on PATH
// and the target in its summary; any other command needs its program present.
export function gateUsable(worktree, marker, command, { onPath = binOnPath, justTargets = justSummary, markerOk = false } = {}) {
  if (typeof command !== "string" || !command.trim() || (!markerOk && !present(worktree, marker))) return false;
  const [bin, target] = command.trim().split(/\s+/);
  if (bin !== "just") return programPresent(worktree, command, onPath);
  return onPath("just") && justTargets(worktree).includes(target || "default");
}

// Whether `marker` exists anywhere in the worktree, with markerPresent's semantics (core.mjs) over a synchronous walk of the
// tree: a bare name matches a path segment at any depth, a glob without a slash matches a file name at any depth, a glob
// with a slash matches the relative path. `.git` and `node_modules` are not entered; a symlink is never followed.
function presentAnywhere(worktree, marker) {
  const re = marker.includes("*") ? globToRe(marker.includes("/") ? marker : "**/" + marker) : null;
  const matches = (rel) => (re ? re.test(rel) : rel === marker || rel.endsWith("/" + marker));
  const walk = (dir, prefix) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    for (const entry of entries) {
      const rel = prefix + entry.name;
      if (matches(rel)) return true;
      if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules" && walk(path.join(dir, entry.name), rel + "/")) return true;
    }
    return false;
  };
  return walk(worktree, "");
}

// A scoped command (`{changed}` / `{changedDirs}`, ARCH-STATE-21) is selected when its marker is anywhere in the worktree, as
// Stop selects it; an unscoped command only when its marker is at the root (ARCH-LAND-38).
export function findGateCommand(worktree, cfg, deps = {}) {
  for (const [marker, command] of Object.entries(cfg?.stopGate?.commands || {})) {
    if (isScoped(command)) {
      if (presentAnywhere(worktree, marker) && gateUsable(worktree, marker, command, { ...deps, markerOk: true })) return command;
    } else if (gateUsable(worktree, marker, command, deps)) return command;
  }
  return null;
}
