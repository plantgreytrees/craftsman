export const meta = {
  name: 'run',
  description: 'Run a craftsman plan: each unit through agents/unit-runner.md in plan-graph order',
  whenToUse: 'Launched by /orchestrate or /craftsman:auto when execution.engine is "workflow"',
  phases: [
    { title: 'Implement', detail: 'smoke gate, implement, commit in the unit worktree' },
    { title: 'Review', detail: 'fresh reviewer; at most 2 fix rounds, then park' },
    { title: 'Land', detail: 'merge and tracker, or park with a decision' },
  ],
}

// Orchestration only (ARCH-ENGINE-03): no filesystem, shell, module loading or clock here.
// Every repo action runs inside an agent through craftsman's own scripts.
// args: { sessionId, pluginRoot, projectRoot, protocolText?, project, plan,
//         units: [{ unit, depends_on?, task, criteria, scope, arch }] }

const MAX_FIX_ROUNDS = 2
// ARCH-ENGINE-06: root keeps per-unit summaries of at most ~2k tokens.
const SUMMARY_CHARS = 8000

const RESULT = {
  type: 'object',
  properties: {
    unit: { type: 'string' },
    status: { type: 'string', enum: ['IMPLEMENTED', 'APPROVED', 'CHANGES', 'MERGED', 'PARKED', 'BLOCKED'] },
    evidence: { type: 'string' },
    sha: { type: 'string' },
    pr: { type: 'string' },
    worktree_path: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    parked: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          recommended: { type: 'string' },
        },
        required: ['question', 'options'],
      },
    },
  },
  required: ['unit', 'status', 'evidence', 'parked'],
}

// Stable topological order over depends_on (ARCH-ENGINE-09): the caller's
// order wherever the graph allows it. A dependency outside this run is
// treated as already landed; a cycle is a plan error, never a guess.
function planOrder(units) {
  const ids = new Set(units.map((u) => u.unit))
  const done = new Set()
  const order = []
  while (order.length < units.length) {
    const next = units.find((u) => !done.has(u.unit) && (u.depends_on || []).every((d) => done.has(d) || !ids.has(d)))
    if (!next) throw new Error(`dependency cycle among: ${units.filter((u) => !done.has(u.unit)).map((u) => u.unit).join(', ')}`)
    done.add(next.unit)
    order.push(next)
  }
  return order
}

// The protocol reaches the agent before any scope exists, so it can't be a
// file the agent reads (pre-guard blocks it). Installed: the unit-runner
// agent type carries agents/unit-runner.md as its system prompt. Otherwise
// the caller passes that file's text in args.protocolText.
function brief(role, u, extra) {
  return [
    args.protocolText
      ? `Follow the "role: ${role}" section of this protocol exactly. Return only its schema JSON.\n<protocol>\n${args.protocolText}\n</protocol>`
      : `Follow the "role: ${role}" section of your unit-runner protocol exactly. Return only its schema JSON.`,
    `session_id: ${args.sessionId}`,
    `plugin_root: ${args.pluginRoot}`,
    `project_root: ${args.projectRoot}`,
    `project: ${args.project}`,
    `plan: ${args.plan}`,
    `unit: ${u.unit}`,
    `arch: ${JSON.stringify(u.arch || [])}`,
    `scope: ${JSON.stringify(u.scope)}`,
    `task: ${u.task}`,
    `criteria: ${JSON.stringify(u.criteria || [])}`,
    extra || '',
  ].join('\n')
}

function run(role, u, phase, extra) {
  return agent(brief(role, u, extra), {
    label: `${role}:${u.unit}`,
    phase,
    schema: RESULT,
    ...(args.protocolText ? {} : { agentType: 'craftsman:unit-runner' }),
  })
}

function dead(u, role) {
  return { unit: u.unit, status: 'BLOCKED', evidence: `${role} agent returned nothing`, parked: [] }
}

// ARCH-ENGINE-05: a separate fresh reviewer per round, at most 2 fix rounds, then PARK.
async function reviewLoop(done, u) {
  if (!done || done.status !== 'IMPLEMENTED') return done || dead(u, 'implement')
  let head = done
  for (let round = 0; ; round++) {
    const review = await run('review', u, 'Review', `worktree_path: ${head.worktree_path}`)
    if (!review) return dead(u, 'review')
    if (review.status === 'APPROVED') return head
    if (round === MAX_FIX_ROUNDS) {
      return {
        ...head,
        status: 'PARKED',
        evidence: `review rounds exhausted: ${(review.findings || []).join('; ')}`,
        parked: [{ question: `Unit ${u.unit} still fails review after ${MAX_FIX_ROUNDS} fix rounds. How should it proceed?`,
          options: ['Amend the plan or criteria', 'Accept the findings as follow-up rows', 'Drop the unit'] }],
      }
    }
    const fixed = await run('implement', u, 'Implement',
      `fix round ${round + 1}\nworktree_path: ${head.worktree_path}\nfindings: ${JSON.stringify(review.findings)}`)
    if (!fixed || fixed.status !== 'IMPLEMENTED') return fixed || dead(u, 'implement')
    head = fixed
  }
}

// ARCH-ENGINE-07: an open decision parks the unit with that decision; the
// park agent records it in the tracker and keeps the branch.
async function park(result, u) {
  const parked = await run('park', u, 'Land',
    `reason: ${result.evidence}\nworktree_path: ${result.worktree_path || ''}\nparked: ${JSON.stringify(result.parked)}`)
  return { ...(parked || result), status: 'PARKED', parked: result.parked }
}

// Every other unfinished unit is recorded BLOCKED and its claim released,
// so no row is left IN_PROGRESS behind a returned run.
async function block(result, u) {
  const blocked = await run('block', u, 'Land',
    `reason: ${result.evidence}\nworktree_path: ${result.worktree_path || ''}`)
  const recorded = blocked ? blocked.evidence : 'block agent returned nothing; tracker row not updated'
  return { ...result, status: 'BLOCKED', evidence: `${result.evidence} | ${recorded}`, parked: [] }
}

// Landing parks (conflict, ff-only, rejected push, auto-merge; ARCH-LAND-06)
// go through park like any other, so Phase C sees their decision (ARCH-TRACKER-03).
async function close(result, u) {
  let out = result
  if (out.status === 'IMPLEMENTED') {
    const landed = (await run('land', u, 'Land', `worktree_path: ${out.worktree_path}`)) || dead(u, 'land')
    out = { ...landed, worktree_path: landed.worktree_path || out.worktree_path }
  }
  if (out.status === 'MERGED') return out
  if (out.status === 'PARKED') return park(out, u)
  return block(out, u)
}

function summary(result) {
  const keep = {
    unit: result.unit,
    status: result.status,
    evidence: String(result.evidence || '').slice(0, 2000),
    ...(result.sha ? { sha: result.sha } : {}),
    ...(result.pr ? { pr: result.pr } : {}),
    parked: result.parked || [],
  }
  while (JSON.stringify(keep).length > SUMMARY_CHARS && keep.parked.length) keep.parked.pop()
  return keep
}

// Sequential in plan-graph order (ARCH-ENGINE-09): one unit's pipeline
// finishes before the next starts, until parallel scope isolation is proven.
// A unit whose dependency did not land stays PENDING, never dispatched.
const results = []
const landed = new Set()
const ids = new Set(args.units.map((u) => u.unit))
for (const u of planOrder(args.units)) {
  const waiting = (u.depends_on || []).filter((d) => ids.has(d) && !landed.has(d))
  if (waiting.length) {
    results.push({ unit: u.unit, status: 'PENDING', evidence: `waiting on ${waiting.join(', ')}`, parked: [] })
    continue
  }
  log(`unit ${u.unit}`)
  const [result] = await pipeline([u], (item) => run('implement', item, 'Implement'), reviewLoop, close)
  const done = summary(result || await block(dead(u, 'pipeline'), u))
  if (done.status === 'MERGED') landed.add(u.unit)
  results.push(done)
}
return { results }
