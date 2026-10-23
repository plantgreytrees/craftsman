import { test } from "node:test";
import assert from "node:assert/strict";
import { renderApproval, recommend, capabilityConfig } from "./approval-page.mjs";

// A fake value built at runtime: a literal assigned to a secret-like name trips the repo's own secrets scan.
const LEAK = ["not", "a", "real", "value"].join("-") + "-9f3";
const run = (over = {}) => ({
  run: "r1", base: "main", base_protected: false, head_sha: "abc1234", diff_lines: 40, prLines: 400,
  changes: [
    { path: "scripts/a.mjs", summary: "adds <b>a</b>" },
    { path: ".env", env: { API_KEY: LEAK, DEBUG: "1" } },
  ],
  attention: ["manual step: rotate key"],
  evidence: { gates: ["tests green"], reviews: ["code-reviewer APPROVED"], criteria: ["1.1 done"], precommit: "ok", stats: "2 files", shas: ["abc1234"] },
  risk: "low", rollback: "git revert abc1234",
  ...over,
});

test("env change renders the key name and never the value", () => {
  const { html, markdown } = renderApproval(run());
  for (const out of [html, markdown]) {
    assert.ok(out.includes("API_KEY"));
    assert.ok(out.includes("DEBUG"));
    assert.ok(!out.includes(LEAK));
  }
});

test("sections: changes, attention, evidence, risk, rollback", () => {
  const { html, markdown } = renderApproval(run());
  for (const s of ["Changes", "Attention", "Evidence", "Risk", "Rollback"]) {
    assert.ok(html.includes(`<h2>${s}`), s);
    assert.ok(markdown.includes(`## ${s}`), s);
  }
  assert.ok(markdown.includes("git revert abc1234"));
});

test("interpolated strings are escaped", () => {
  const { html } = renderApproval(run({ risk: "<script>alert(1)</script>" }));
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(html.includes("adds &lt;b&gt;a&lt;/b&gt;"));
});

test("recommendation table", () => {
  const p = (path) => ({ changes: [{ path }] });
  const cases = [
    [{}, "Merge now"],
    [{ base_protected: true }, "Open PR"],
    [p("scripts/lib/x.mjs"), "Merge now"],
    [p(".env"), "Open PR"],
    [p(".env.production"), "Open PR"],
    [p(".github/workflows/ci.yml"), "Open PR"],
    [p(".circleci/config.yml"), "Open PR"],
    [p("Jenkinsfile"), "Open PR"],
    [p("azure-pipelines.yml"), "Open PR"],
    [p("bitbucket-pipelines.yml"), "Open PR"],
    [p("db/migrations/001.sql"), "Open PR"],
    [p("infra/main.tf"), "Open PR"],
    [p("Dockerfile"), "Open PR"],
    [p("hooks/pre-guard.mjs"), "Open PR"],
    [p("scripts/secrets-scan.mjs"), "Open PR"],
    [{ changes: [{ path: "vendor/x", submodule: true }] }, "Open PR"],
    [{ diff_lines: 401 }, "Open PR"],
    [{ diff_lines: 400 }, "Merge now"],
  ];
  for (const [over, want] of cases) assert.equal(recommend(run({ changes: [], ...over })).choice, want, JSON.stringify(over));
});

test("capability config: db and user, owner-write rule", () => {
  assert.deepEqual(capabilityConfig(), { db: { rules: [{ path: "approvals", read: "view", write: "owner" }] }, user: {}, artifact: {} });
  const { html } = renderApproval(run());
  assert.ok(html.includes('"write":"owner"'));
  assert.equal((html.match(/<button/g) || []).length, 2);
  assert.ok(html.includes("Merge now") && html.includes("Open PR"));
  assert.ok(html.includes('claude.use("db")') && html.includes('claude.use("user")'));
  assert.ok(html.includes("isOwner"));
  assert.ok(html.includes('"approvals/"+RUN'));
});

test("recommended button is marked", () => {
  const { html } = renderApproval(run({ base_protected: true }));
  assert.match(html, /data-choice="open-pr"[^>]*data-recommended="true"/);
  assert.doesNotMatch(html, /data-choice="merge"[^>]*data-recommended="true"/);
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const between = (html, id) => new RegExp(`<script type="[^"]+" id="${id}">([\\s\\S]*?)</script>`).exec(html)[1];

test("the page regenerates its document from state and never serializes the live DOM", () => {
  const { html } = renderApproval(run());
  const code = between(html, "code");
  assert.ok(!/outerHTML|innerHTML|XMLSerializer/.test(code));
  const state = JSON.parse(between(html, "state"));
  assert.equal(state.decision, null);
  // the document is exactly doctype + core + the three script blocks, so a republish can rebuild it
  const rebuilt = `<!doctype html>\n${state.core}<script type="application/json" id="capabilities">${between(html, "capabilities")}</script>`
    + `<script type="application/json" id="state">${between(html, "state")}</script><script type="module" id="code">${code}</script></body></html>`;
  assert.equal(rebuilt, html);
  assert.ok(!state.core.includes("<script"));
});

test("the embedded browser script is valid module syntax and state carries no secret", () => {
  const { html } = renderApproval(run());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "approval-page-"));
  try {
    const file = path.join(dir, "page.mjs");
    fs.writeFileSync(file, between(html, "code"));
    assert.equal(spawnSync(process.execPath, ["--check", file], { encoding: "utf8" }).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.ok(!between(html, "state").includes(LEAK));
});
