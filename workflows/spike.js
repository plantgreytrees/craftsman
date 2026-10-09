export const meta = {
  name: 'craftsman-spike',
  description: 'ENGINE-02 spike: run plan units through agents/unit-runner.md, one at a time',
  phases: [
    { title: 'Implement', detail: 'smoke gate, implement, commit in the unit worktree' },
    { title: 'Review', detail: 'fresh reviewer; at most 2 fix rounds' },
    { title: 'Land', detail: 'merge, tracker, or park with a decision' },
  ],
}

// Orchestration only (ARCH-ENGINE-03): no fs, shell, import or clock here.
// Every repo action runs inside an agent through craftsman's own scripts.
// args: { sessionId, pluginRoot, protocolText?, project, plan, units: [{ unit, task, criteria, scope, arch }] }

const MAX_FIX_ROUNDS = 2

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
  const opts = { label: `${role}:${u.unit}`, phase, schema: RESULT }
  if (!args.protocolText) opts.agentType = 'craftsman:unit-runner'
  return agent(brief(role, u, extra), opts)
}

function dead(u, role) {
  return { unit: u.unit, status: 'BLOCKED', evidence: `${role} agent returned nothing`, parked: [] }
}

async function reviewLoop(done, u) {
  if (!done || done.status !== 'IMPLEMENTED') return done || dead(u, 'implement')
  let head = done
  for (let round = 0; ; round++) {
    const review = await run('review', u, 'Review', `worktree_path: ${head.worktree_path}`)
    if (!review) return dead(u, 'review')
    if (review.status === 'APPROVED') return head
    if (round === MAX_FIX_ROUNDS) {
      return { ...head, status: 'PARKED', evidence: `review rounds exhausted: ${(review.findings || []).join('; ')}`, parked: [] }
    }
    const fixed = await run('implement', u, 'Implement',
      `fix round ${round + 1}\nworktree_path: ${head.worktree_path}\nfindings: ${JSON.stringify(review.findings)}`)
    if (!fixed || fixed.status !== 'IMPLEMENTED') return fixed || dead(u, 'implement')
    head = fixed
  }
}

async function close(result, u) {
  if (result.status === 'IMPLEMENTED') {
    return (await run('land', u, 'Land', `worktree_path: ${result.worktree_path}`)) || dead(u, 'land')
  }
  if (result.status === 'PARKED') {
    const parked = await run('park', u, 'Land',
      `reason: ${result.evidence}\nworktree_path: ${result.worktree_path || ''}\nparked: ${JSON.stringify(result.parked)}`)
    return { ...(parked || result), parked: result.parked }
  }
  return result
}

// Sequential in plan-graph order (ARCH-ENGINE-09): one unit's pipeline
// finishes before the next starts, until parallel scope isolation is proven.
const results = []
for (const u of args.units) {
  log(`unit ${u.unit}`)
  const [result] = await pipeline([u], (item) => run('implement', item, 'Implement'), reviewLoop, close)
  results.push(result || dead(u, 'pipeline'))
}
return { results }
