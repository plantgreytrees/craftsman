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
async function runPlan(units, respond) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const pipelines = [];
  const agent = async (prompt, opts) => {
    const role = /role: (\w+)/.exec(prompt)[1];
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
  const args = { sessionId: "s1", pluginRoot: "/p", projectRoot: "/r", project: ".", plan: "docs/plans/x.md", units };
  const out = await workflow(agent, pipeline, async () => [], () => {}, () => {}, args);
  return { ...out, calls, pipelines, maxInFlight };
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
