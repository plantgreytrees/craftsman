// ARCH-LAND-03: a submodule's pointer bump is an explicit step in its parent
// (`bumps: "<submodule>"`) that lands after every step in the submodule.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// True when the parent repo's index records a gitlink (mode 160000) at the
// child's path: what `git submodule status` reports, read from a registered
// root or the workspace root only (ARCH-LAND-07). A git failure throws, so an
// unreadable index never silently drops the bump requirement.
export function gitlinkAt(parentRoot, childRoot) {
  const rel = path.relative(parentRoot, childRoot).split(path.sep).join("/");
  let out;
  try {
    // -z: paths come back unquoted, so a non-ASCII or `"` name still matches.
    out = execFileSync("git", ["--literal-pathspecs", "-C", parentRoot, "ls-files", "-s", "-z", "--", rel], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(`cannot read the git index of ${parentRoot} to find submodules: ${String(error.stderr || error.message).trim()}`);
  }
  return out.split("\0").some((entry) => entry.startsWith("160000 ") && entry.endsWith(`\t${rel}`));
}

// A registered project is a submodule of the nearest registered project whose
// root encloses it, when that parent holds a gitlink to it. A nested
// independent clone, or a project rooted at the workspace root, is not. With
// no registered parent, a gitlink in an unregistered superproject at the
// workspace root maps the project to null: it has a parent nothing can bump.
export function submoduleParents(workspace, isGitlink = gitlinkAt) {
  const entries = Object.entries(workspace?.projects || {}).filter(([, project]) => typeof project?.root === "string");
  const superRoot = workspace?.workspaceRoot;
  const superproject = typeof superRoot === "string" && !entries.some(([, project]) => project.root === superRoot)
    && fs.existsSync(path.join(superRoot, ".git"));
  const parents = new Map();
  for (const [id, { root }] of entries) {
    let parent = null;
    for (const [other, { root: outer }] of entries) {
      if (other === id || !root.startsWith(outer + path.sep)) continue;
      if (!parent || outer.length > parent.root.length) parent = { id: other, root: outer };
    }
    if (parent) {
      if (isGitlink(parent.root, root)) parents.set(id, parent.id);
    } else if (superproject && root.startsWith(superRoot + path.sep) && isGitlink(superRoot, root)) {
      parents.set(id, null);
    }
  }
  return parents;
}

function dependsOn(byId, from, target) {
  const seen = new Set();
  const pending = [...byId.get(from).depends_on];
  while (pending.length) {
    const id = pending.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...byId.get(id).depends_on);
  }
  return false;
}

// Steps are already validated (ids unique, dependencies known).
export function checkSubmoduleBumps(steps, workspace, { isGitlink } = {}) {
  const parents = submoduleParents(workspace, isGitlink);
  const byId = new Map(steps.map((step) => [step.id, step]));
  for (const step of steps) {
    if (step.bumps === undefined) continue;
    // has(): a step with no project must not match an absent entry (undefined).
    if (typeof step.bumps !== "string" || !parents.has(step.bumps) || parents.get(step.bumps) !== step.project) {
      throw new Error(`scope step ${step.id} bumps ${step.bumps}, which is not a submodule of its project ${step.project}`);
    }
  }
  for (const submodule of new Set(steps.map((step) => step.project).filter((project) => parents.has(project)))) {
    if (parents.get(submodule) === null) {
      throw new Error(`steps in submodule ${submodule} need a bump in its superproject, which is not registered: add the workspace root to craftsman.workspace.json so a step there can carry bumps: "${submodule}" (ARCH-LAND-03)`);
    }
    const bumps = steps.filter((step) => step.bumps === submodule);
    if (!bumps.length) {
      throw new Error(`steps in submodule ${submodule} need a bump step in ${parents.get(submodule)} with bumps: "${submodule}" (ARCH-LAND-03)`);
    }
    for (const bump of bumps) {
      for (const step of steps.filter((candidate) => candidate.project === submodule)) {
        if (!dependsOn(byId, bump.id, step.id)) {
          throw new Error(`bump step ${bump.id} must depend on submodule step ${step.id} (ARCH-LAND-03)`);
        }
      }
    }
  }
}
