// Craftsman's mod: launch, observe, draw — nothing else (ARCH-MOD-01). It
// registers no tool.call, tool.check or agent.spawn handler and reads no
// settings. Every engine call is feature-detected by trying it (ARCH-MOD-04).
//
// On turn end:
//   observe — the engine's own context size goes to scripts/telemetry.mjs (ARCH-MOD-03);
//   draw    — a status band: plan · unit · tracker % · context %;
//   launch  — a .craftsman/instructions/<slug>.goal.txt written since the session
//             started, AND recorded by craftsman this session (scripts/goal-token.mjs,
//             ARCH-SAFETY-09), starts once: command.run("goal"), else prompt.submit,
//             else the band asks for /craftsman:auto-go (ARCH-MOD-02). A goal file
//             nobody recorded is named in the band and never submitted as the user.
// /craftsman:auto-go (commands/auto-go.md) answers with the newest goal file.

const GOALS = ".craftsman/instructions";
const LAUNCHED = "craftsman.launched-goals";

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
// SHA-256 of a string (UTF-8), as hex. The mod host has no node:crypto and the token must bind content (ARCH-SAFETY-09), so the
// digest is computed here; hooks/register.test.ts feeds it digests made with node:crypto, so a wrong implementation fails there.
function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 0x100000000));
  view.setUint32(padded.length - 4, (data.length * 8) >>> 0);
  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15], b = w[t - 2];
      w[t] = (w[t - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + w[t - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + SHA256_K[t] + w[t]) >>> 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h = [h[0] + a, h[1] + b, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map((x) => x >>> 0);
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

// Every *.goal.txt in a fs.list result that is newer than `since` and not yet launched, newest first.
function goalCandidates(entries, since = 0, launched = {}) {
  return (Array.isArray(entries) ? entries : [])
    .filter((f) => f && f.kind === "file" && /\.goal\.txt$/.test(f.name) && f.mtimeMs > since && launched[f.name] !== f.mtimeMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

// The newest *.goal.txt in a fs.list result, optionally only those newer than `since`.
function newestGoal(entries, since = 0, launched = {}) {
  return goalCandidates(entries, since, launched)[0] || null;
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
    let unrecorded = [];
    try {
      // Without the session's start time no goal file can be shown to be new, so none launches.
      if (usage && typeof usage.startedAt === "number" && usage.startedAt > 0) {
        launched = (await $.store.get(LAUNCHED)) || {};
        const candidates = goalCandidates(await $.fs.list(GOALS), usage.startedAt, launched);
        // Only a goal craftsman recorded in this session may be submitted as the user (ARCH-SAFETY-09):
        // its name, mtime AND content digest must match a token goal-token.mjs wrote, so a rewritten file no longer does,
        // not even with its mtime put back. The text that was hashed is the text that is submitted: it is read once.
        let tokens = {};
        try { if (sid) tokens = JSON.parse(await $.fs.read(`.craftsman/sessions/${sid}/goal-tokens.json`)) || {}; } catch { /* no tokens: nothing is recorded */ }
        const verified = {};
        for (const f of candidates) {
          const token = tokens[f.name];
          if (!token || typeof token !== "object" || token.mtimeMs !== f.mtimeMs || typeof token.sha256 !== "string") continue;
          try {
            const text = String(await $.fs.read(`${GOALS}/${f.name}`));
            if (sha256Hex(text) === token.sha256) verified[f.name] = text;
          } catch { /* unreadable: not recorded */ }
        }
        goal = candidates.find((f) => f.name in verified) || null;
        unrecorded = candidates.filter((f) => !(f.name in verified)).map((f) => f.name);
        if (goal) goal.text = verified[goal.name];
      }
    } catch { /* no goal dir or no store: nothing to launch */ }
    if (goal) {
      await $.store.set(LAUNCHED, { ...launched, [goal.name]: goal.mtimeMs });
      const text = goal.text.trim();
      let started = false;
      try { await $.command.run({ command: "goal", args: goalArgs(text) }); started = true; } catch { /* no /goal here */ }
      if (!started) {
        // prompt.submit refuses a leading "/", so this submits the directive alone.
        try { await $.prompt.submit({ text: goalArgs(text) }); started = true; } catch { /* cannot submit as the user */ }
      }
      status = started ? `${status} · launched ${goal.name}` : `${status} · type /craftsman:auto-go to launch ${goal.name}`;
    }

    if (unrecorded.length) status = `${status} · ${unrecorded.join(", ")} not written by craftsman this session — not launched (type /craftsman:auto-go to launch it yourself)`;

    try { await $.ui.status(status); } catch { /* no status surface */ }
    return result;
  });
}
