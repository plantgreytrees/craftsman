// workflows/run.js under a stub workflow runtime: the script is plain
// orchestration (ARCH-ENGINE-03), so its body runs as an async function with
// agent/pipeline/log/args injected — no Claude Code needed to pin its bounds.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "workflows", "run.js");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const body = fs.readFileSync(RUN, "utf8").replace(/^export const meta\b/m, "const meta");
const workflow = new AsyncFunction("agent", "pipeline", "parallel", "log", "phase", "args", body);

// respond(role, unit, call) → the agent's schema result (or null for a dead agent).
async function runPlan(units, respond, extraArgs = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const pipelines = [];
  let waves = 0;
  const agent = async (prompt, opts) => {
    const role = /role: ([\w-]+)/.exec(prompt)[1];
    const unit = /^unit: (.+)$/m.exec(prompt)[1];
    calls.push({ role, unit, opts, prompt });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    inFlight--;
    return respond(role, unit, calls.filter((c) => c.unit === unit && c.role === role).length);
  };
  const pipeline = async (items, ...stages) => {
    pipelines.push(items.map((i) => i.unit));
    return Promise.all(items.map(async (item, index) => {
      let value = item;
      for (const stage of stages) value = await stage(value, item, index);
      return value;
    }));
  };
  const args = { sessionId: "s1", pluginRoot: "/p", projectRoot: "/r", project: ".", plan: "docs/plans/x.md", units, ...extraArgs };
  const out = await workflow(agent, pipeline, async (thunks) => { waves++; return Promise.all(thunks.map((t) => t())); }, () => {}, () => {}, args);
  return { ...out, calls, pipelines, maxInFlight, waves };
}

const unit = (id, depends_on = []) => ({ unit: id, depends_on, task: `do ${id}`, criteria: [], scope: {}, arch: [] });
const happy = (role, u) => ({
  implement: { unit: u, status: "IMPLEMENTED", evidence: "done", worktree_path: `/w/${u}`, parked: [] },
  review: { unit: u, status: "APPROVED", evidence: "ok", parked: [] },
  land: { unit: u, status: "MERGED", evidence: "merged", sha: "abc", parked: [] },
}[role]);

test("engine: units run one at a time through pipeline(), in plan-graph order, every agent() with the schema", async () => {
  const { results, calls, pipelines, maxInFlight } = await runPlan([unit("c", ["b"]), unit("a"), unit("b", ["a"])], happy);
  assert.deepEqual(pipelines, [["a"], ["b"], ["c"]]);
  assert.equal(maxInFlight, 1, "sequential (ARCH-ENGINE-09)");
  assert.deepEqual(results.map((r) => [r.unit, r.status]), [["a", "MERGED"], ["b", "MERGED"], ["c", "MERGED"]]);
  assert.deepEqual(calls.filter((c) => c.unit === "a").map((c) => c.role), ["implement", "review", "land"]);
  for (const call of calls) {
    assert.equal(call.opts.schema?.type, "object");
    assert.deepEqual(call.opts.schema.required, ["unit", "status", "evidence", "parked"]);
    assert.equal(call.opts.agentType, "craftsman:unit-runner");
  }
});

test("engine: a dependency cycle is refused, never guessed", async () => {
  await assert.rejects(runPlan([unit("a", ["b"]), unit("b", ["a"])], happy), /dependency cycle/);
});

test("engine: a separate reviewer each round, at most 2 fix rounds, then PARK with a decision", async () => {
  const { results, calls } = await runPlan([unit("a"), unit("b", ["a"]), unit("c")], (role, u) =>
    u === "a" && role === "review" ? { unit: u, status: "CHANGES", evidence: "no", findings: ["bug"], parked: [] }
      : role === "park" ? { unit: u, status: "PARKED", evidence: "parked", parked: [] }
      : happy(role, u));
  const roles = calls.filter((c) => c.unit === "a").map((c) => c.role);
  assert.deepEqual(roles, ["implement", "review", "implement", "review", "implement", "review", "park"]);
  assert.match(calls.find((c) => c.unit === "a" && c.role === "implement" && /fix round 2/.test(c.prompt)).prompt, /findings: \["bug"\]/);
  const [a, b, c] = results;
  assert.equal(a.status, "PARKED");
  assert.equal(a.parked.length, 1, "parks with a structured decision (ARCH-ENGINE-07)");
  assert.deepEqual(a.parked[0].options.length > 1, true);
  assert.equal(b.status, "PENDING", "a dependant of a parked unit is never dispatched");
  assert.match(b.evidence, /waiting on a/);
  assert.equal(calls.some((call) => call.unit === "b"), false);
  assert.equal(c.status, "MERGED", "an independent unit still runs");
});

test("engine: an open decision from the implementer parks the unit with that decision; dependants stay PENDING", async () => {
  const decision = { question: "Which store?", options: ["sqlite", "json"], recommended: "json" };
  const { results, calls } = await runPlan([unit("a"), unit("b", ["a"])], (role, u) =>
    role === "implement" ? { unit: u, status: "PARKED", evidence: "open decision", worktree_path: "/w/a", parked: [decision] }
      : role === "park" ? { unit: u, status: "PARKED", evidence: "tracker PARKED", parked: [] }
      : happy(role, u));
  assert.deepEqual(calls.map((c) => c.role), ["implement", "park"], "no review, no default");
  assert.match(calls[1].prompt, /Which store\?/);
  assert.deepEqual(results[0].parked, [decision]);
  assert.equal(results[1].status, "PENDING");
});

test("engine: a dead agent blocks its unit; root keeps only bounded per-unit summaries", async () => {
  const huge = "x".repeat(50000);
  const { results } = await runPlan([unit("a"), unit("b")], (role, u) =>
    u === "a" && role === "review" ? null
      : role === "land" ? { unit: u, status: "MERGED", evidence: huge, sha: "abc", worktree_path: "/w", findings: [huge], parked: [] }
      : happy(role, u));
  assert.equal(results[0].status, "BLOCKED");
  assert.match(results[0].evidence, /review agent returned nothing/);
  for (const r of results) assert.ok(JSON.stringify(r).length <= 8000, "≤ ~2k tokens per unit (ARCH-ENGINE-06)");
  assert.equal(results[1].findings, undefined, "bulky agent output stays out of root");
});

test("engine: a landing park runs the park role with its decision, so the ledger gets it (ARCH-LAND-06, TRACKER-03)", async () => {
  const decision = { question: "Merge conflict in a.js. How should it land?", options: ["Rebase and retry", "Leave the branch"] };
  const { results, calls } = await runPlan([unit("a"), unit("b", ["a"])], (role, u) =>
    role === "land" ? { unit: u, status: "PARKED", evidence: "conflict", parked: [decision] }
      : role === "park" ? { unit: u, status: "PARKED", evidence: "tracker PARKED", parked: [] }
      : happy(role, u));
  assert.deepEqual(calls.filter((c) => c.unit === "a").map((c) => c.role), ["implement", "review", "land", "park"]);
  const parkCall = calls.find((c) => c.role === "park");
  assert.match(parkCall.prompt, /Merge conflict in a\.js/);
  assert.match(parkCall.prompt, /worktree_path: \/w\/a/, "the implement worktree reaches park");
  assert.equal(results[0].status, "PARKED");
  assert.deepEqual(results[0].parked, [decision]);
  assert.equal(results[1].status, "PENDING");
});

test("engine: a BLOCKED implement result runs the block role once; the unit is never left IN_PROGRESS", async () => {
  const { results, calls } = await runPlan([unit("a"), unit("b", ["a"])], (role, u) =>
    role === "implement" ? { unit: u, status: "BLOCKED", evidence: "suite fails", worktree_path: "/w/a", parked: [] }
      : role === "block" ? { unit: u, status: "BLOCKED", evidence: "tracker BLOCKED, claim released", parked: [] }
      : happy(role, u));
  assert.deepEqual(calls.map((c) => c.role), ["implement", "block"]);
  assert.match(calls[1].prompt, /reason: suite fails/);
  assert.equal(results[0].status, "BLOCKED");
  assert.match(results[0].evidence, /suite fails \| tracker BLOCKED/);
  assert.equal(results[1].status, "PENDING");
});

test("engine: a dead land agent is blocked through the block role with the implement worktree", async () => {
  const { results, calls } = await runPlan([unit("a")], (role, u) =>
    role === "land" ? null
      : role === "block" ? { unit: u, status: "BLOCKED", evidence: "tracker BLOCKED", parked: [] }
      : happy(role, u));
  assert.deepEqual(calls.map((c) => c.role), ["implement", "review", "land", "block"]);
  assert.match(calls[3].prompt, /worktree_path: \/w\/a/);
  assert.match(results[0].evidence, /land agent returned nothing/);
});

const inFeature = (id, u, deps = [], write = [`${u}/`]) => ({ ...unit(u, deps), feature: id, scope: { write } });
const featureHappy = (role, u) => role === "land-feature"
  ? { unit: u, status: "MERGED", evidence: "feature merged", sha: "fff", parked: [] }
  : { ...happy(role, u), ...(role === "implement" ? { worktree_path: "/w/feat" } : {}) };
const FEATURES = { featureBranches: true, maxSubagents: 0 };

test("engine: featureBranches groups units by feature, carries the first unit's worktree_path, lands each feature once", async () => {
  const units = [inFeature("f1", "a"), inFeature("f2", "c"), inFeature("f1", "b", ["a"])];
  const { results, calls } = await runPlan(units, featureHappy, FEATURES);
  const order = calls.filter((c) => c.role === "implement").map((c) => c.unit);
  assert.deepEqual(order, ["a", "b", "c"], "a feature's units run together, features in first-seen order");
  const implement = (u) => calls.find((c) => c.unit === u && c.role === "implement").prompt;
  assert.doesNotMatch(implement("a"), /^worktree_path:/m, "first unit prepares");
  assert.match(implement("a"), /^feature: f1$/m);
  assert.match(implement("b"), /^worktree_path: \/w\/feat$/m, "later unit reattaches");
  assert.match(implement("c"), /^feature: f2$/m);
  const lands = calls.filter((c) => c.role === "land-feature");
  assert.deepEqual(lands.map((c) => c.unit), ["b", "c"], "once per feature, after its last unit");
  assert.match(lands[0].prompt, /worktree_path: \/w\/feat/);
  assert.deepEqual(results.map((r) => r.unit), ["a", "b", "feature:f1", "c", "feature:f2"]);
  assert.equal(results.every((r) => r.status === "MERGED"), true);
});

test("engine: land-feature is skipped when a unit of the feature did not land", async () => {
  const { calls } = await runPlan([inFeature("f", "a"), inFeature("f", "b")], (role, u) =>
    u === "b" && role === "review" ? null : role === "block" ? { unit: u, status: "BLOCKED", evidence: "x", parked: [] } : featureHappy(role, u), FEATURES);
  assert.equal(calls.some((c) => c.role === "land-feature"), false);
});

test("engine: a land-feature park goes through park with its decision", async () => {
  const decision = { question: "Base moved. How?", options: ["Rebase", "Leave"] };
  const { results, calls } = await runPlan([inFeature("f", "a")], (role, u) =>
    role === "land-feature" ? { unit: u, status: "PARKED", evidence: "conflict", parked: [decision] }
      : role === "park" ? { unit: u, status: "PARKED", evidence: "recorded", parked: [] } : featureHappy(role, u), FEATURES);
  assert.deepEqual(calls.slice(-2).map((c) => c.role), ["land-feature", "park"]);
  assert.deepEqual(results.at(-1).parked, [decision]);
});

test("engine: without featureBranches there are no feature lines, no land-feature and no wave, whatever the cap", async () => {
  const { calls, waves, maxInFlight } = await runPlan([inFeature("f", "a"), inFeature("f", "b")], featureHappy, { maxSubagents: 4 });
  assert.equal(calls.some((c) => c.role === "land-feature" || /^feature:/m.test(c.prompt)), false);
  assert.equal(waves, 0);
  assert.equal(maxInFlight, 1);
});

test("engine: a wave is inert when maxSubagents is 0 or 1 (units stay sequential)", async () => {
  for (const cap of [0, 1]) {
    const { waves, maxInFlight } = await runPlan([inFeature("f", "a"), inFeature("f", "b"), inFeature("f", "c")], featureHappy, { featureBranches: true, maxSubagents: cap });
    assert.equal(waves, 0, `cap ${cap}`);
    assert.equal(maxInFlight, 1, `cap ${cap}`);
  }
});

test("engine: with a cap of 2 independent, disjoint units run as a wave after the feature's first unit; others stay sequential", async () => {
  const units = [inFeature("f", "a"), inFeature("f", "b"), inFeature("f", "c"), inFeature("f", "d", ["b"]), inFeature("f", "e", [], ["d/"])];
  const { results, calls, waves, maxInFlight } = await runPlan(units, featureHappy, { featureBranches: true, maxSubagents: 2 });
  assert.equal(waves, 1, "b and c only: d depends on b, e overlaps d's scope");
  assert.equal(maxInFlight, 2);
  const implement = (u) => calls.find((c) => c.unit === u && c.role === "implement").prompt;
  assert.match(implement("b"), /^wave: true$/m);
  assert.match(implement("b"), /^feature_worktree: \/w\/feat$/m);
  assert.doesNotMatch(implement("b"), /^worktree_path:/m, "a wave unit never reuses the feature worktree");
  assert.doesNotMatch(implement("a"), /wave: true/);
  assert.doesNotMatch(implement("d"), /wave: true/);
  assert.deepEqual(results.map((r) => r.unit), ["a", "b", "c", "d", "e", "feature:f"]);
});
