// Approval page content (ARCH-APPROVAL-02/03/07). Pure: returns strings, publishes nothing.
const DEFAULT_PR_LINES = 400;
const RISKY = [
  /(^|\/)\.env(\.|$)/, /(^|\/)\.github\//, /(^|\/)\.gitlab-ci/, /(^|\/)\.circleci\//, /(^|\/)Jenkinsfile/, /(^|\/)(azure|bitbucket)-pipelines\.ya?ml$/, /(^|\/)(infra|terraform|k8s|deploy)\//,
  /\.tf$/, /(^|\/)Dockerfile/, /(^|\/)migrations?\//, /(^|\/)\.gitmodules$/,
  /(^|\/)hooks\//, /secrets?-/, /(^|\/)(auth|security|permissions?)[^/]*$/,
];
export const CHOICES = ["merge", "open-pr"];
const LABEL_CHOICE = { "Merge now": "merge", "Open PR": "open-pr" };

export function capabilityConfig() {
  return { db: { rules: [{ path: "approvals", read: "view", write: "owner" }] }, user: {}, artifact: {} };
}

const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String);
const envKeys = (c) => (Array.isArray(c.env) ? c.env.map(String) : c.env && typeof c.env === "object" ? Object.keys(c.env) : []);

export function recommend(run = {}) {
  const limit = Number(run.prLines) > 0 ? Number(run.prLines) : DEFAULT_PR_LINES;
  const reasons = [];
  if (run.base_protected) reasons.push("protected base");
  for (const c of run.changes || []) {
    if (c.submodule) reasons.push(`submodule pointer: ${c.path}`);
    else if (RISKY.some((r) => r.test(String(c.path))) || envKeys(c).length) reasons.push(`sensitive path: ${c.path}`);
  }
  if (Number(run.diff_lines) > limit) reasons.push(`diff over ${limit} lines`);
  return { choice: reasons.length ? "Open PR" : "Merge now", reasons };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const jsonSafe = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028|\u2029/g, " ");

// Plain, value-free view of a run: env values never leave this function.
function view(run) {
  const ev = run.evidence || {};
  const changes = (run.changes || []).map((c) => ({ path: String(c.path), summary: c.summary ? String(c.summary) : "", keys: envKeys(c) }));
  const rec = recommend(run);
  return {
    run: String(run.run), base: String(run.base ?? ""), head_sha: String(run.head_sha ?? ""), recommendation: rec,
    changes, attention: [...list(run.attention), ...changes.filter((c) => c.keys.length).map((c) => `env keys in ${c.path}: ${c.keys.join(", ")}`)],
    evidence: { gates: list(ev.gates), reviews: list(ev.reviews), criteria: list(ev.criteria), precommit: ev.precommit ? String(ev.precommit) : "", stats: ev.stats ? String(ev.stats) : "", shas: list(ev.shas) },
    risk: String(run.risk ?? ""), rollback: String(run.rollback ?? ""),
  };
}

const changeLine = (c) => `${c.path}${c.summary ? ` - ${c.summary}` : ""}${c.keys.length ? ` (keys: ${c.keys.join(", ")})` : ""}`;
const evidenceLines = (e) => [
  ...e.gates.map((x) => `gate: ${x}`), ...e.reviews.map((x) => `review: ${x}`), ...e.criteria.map((x) => `criterion: ${x}`),
  ...(e.precommit ? [`pre-commit: ${e.precommit}`] : []), ...(e.stats ? [`diff: ${e.stats}`] : []), ...e.shas.map((x) => `commit: ${x}`),
];

function markdown(v) {
  const ul = (a) => (a.length ? a.map((x) => `- ${x}`).join("\n") : "- none");
  return [
    `# Approval: ${v.run}`, "",
    `Recommended: **${v.recommendation.choice}**${v.recommendation.reasons.length ? ` (${v.recommendation.reasons.join("; ")})` : ""}`,
    `Base: ${v.base} | Head: ${v.head_sha}`, "",
    "## Changes", ul(v.changes.map(changeLine)), "",
    "## Attention", ul(v.attention), "",
    "## Evidence", ul(evidenceLines(v.evidence)), "",
    "## Risk", v.risk || "none stated", "",
    "## Rollback", v.rollback || "none stated", "",
  ].join("\n");
}

// The page script. When it records a decision it regenerates the whole document from state
// (S.core is the script-free markup); it never serializes the live DOM (Artifact runtime contract).
// String.raw keeps the browser source exactly as written.
const PAGE_SCRIPT = String.raw`
const S = JSON.parse(document.getElementById("state").textContent);
const RUN = S.run;
const db = await claude.use("db");
const user = await claude.use("user");
const art = await claude.use("artifact");
const note = document.getElementById("note");
const jsonSafe = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const docFrom = (s) => "<!doctype html>\n" + s.core
  + '<script type="application/json" id="capabilities">' + document.getElementById("capabilities").textContent + "<\/script>"
  + '<script type="application/json" id="state">' + jsonSafe(s) + "<\/script>"
  + '<script type="module" id="code">' + document.getElementById("code").textContent + "<\/script></body></html>";
const owner = !!(db && user && user.isOwner && (await user.isOwner()));
if (!owner) note.textContent = "Approve from the owner session: this page cannot record a decision here.";
else if (S.decision) note.textContent = "Decision recorded: " + S.decision.choice;
for (const b of document.querySelectorAll("button")) {
  b.disabled = !owner || !!S.decision;
  b.addEventListener("click", async () => {
    const choice = b.dataset.choice;
    b.disabled = true;
    try {
      await db.doc("approvals/"+RUN).set({ choice, head_sha: S.head_sha, decided_at: new Date().toISOString() });
      S.decision = { choice };
      document.getElementById("state").textContent = jsonSafe(S);
      if (art) await art.publish(docFrom(S));
      note.textContent = "Decision recorded: " + choice;
    } catch (e) { note.textContent = "Not recorded (a conflict is routine): " + (e && e.message ? e.message : "error"); }
  });
}`;

export function renderApproval(run) {
  const v = view(run || {});
  const ul = (a) => (a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>none</p>");
  const rec = v.recommendation.choice;
  const btn = (label) => `<button data-choice="${LABEL_CHOICE[label]}"${rec === label ? ' data-recommended="true"' : ""}>${esc(label)}${rec === label ? " (recommended)" : ""}</button>`;
  const core = `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approval ${esc(v.run)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem}button{font:inherit;padding:.6rem 1.2rem;margin-right:.5rem}button[data-recommended]{font-weight:700;outline:2px solid currentColor}</style></head>
<body><h1>Approval: ${esc(v.run)}</h1>
<p>Recommended: <strong>${esc(rec)}</strong>${v.recommendation.reasons.length ? ` (${esc(v.recommendation.reasons.join("; "))})` : ""}. Base ${esc(v.base)}, head ${esc(v.head_sha)}.</p>
<p>${btn("Merge now")}${btn("Open PR")}</p><p id="note" role="status"></p>
<h2>Changes</h2>${ul(v.changes.map(changeLine))}
<h2>Attention</h2>${ul(v.attention)}
<h2>Evidence</h2>${ul(evidenceLines(v.evidence))}
<h2>Risk</h2><p>${esc(v.risk || "none stated")}</p>
<h2>Rollback</h2><p>${esc(v.rollback || "none stated")}</p>
`;
  const state = { run: v.run, head_sha: v.head_sha, recommendation: rec, decision: null, core };
  const html = `<!doctype html>
${core}<script type="application/json" id="capabilities">${jsonSafe(capabilityConfig())}</script><script type="application/json" id="state">${jsonSafe(state)}</script><script type="module" id="code">${PAGE_SCRIPT}</script></body></html>`;
  return { html, markdown: markdown(v) };
}
