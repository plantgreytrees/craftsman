import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepare, attachUrl, check, landed, pending, fallback } from "./approval.mjs";

const LATER = new Date(Date.now() + 60000).toISOString();

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "approval-"));
  const runners = {
    secrets: () => [],
    docChecks: () => ({ ok: true, checks: [{ cmd: "lint", status: "pass" }, { cmd: "pre-commit (stub)", status: "pass" }] }),
  };
  const input = { plan: "p.md", feature: "f", base: "main", head_sha: "abc123", feature_heads: ["abc123"], evidence: { gates: ["npm test"] }, changes: [{ path: "a.js" }] };
  const events = () => { try { return fs.readFileSync(path.join(root, ".craftsman/events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return { root, runners, input, events, rec: () => JSON.parse(fs.readFileSync(path.join(root, ".craftsman/approvals/p-f.json"), "utf8")) };
}

test("prepare writes the record, folds runner results and logs approval_requested", () => {
  const s = setup();
  const out = prepare(s.input, { root: s.root, runners: s.runners });
  assert.equal(out.ok, true);
  assert.match(out.html, /Approval: p-f/);
  assert.match(out.html, /pre-commit: pass/);
  assert.match(out.markdown, /lint: pass/);
  const r = s.rec();
  assert.equal(r.status, "requested");
  assert.equal(r.url, null);
  assert.equal(r.head_sha, "abc123");
  assert.ok(r.requested_at && r.recommendation.choice);
  assert.deepEqual(s.events().map((e) => e.ev), ["approval_requested"]);
});

test("prepare refuses on secrets and writes no record or value", () => {
  const s = setup();
  const out = prepare(s.input, { root: s.root, runners: { ...s.runners, secrets: () => [{ file: ".env", line: 1, rule: "aws", value: "SECRETVALUE" }] } });
  assert.equal(out.refused, true);
  assert.ok(!JSON.stringify(out).includes("SECRETVALUE"));
  assert.ok(!fs.existsSync(path.join(s.root, ".craftsman/approvals/p-f.json")));
});

test("prepare refuses a path-like run id", () => {
  const s = setup();
  assert.equal(prepare({ ...s.input, run: "../x" }, { root: s.root, runners: s.runners }).refused, true);
});

test("prepare reads prLines from repo config (40-line diff, limit 10)", () => {
  const s = setup();
  const big = { ...s.input, diff_lines: 40 };
  assert.equal(prepare(big, { root: s.root, runners: s.runners }).recommendation.choice, "Merge now");
  fs.writeFileSync(path.join(s.root, "craftsman.config.json"), JSON.stringify({ repoExec: { approval: { prLines: 10 } } }));
  assert.equal(prepare(big, { root: s.root, runners: s.runners }).recommendation.choice, "Open PR");
});

test("prepare derives the run id from plan and feature, refuses a differing run, stores feature", () => {
  const s = setup();
  assert.match(prepare({ ...s.input, run: "other" }, { root: s.root, runners: s.runners }).reason, /run must be p-f/);
  assert.equal(prepare({ ...s.input, feature: undefined }, { root: s.root, runners: s.runners }).refused, true);
  assert.equal(prepare({ ...s.input, run: "p-f" }, { root: s.root, runners: s.runners }).ok, true);
  assert.equal(s.rec().feature, "f");
  assert.equal(s.rec().run, "p-f");
});

test("prepare refuses a landed record and archives an earlier decision in history", () => {
  const s = setup();
  const o = { root: s.root };
  prepare(s.input, { root: s.root, runners: s.runners });
  check({ run: "p-f", row: { choice: "merge", head_sha: "abc123", decided_at: LATER }, writer_is_owner: true }, o);
  prepare({ ...s.input, head_sha: "def456" }, { root: s.root, runners: s.runners });
  const r = s.rec();
  assert.equal(r.status, "requested");
  assert.equal(r.choice, undefined);
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].status, "decided");
  assert.equal(r.history[0].choice, "merge");
  assert.equal(r.history[0].head_sha, "abc123");
  check({ run: "p-f", row: { choice: "merge", head_sha: "def456", decided_at: LATER }, writer_is_owner: true }, o);
  landed({ run: "p-f", sha: "s", mode: "merge" }, o);
  assert.match(prepare(s.input, { root: s.root, runners: s.runners }).reason, /landed/);
  assert.equal(s.rec().status, "landed");
});

test("check refuses a stale row whose decided_at predates the request", () => {
  const s = setup();
  prepare(s.input, { root: s.root, runners: s.runners });
  const stale = new Date(Date.now() - 3600000).toISOString();
  const o = { root: s.root };
  assert.match(check({ run: "p-f", row: { choice: "merge", head_sha: "abc123", decided_at: stale }, writer_is_owner: true }, o).reason, /predates/);
  assert.match(check({ run: "p-f", row: { choice: "merge", head_sha: "abc123" }, writer_is_owner: true }, o).reason, /predates/);
  assert.equal(s.rec().status, "requested");
});

test("two concurrent checks leave exactly one decision", () => {
  const s = setup();
  prepare(s.input, { root: s.root, runners: s.runners });
  const mod = path.join(path.dirname(fileURLToPath(import.meta.url)), "approval.mjs");
  const code = `import { check } from ${JSON.stringify(mod)};
    const r = check({ run: "p-f", row: { choice: process.argv[1], head_sha: "abc123", decided_at: ${JSON.stringify(LATER)} }, writer_is_owner: true }, { root: ${JSON.stringify(s.root)} });
    process.stdout.write(JSON.stringify(r));`;
  const outs = ["merge", "open-pr"].map((c) => new Promise((res) => {
    import("node:child_process").then(({ execFile }) => execFile(process.execPath, ["--input-type=module", "-e", code, c], (e, out) => res(JSON.parse(out))));
  }));
  return Promise.all(outs).then((rs) => {
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(s.events().filter((e) => e.ev === "approval_decided").length, 1);
    assert.equal(s.rec().choice, rs.find((r) => r.ok).choice);
  });
});

test("check refuses mismatched head_sha, non-owner, bad choice; accepts owner match", () => {
  const s = setup();
  prepare(s.input, { root: s.root, runners: s.runners });
  const o = { root: s.root };
  assert.match(check({ run: "p-f", row: { choice: "merge", head_sha: "zzz" }, writer_is_owner: true }, o).reason, /head_sha/);
  assert.match(check({ run: "p-f", row: { choice: "merge", head_sha: "abc123", decided_at: LATER }, writer_is_owner: false }, o).reason, /owner/);
  assert.match(check({ run: "p-f", row: { choice: "force", head_sha: "abc123", decided_at: LATER }, writer_is_owner: true }, o).reason, /choice/);
  assert.equal(s.rec().status, "requested");
  assert.equal(check({ run: "p-f", row: { choice: "open-pr", head_sha: "abc123", decided_at: LATER }, writer_is_owner: true }, o).ok, true);
  assert.equal(s.rec().status, "decided");
  assert.match(check({ run: "p-f", row: { choice: "merge", head_sha: "abc123", decided_at: LATER }, writer_is_owner: true }, o).reason, /status/);
  assert.deepEqual(s.events().map((e) => e.ev), ["approval_requested", "approval_decided"]);
});

test("landed only from decided; pending lists decided runs; attach-url stores https url", () => {
  const s = setup();
  const o = { root: s.root };
  prepare(s.input, { root: s.root, runners: s.runners });
  assert.equal(landed({ run: "p-f", sha: "s", mode: "merge" }, o).refused, true);
  assert.equal(attachUrl({ run: "p-f", url: "javascript:x" }, o).refused, true);
  assert.equal(attachUrl({ run: "p-f", url: "https://claude.ai/a/1" }, o).ok, true);
  assert.deepEqual(pending({}, o).runs, []);
  check({ run: "p-f", row: { choice: "merge", head_sha: "abc123", decided_at: LATER }, writer_is_owner: true }, o);
  assert.deepEqual(pending({}, o).runs.map((r) => r.run), ["p-f"]);
  assert.equal(landed({ run: "p-f", sha: "s1", mode: "merge" }, o).ok, true);
  assert.deepEqual(pending({}, o).runs, []);
  assert.deepEqual(s.events().at(-1), { ...s.events().at(-1), ev: "approval_landed", run: "p-f", sha: "s1", mode: "merge" });
});

test("fallback writes the markdown twin and returns the one question", () => {
  const s = setup();
  const p = prepare(s.input, { root: s.root, runners: s.runners });
  const out = fallback({ run: "p-f", markdown: p.markdown }, { root: s.root });
  assert.deepEqual(out.options, ["Merge now", "Open PR"]);
  assert.equal(fs.readFileSync(path.join(s.root, ".craftsman/approvals/p-f.md"), "utf8"), p.markdown);
  assert.equal(fallback({ run: "nope", markdown: "x" }, { root: s.root }).refused, true);
});
