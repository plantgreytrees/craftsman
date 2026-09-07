#!/usr/bin/env node
// Validate and order scope-specific plan steps without loading plan prose.
import { loadWorkspaceManifest } from "./lib/core.mjs";

export function validateSteps(steps, { workspace = loadWorkspaceManifest() } = {}) {
  if (!Array.isArray(steps) || !steps.length) throw new Error("plan must contain at least one step");
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
  return steps;
}

export function orderSteps(steps) {
  validateSteps(steps);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const input = JSON.parse(raw || "{}");
    const ordered = orderSteps(input.steps || input);
    process.stdout.write(JSON.stringify({ steps: ordered.map(({ id }) => id) }) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: invalid scope-step graph: ${error.message}\n`);
    process.exitCode = 2;
  }
}
