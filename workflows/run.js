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
//         featureBranches?, maxSubagents?, featuresText?,
//         units: [{ unit, feature?, depends_on?, task, criteria, scope, arch }] }
// featureBranches mirrors planning.featureBranches and maxSubagents mirrors
// execution.maxSubagents; root reads the config and passes both (the script reads no files).

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
  // Feature protocol (commands/_features.md): inside protocolText when root
  // supplies the protocol, else featuresText beside the installed agent type.
  const features = u.featureId && !args.protocolText && args.featuresText
    ? `\n<features>\n${args.featuresText}\n</features>` : ''
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
    ...(u.featureId ? [`feature: ${u.featureId}`] : []),
    `arch: ${JSON.stringify(u.arch || [])}`,
    `scope: ${JSON.stringify(u.scope)}`,
    `task: ${u.task}`,
    `criteria: ${JSON.stringify(u.criteria || [])}`,
    extra || '',
  ].join('\n') + features
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

// Units group by feature (ARCH-ENGINE-13). Without planning.featureBranches
// there is one group and no feature lines: the single-feature path as before.
const featureMode = args.featureBranches === true
const planSlug = String(args.plan).split('/').pop().replace(/\.md$/, '')
const ordered = planOrder(args.units)
const groups = []
for (const u of ordered) {
  const id = featureMode ? (u.feature || planSlug) : null
  let group = groups.find((g) => g.id === id)
  if (!group) groups.push((group = { id, units: [] }))
  group.units.push(u)
}

// ARCH-ENGINE-16: a wave needs two sub-agents and feature branches; at a cap
// below 2 (the default 0) every batch is one unit and parallel() never runs.
const waveCap = featureMode && Number.isInteger(args.maxSubagents) && args.maxSubagents >= 2 ? args.maxSubagents : 0
const writes = (u) => (u.scope && u.scope.write) || []
const nests = (x, y) => x === y || x.startsWith(y.endsWith('/') ? y : `${y}/`) || y.startsWith(x.endsWith('/') ? x : `${x}/`)
const apart = (a, b) => !(a.depends_on || []).includes(b.unit) && !(b.depends_on || []).includes(a.unit)
  && !writes(a).some((x) => writes(b).some((y) => nests(x, y)))

const results = []
const landed = new Set()
const ids = new Set(args.units.map((u) => u.unit))

async function oneUnit(u, extra) {
  log(`unit ${u.unit}`)
  const [result] = await pipeline([u], (item) => run('implement', item, 'Implement', extra), reviewLoop, close)
  const raw = result || await block(dead(u, 'pipeline'), u)
  return { raw, done: summary(raw) }
}

// ARCH-ENGINE-17: sequential in plan-graph order inside the feature worktree,
// whose worktree_path comes from the feature's first unit result. A unit whose
// dependency did not land stays PENDING, never dispatched.
for (const group of groups) {
  let fw = ''
  const members = []
  const queue = group.units.slice()
  while (queue.length) {
    const batch = [queue.shift()]
    while (waveCap && fw && queue.length && batch.length < waveCap && batch.every((m) => apart(m, queue[0]))) batch.push(queue.shift())
    const runnable = []
    for (const raw of batch) {
      const u = group.id ? { ...raw, featureId: group.id } : raw
      const waiting = (u.depends_on || []).filter((d) => ids.has(d) && !landed.has(d))
      if (waiting.length) {
        members.push(u)
        results.push({ unit: u.unit, status: 'PENDING', evidence: `waiting on ${waiting.join(', ')}`, parked: [] })
      } else runnable.push(u)
    }
    if (!runnable.length) continue
    const wave = runnable.length > 1
    // A wave unit never shares a worktree: it gets its own from the feature branch.
    const outs = wave
      ? await parallel(runnable.map((u) => () => oneUnit(u, `wave: true\nfeature_worktree: ${fw}`)))
      : [await oneUnit(runnable[0], fw ? `worktree_path: ${fw}` : '')]
    runnable.forEach((u, i) => {
      members.push(u)
      const { raw, done } = outs[i]
      if (!wave && !fw && raw.worktree_path && group.id) fw = raw.worktree_path
      if (done.status === 'MERGED') landed.add(u.unit)
      results.push(done)
    })
  }
  // One land-feature call after the feature's last unit, only when every unit landed.
  if (group.id && members.length && members.every((u) => landed.has(u.unit))) {
    const last = members[members.length - 1]
    const out = await run('land-feature', last, 'Land',
      `worktree_path: ${fw}\nunits: ${JSON.stringify(members.map((u) => u.unit))}`) || dead(last, 'land-feature')
    const settled = out.status === 'MERGED' ? out : out.status === 'PARKED' ? await park(out, last) : await block(out, last)
    results.push({ ...summary(settled), unit: `feature:${group.id}` })
  }
}
return { results }
