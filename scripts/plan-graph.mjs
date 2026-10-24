#!/usr/bin/env node
// Validate and order scope-specific plan steps without loading plan prose.
import { isMain, loadConfig, loadWorkspaceManifest, projectIdOf } from "./lib/core.mjs";
import { loadIndex } from "./lib/plan-index.mjs";
import { checkSubmoduleBumps } from "./lib/plan-submodules.mjs";

// `project:` and `bumps:` may be written as manifest ids or as the project's declared root path.
function canonicalSteps(steps, workspace) {
  if (!workspace) return steps;
  const id = (ref) => (typeof ref === "string" ? projectIdOf(workspace, ref) ?? ref : ref);
  return steps.map((step) => (step && typeof step === "object" && (step.project !== undefined || step.bumps !== undefined)
    ? { ...step, ...(step.project !== undefined ? { project: id(step.project) } : {}), ...(step.bumps !== undefined ? { bumps: id(step.bumps) } : {}) }
    : step));
}

export function validateSteps(given, { workspace = loadWorkspaceManifest(), isGitlink, featureUnitCap = 8, featureBranches = false } = {}) {
  if (!Array.isArray(given) || !given.length) throw new Error("plan must contain at least one step");
  const steps = canonicalSteps(given, workspace);
  const ids = new Set();
  for (const step of steps) {
    if (!step || typeof step !== "object" || typeof step.id !== "string" || !step.id.trim()) {
      throw new Error("every scope step needs a non-empty id");
    }
    if (ids.has(step.id)) throw new Error(`duplicate scope step: ${step.id}`);
    ids.add(step.id);
    if (typeof step.scope_id !== "string" || !step.scope_id.trim()) {
      throw new Error(`scope step ${step.id} needs scope_id`);
    }
    if (step.project !== undefined && (typeof step.project !== "string" || !step.project.trim())) {
      throw new Error(`scope step ${step.id} has an invalid project`);
    }
    if (workspace && step.project && step.project !== "." && !workspace.projects[step.project]) {
      throw new Error(`scope step ${step.id} references unknown workspace project: ${step.project}`);
    }
    if (!Array.isArray(step.depends_on)) throw new Error(`scope step ${step.id} needs depends_on`);
    for (const dependency of step.depends_on) {
      if (typeof dependency !== "string" || !ids.has(dependency) && !steps.some((candidate) => candidate?.id === dependency)) {
        throw new Error(`scope step ${step.id} depends on unknown step: ${dependency}`);
      }
      if (dependency === step.id) throw new Error(`scope step ${step.id} cannot depend on itself`);
    }
  }
  checkFeatures(steps, featureUnitCap, featureBranches); // ARCH-ENGINE-18
  if (workspace) checkSubmoduleBumps(steps, workspace, { isGitlink }); // ARCH-LAND-03
  return steps;
}

const IMPLICIT_FEATURE = "";

function featureOf(step) {
  return step.feature === undefined ? IMPLICIT_FEATURE : step.feature;
}

// ARCH-ENGINE-18: steps without a feature share one implicit feature; a feature
// holds at most featureUnitCap steps and never depends on a later feature. The
// implicit feature is capped only with planning.featureBranches (its worktree path).
function checkFeatures(steps, cap, capImplicit) {
  const rank = new Map();
  const counts = new Map();
  for (const step of steps) {
    if (step.feature !== undefined && (typeof step.feature !== "string" || !step.feature.trim())) {
      throw new Error(`scope step ${step.id} has an invalid feature`);
    }
    const feature = featureOf(step);
    if (!rank.has(feature)) rank.set(feature, rank.size);
    counts.set(feature, (counts.get(feature) || 0) + 1);
  }
  for (const [feature, count] of counts) {
    if (count > cap && (feature !== IMPLICIT_FEATURE || capImplicit)) {
      throw new Error(`feature ${feature || "(implicit)"} has ${count} units, over the cap of ${cap}`);
    }
  }
  const byId = new Map(steps.map((step) => [step.id, step]));
  for (const step of steps) {
    for (const dependency of step.depends_on) {
      if (rank.get(featureOf(byId.get(dependency))) > rank.get(featureOf(step))) {
        throw new Error(`scope step ${step.id} depends on ${dependency} in a later feature`);
      }
    }
  }
}

// ARCH-ENGINE-16: batches of 2+ only when maxSubagents >= 2, with no depends_on
// between batch members and disjoint scope.write; otherwise one step per batch.
export function waves(steps, { maxSubagents = 0 } = {}) {
  const batches = [];
  const limit = Number.isInteger(maxSubagents) ? maxSubagents : 0;
  if (limit < 2) return steps.map((step) => [step]);
  const writes = (step) => step.scope?.write || [];
  const overlap = (a, b) => writes(a).some((x) => writes(b).some((y) => x === y
    || x.startsWith(y.endsWith("/") ? y : `${y}/`) || y.startsWith(x.endsWith("/") ? x : `${x}/`)));
  let batch = [];
  const flush = () => { if (batch.length) batches.push(batch); batch = []; };
  for (const step of steps) {
    const fits = batch.length < limit && batch.every((other) => featureOf(other) === featureOf(step)
      && !step.depends_on.includes(other.id) && !other.depends_on.includes(step.id) && !overlap(step, other));
    if (!fits) flush();
    batch.push(step);
  }
  flush();
  return batches;
}

export function orderSteps(given, options) {
  const steps = validateSteps(given, options);
  const byId = new Map(steps.map((step) => [step.id, step]));
  const state = new Map();
  const ordered = [];
  function visit(id, trail = []) {
    const current = state.get(id);
    if (current === "done") return;
    if (current === "active") throw new Error(`scope step dependency cycle: ${[...trail, id].join(" -> ")}`);
    state.set(id, "active");
    for (const dependency of byId.get(id).depends_on) visit(dependency, [...trail, id]);
    state.set(id, "done");
    ordered.push(byId.get(id));
  }
  for (const step of steps) visit(step.id);
  return ordered;
}

// Tag untagged steps from a plan's features: groups (plan-index), by step id or scope_id.
export function tagFeatures(steps, groups) {
  const of = new Map();
  for (const g of groups) if (!g.implicit) for (const id of g.units) of.set(id, g.id);
  return steps.map((s) => (s && s.feature === undefined && (of.has(s.id) || of.has(s.scope_id))
    ? { ...s, feature: of.get(s.id) ?? of.get(s.scope_id) } : s));
}

if (isMain(import.meta.url)) {
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const input = JSON.parse(raw || "{}");
    const planning = loadConfig().planning || {};
    let steps = input.steps || input;
    if (input.plan && Array.isArray(steps)) steps = tagFeatures(steps, loadIndex().nodes.get(input.plan)?.features || []);
    const ordered = orderSteps(steps, { featureBranches: planning.featureBranches === true, featureUnitCap: Number.isInteger(planning.featureUnitCap) ? planning.featureUnitCap : 8 });
    process.stdout.write(JSON.stringify({ steps: ordered.map(({ id }) => id) }) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: invalid scope-step graph: ${error.message}\n`);
    process.exitCode = 2;
  }
}
