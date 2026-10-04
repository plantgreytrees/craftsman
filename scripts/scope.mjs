#!/usr/bin/env node
// Manage the active per-session implementation scope used by pre-guard.mjs.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  PROJECT_ROOT, atomicWrite, enabled, isGitRoot, loadConfig, logEvent, readStdin,
  loadWorkspaceManifest, projectContext,
  resolveSelectedProject, clearWorktreeBinding, writeWorktreeBinding,
  sessionDir, sidOf, worktreeBindingPath,
} from "./lib/core.mjs";
import { checkScope, loadRules, DEFAULT_DIR } from "./arch-check.mjs";

export function normalizeScope(value) {
  if (!value || typeof value !== "object") throw new Error("scope must be a JSON object");
  for (const key of ["plan", "unit", "project"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) throw new Error(`scope.${key} must be a non-empty string`);
  }
  const selected = resolveSelectedProject(value.project);
  const worktreeRoot = value.worktree_path
    ? path.resolve(selected.root, value.worktree_path)
    : null;
  const projectRoot = worktreeRoot || selected.root;
  const scope = value.scope || value;
  for (const key of ["read", "docs", "write"]) {
    if (!Array.isArray(scope[key]) || scope[key].some((p) => typeof p !== "string" || !p.trim())) {
      throw new Error(`scope.${key} must be an array of non-empty paths`);
    }
  }
  if (value.arch !== undefined && (!Array.isArray(value.arch) || value.arch.some((id) => typeof id !== "string" || !id.trim()))) {
    throw new Error("arch must be an array of ARCH rule ids");
  }
  return {
    plan: value.plan,
    unit: value.unit,
    project: value.project,
    project_root: projectRoot,
    ...(worktreeRoot ? { worktree_path: worktreeRoot } : {}),
    scope: {
      read: [...new Set(scope.read)],
      docs: [...new Set(scope.docs)],
      write: [...new Set(scope.write)],
    },
    arch: [...new Set(value.arch || [])],
    activated_at: new Date().toISOString(),
  };
}

export function scopeFile(input) { return path.join(sessionDir(sidOf(input), input?.project ? projectContext(input.project) : null), "scope.json"); }
export function requiredFile(input) { return path.join(sessionDir(sidOf(input), input?.project ? projectContext(input.project) : null), "scope-required"); }

export function readScope(input) {
  const read = (context) => {
    try { return JSON.parse(fs.readFileSync(scopeFile({ ...input, project: context.id }), "utf8")); }
    catch { return null; }
  };
  if (input?.project) return read(projectContext(input.project));
  const contexts = [];
  try {
    contexts.push(projectContext("."));
    const manifest = loadWorkspaceManifest();
    for (const id of Object.keys(manifest?.projects || {})) contexts.push(projectContext(id));
  } catch { return null; }
  const scopes = contexts.map(read).filter(Boolean);
  if (!scopes.length) return null;
  const target = input?.tool_input?.file_path || input?.tool_input?.path || input?.cwd || process.cwd();
  const absolute = path.resolve(target);
  const matching = scopes.filter((scope) => {
    const root = path.resolve(scope.worktree_path || scope.project_root);
    return absolute === root || absolute.startsWith(root + path.sep);
  });
  if (matching.length === 1) return matching[0];
  return { ...scopes[0], scope_ambiguous: scopes.length > 1 };
}

function sameRepository(first, second) {
  try {
    const common = (root) => path.resolve(root, execFileSync("git", ["-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim());
    return common(first) === common(second);
  } catch { return false; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    const selectedContext = projectContext(input.project || ".");
    const cfg = loadConfig(selectedContext);
    if (!enabled(cfg, selectedContext)) process.exit(0);
    if (input.action === "require") {
      fs.mkdirSync(sessionDir(sidOf(input), selectedContext), { recursive: true });
      fs.writeFileSync(requiredFile(input), new Date().toISOString() + "\n");
      process.stdout.write(`scope required for session ${sidOf(input)}\n`);
      process.exit(0);
    }
    if (input.action === "release") {
      let binding;
      try { binding = JSON.parse(fs.readFileSync(worktreeBindingPath(input, { ...selectedContext, worktreePath: input.worktree_path }), "utf8")); } catch {}
      if (binding && binding.session_id !== sidOf(input)) throw new Error("worktree is owned by another session");
      clearWorktreeBinding(input, selectedContext);
      process.stdout.write(`worktree binding released for session ${sidOf(input)}\n`);
      process.exit(0);
    }
    const scope = normalizeScope(input);
    for (const list of Object.values(scope.scope)) {
      for (const entry of list) {
        const absolute = path.resolve(scope.project_root, entry);
        if (absolute !== scope.project_root && !absolute.startsWith(scope.project_root + path.sep)) {
          throw new Error(`scope path escapes project root: ${entry}`);
        }
      }
    }
    if (scope.worktree_path) {
      if (!fs.existsSync(scope.worktree_path) || !isGitRoot(scope.worktree_path) || !sameRepository(scope.worktree_path, selectedContext.root)) {
        throw new Error(`worktree_path is not an existing Git worktree: ${scope.worktree_path}`);
      }
      const branch = execFileSync("git", ["-C", scope.worktree_path, "branch", "--show-current"], { encoding: "utf8" }).trim();
      if (!branch) throw new Error(`worktree_path is detached: ${scope.worktree_path}`);
      writeWorktreeBinding(input, {
        session_id: sidOf(input),
        plan: scope.plan,
        unit: scope.unit,
        project: scope.project,
        worktree_path: scope.worktree_path,
        branch,
        activated_at: scope.activated_at,
      }, { ...selectedContext, worktreePath: scope.worktree_path });
    }
    // Architecture decisions are enforced here, not just in prose: a step that
    // writes into a governed area must load its rules doc and cite its rules
    // (arch-check.mjs). Read from the step's own tree, so a worktree sees the
    // rules as they stand on its branch.
    if (cfg.architecture?.enforce !== false) {
      const violations = checkScope(scope, loadRules(scope.project_root, cfg.architecture?.dir || DEFAULT_DIR));
      if (violations.length) {
        throw new Error(`architecture rules not honoured by ${scope.unit}:\n  - ${violations.join("\n  - ")}\n` +
          `Read the governing .rules.md, add it to scope.docs, cite the ARCH ids this unit must obey in "arch" ` +
          `(and in the plan unit), then re-activate. A change that must break a decided rule needs /architect first.`);
      }
    }
    if (scope.project !== "." && !isGitRoot(scope.project_root)) {
      throw new Error(`workspace project is not a Git root: ${scope.project}`);
    }
    atomicWrite(scopeFile(input), JSON.stringify(scope, null, 2) + "\n");
    try { fs.unlinkSync(requiredFile(input)); } catch {}
    logEvent({ ev: "scope_activated", sid: sidOf(input), plan: scope.plan, unit: scope.unit });
    process.stdout.write(`scope active for ${scope.unit}\n`);
  } catch (error) {
    process.stderr.write(`craftsman: scope activation failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
