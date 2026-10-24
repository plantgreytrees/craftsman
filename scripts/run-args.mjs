#!/usr/bin/env node
// Builds the structured args for workflows/run.js (craftsman:run) from a plan doc and
// .craftsman/acceptance.md, so root never hand-assembles them. The workflow runs ONE
// project per run, so a plan that spans projects comes back as `runs`: consecutive units
// of one project, in plan-graph order. Root launches them in order and stops at the first
// run in which a unit did not MERGE (a later run may depend on it).
//   in : {"plan":"docs/plans/<slug>.md","session_id":"<id>"}
//   out: {"runs":[{"project","units":[…],"args":{…}}],"warnings":[…]}
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_ROOT, PROJECT_ROOT, acceptanceCriteria, isMain, loadConfig, loadWorkspaceManifest, mainCheckoutRoot, readStdin } from "./lib/core.mjs";
import { loadIndex, parseFrontmatter } from "./lib/plan-index.mjs";
import { orderSteps, tagFeatures } from "./plan-graph.mjs";

const TASK_CAP = 12000;

// The "### Step N — <scope_id> …" section of the plan body: the unit's task text.
function stepSection(body, unit) {
  const lines = body.split("\n");
  const head = lines.findIndex((line) => /^###\s/.test(line)
    && (new RegExp(`(^|[\\s—–-])${unit.scope_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s(]|$)`).test(line) || new RegExp(`^###\\s+Step\\s+${String(unit.id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(line)));
  if (head < 0) return "";
  let end = lines.findIndex((line, i) => i > head && /^#{2,3}\s/.test(line));
  if (end < 0) end = lines.length;
  return lines.slice(head, end).join("\n").trim().slice(0, TASK_CAP);
}

export function buildRunArgs({ root, plan, sessionId, config = {}, workspace = null, acceptanceText = "", pluginRoot = PLUGIN_ROOT, projectRoot = root, featuresText = "" }) {
  const warnings = [];
  const text = fs.readFileSync(path.join(root, plan), "utf8");
  const fm = parseFrontmatter(text);
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const raw = Array.isArray(fm.units) ? fm.units.filter((u) => u && typeof u === "object" && u.id != null) : [];
  if (!raw.length) throw new Error(`${plan} has no units: in its frontmatter`);
  const ids = new Set(raw.map((u) => String(u.id)));
  const byScope = new Map(raw.map((u) => [String(u.scope_id ?? u.id), String(u.id)]));
  const steps = raw.map((u) => {
    if (u.scope_id == null) warnings.push(`unit ${u.id} has no scope_id; using its id`);
    const list = u.depends_on == null ? [] : Array.isArray(u.depends_on) ? u.depends_on : [u.depends_on];
    return {
      ...u,
      id: String(u.id),
      scope_id: String(u.scope_id ?? u.id),
      depends_on: list.map(String).map((d) => (ids.has(d) ? d : byScope.get(d) ?? d)),
    };
  });
  let groups = [];
  try { groups = loadIndex(root).nodes.get(String(fm.slug || path.basename(plan, ".md")))?.features || []; } catch (error) { warnings.push(`plan index unavailable: ${error.message}`); }
  const planning = config.planning || {};
  const featureBranches = planning.featureBranches === true;
  const ordered = orderSteps(tagFeatures(steps, groups), {
    workspace, featureBranches, featureUnitCap: Number.isInteger(planning.featureUnitCap) ? planning.featureUnitCap : 8,
  });
  const nameOf = new Map(ordered.map((step) => [step.id, step.scope_id]));
  const criteria = acceptanceCriteria(acceptanceText);

  const runs = [];
  for (const step of ordered) {
    const project = step.project && step.project !== "" ? step.project : ".";
    let run = runs[runs.length - 1];
    if (!run || run.project !== project) runs.push((run = { project, units: [] }));
    const task = stepSection(body, step);
    if (!task) warnings.push(`no "### Step … ${step.scope_id}" section found for unit ${step.scope_id}; task text left generic`);
    run.units.push({
      unit: step.scope_id,
      ...(step.feature !== undefined ? { feature: step.feature } : {}),
      depends_on: step.depends_on.map((d) => nameOf.get(d) ?? d),
      task: task || `Implement unit ${step.scope_id} of ${plan} (${step.module || "see plan"}).`,
      criteria: criteria.filter((c) => c.unit === step.scope_id || c.unit === step.id).map((c) => c.line),
      scope: step.scope || { read: [], docs: [], write: [] },
      arch: Array.isArray(step.arch) ? step.arch : [],
    });
  }
  return {
    runs: runs.map((run) => ({
      project: run.project,
      units: run.units.map((u) => u.unit),
      args: {
        sessionId, pluginRoot, projectRoot, project: run.project, plan,
        featureBranches,
        ...(Number.isInteger(config.execution?.maxSubagents) ? { maxSubagents: config.execution.maxSubagents } : {}),
        ...(featureBranches && featuresText ? { featuresText } : {}),
        units: run.units,
      },
    })),
    warnings,
  };
}

if (isMain(import.meta.url)) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    if (!input.plan || !input.session_id) throw new Error('input needs {"plan":"docs/plans/<slug>.md","session_id":"<id>"}');
    const root = mainCheckoutRoot(PROJECT_ROOT);
    const config = loadConfig({ id: ".", root, stateDir: path.join(root, ".craftsman") });
    let acceptanceText = "";
    try { acceptanceText = fs.readFileSync(path.join(root, ".craftsman", "acceptance.md"), "utf8"); } catch {}
    let featuresText = "";
    try { featuresText = fs.readFileSync(path.join(PLUGIN_ROOT, "commands", "_features.md"), "utf8"); } catch {}
    const result = buildRunArgs({
      root, plan: input.plan, sessionId: input.session_id, config, workspace: loadWorkspaceManifest(), acceptanceText, projectRoot: root, featuresText,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: cannot build run args: ${error.message}\n`);
    process.exitCode = 2;
  }
}
