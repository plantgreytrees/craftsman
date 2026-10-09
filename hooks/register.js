// Craftsman's mod: launch, observe, draw — nothing else (ARCH-MOD-01). It
// registers no tool.call, tool.check or agent.spawn handler and reads no
// settings. Every engine call is feature-detected by trying it (ARCH-MOD-04).
//
// On turn end:
//   observe — the engine's own context size goes to scripts/telemetry.mjs (ARCH-MOD-03);
//   draw    — a status band: plan · unit · tracker % · context %;
//   launch  — a .craftsman/instructions/<slug>.goal.txt written since the session
//             started starts once: command.run("goal"), else prompt.submit,
//             else the band asks for /craftsman:auto-go (ARCH-MOD-02).
// /craftsman:auto-go (commands/auto-go.md) answers with the newest goal file.

const GOALS = ".craftsman/instructions";
const LAUNCHED = "craftsman.launched-goals";

// The newest *.goal.txt in a fs.list result, optionally only those newer than `since`.
function newestGoal(entries, since = 0, launched = {}) {
  const goals = (Array.isArray(entries) ? entries : [])
    .filter((f) => f && f.kind === "file" && /\.goal\.txt$/.test(f.name) && f.mtimeMs > since && launched[f.name] !== f.mtimeMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return goals[0] || null;
}

// The newest scope file name in a session dir listing.
function newestScope(entries) {
  const scopes = (Array.isArray(entries) ? entries : [])
    .filter((f) => f && f.kind === "file" && /^scope(?:@[A-Za-z0-9_-]+?)?(?:-[0-9a-f]{16})?\.json$/.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return scopes[0] ? scopes[0].name : null;
}

// Share of the plan's units at MERGED or COMPLETE, from the tracker ledger text.
function trackerPercent(ledger, plan) {
  if (typeof ledger !== "string" || !plan) return null;
  const latest = new Map();
  for (const line of ledger.split("\n")) {
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row && row.plan === plan && row.unit) latest.set(row.unit, row.status);
  }
  if (!latest.size) return null;
  const done = [...latest.values()].filter((s) => s === "MERGED" || s === "COMPLETE").length;
  return Math.round((100 * done) / latest.size);
}

function band({ plan, unit, tracker, context }) {
  const slug = plan ? String(plan).replace(/^.*\//, "").replace(/\.md$/, "") : null;
  return ["craftsman", slug, unit, tracker === null || tracker === undefined ? null : `tracker ${tracker}%`,
    context === null || context === undefined ? null : `ctx ${context}%`].filter(Boolean).join(" · ");
}

const goalArgs = (text) => String(text).trim().replace(/^\/goal\s+/, "");

export function register(on) {
  on("command.run", ($, e, next) => {
    if (e.command !== "craftsman:auto-go" && e.command !== "auto-go") return next(e);
    const none = { text: "No goal file under .craftsman/instructions — run /craftsman:auto <slug> first." };
    return $.fs.list(GOALS)
      .then((entries) => {
        const goal = newestGoal(entries);
        return goal ? $.fs.read(`${GOALS}/${goal.name}`).then((text) => ({ text: String(text).trim() })) : none;
      })
      .catch(() => none);
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    let sid = null;
    let usage = null;
    try { sid = await $.session.id({}); } catch { /* unsupported */ }
    try { usage = await $.session.usage({}); } catch { /* unsupported */ }
    const context = usage && usage.context ? usage.context : null;

    let scope = null;
    try {
      const name = newestScope(await $.fs.list(`.craftsman/sessions/${sid}`));
      if (name) scope = JSON.parse(await $.fs.read(`.craftsman/sessions/${sid}/${name}`));
    } catch { /* no active scope */ }

    if (sid && context && typeof context.tokens === "number") {
      const argv = ["node", `${$.plugin.root}/scripts/telemetry.mjs`, "--sid", sid, "--tokens", String(context.tokens), "--percent", String(context.percent)];
      if (usage.cost && typeof usage.cost.usd === "number") argv.push("--cost", String(usage.cost.usd));
      if (scope && scope.unit) argv.push("--unit", scope.unit);
      try { await $.process.run(argv); } catch { /* telemetry is best-effort */ }
    }

    let tracker = null;
    try { tracker = trackerPercent(await $.fs.read(".craftsman/tracker/events.jsonl"), scope && scope.plan); } catch { /* no ledger */ }
    let status = band({ plan: scope && scope.plan, unit: scope && scope.unit, tracker, context: context && context.percent });

    let goal = null;
    let launched = {};
    try {
      // Without the session's start time no goal file can be shown to be new, so none launches.
      if (usage && typeof usage.startedAt === "number" && usage.startedAt > 0) {
        launched = (await $.store.get(LAUNCHED)) || {};
        goal = newestGoal(await $.fs.list(GOALS), usage.startedAt, launched);
      }
    } catch { /* no goal dir or no store: nothing to launch */ }
    if (goal) {
      await $.store.set(LAUNCHED, { ...launched, [goal.name]: goal.mtimeMs });
      const text = String(await $.fs.read(`${GOALS}/${goal.name}`)).trim();
      let started = false;
      try { await $.command.run({ command: "goal", args: goalArgs(text) }); started = true; } catch { /* no /goal here */ }
      if (!started) {
        // prompt.submit refuses a leading "/", so this submits the directive alone.
        try { await $.prompt.submit({ text: goalArgs(text) }); started = true; } catch { /* cannot submit as the user */ }
      }
      status = started ? `${status} · launched ${goal.name}` : `${status} · type /craftsman:auto-go to launch ${goal.name}`;
    }

    try { await $.ui.status(status); } catch { /* no status surface */ }
    return result;
  });
}
