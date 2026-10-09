// ARCH-LAND-03: a submodule's pointer bump is an explicit step in its parent
// (`bumps: "<submodule>"`) that lands after every step in the submodule.
import path from "node:path";

// A registered project whose root sits inside another registered project's
// root is a submodule of the nearest enclosing one (ARCH-LAND-04: only
// registered projects, never a directory scan).
export function submoduleParents(workspace) {
  const entries = Object.entries(workspace?.projects || {}).filter(([, project]) => typeof project?.root === "string");
  const parents = new Map();
  for (const [id, { root }] of entries) {
    let parent = null;
    for (const [other, { root: outer }] of entries) {
      if (other === id || !root.startsWith(outer + path.sep)) continue;
      if (!parent || outer.length > parent.root.length) parent = { id: other, root: outer };
    }
    if (parent) parents.set(id, parent.id);
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
export function checkSubmoduleBumps(steps, workspace) {
  const parents = submoduleParents(workspace);
  const byId = new Map(steps.map((step) => [step.id, step]));
  for (const step of steps) {
    if (step.bumps === undefined) continue;
    if (typeof step.bumps !== "string" || parents.get(step.bumps) !== step.project) {
      throw new Error(`scope step ${step.id} bumps ${step.bumps}, which is not a submodule of its project ${step.project}`);
    }
  }
  for (const submodule of new Set(steps.map((step) => step.project).filter((project) => parents.has(project)))) {
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
