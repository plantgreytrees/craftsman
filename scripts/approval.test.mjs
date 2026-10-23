import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepare, attachUrl, check, landed, pending, fallback } from "./approval.mjs";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "approval-"));
  const runners = {
    secrets: () => [],
    docChecks: () => ({ ok: true, checks: [{ cmd: "lint", status: "pass" }, { cmd: "pre-commit (stub)", status: "pass" }] }),
  };
  const input = { run: "r1", plan: "p.md", base: "main", head_sha: "abc123", feature_heads: ["abc123"], evidence: { gates: ["npm test"] }, changes: [{ path: "a.js" }] };
  const events = () => { try { return fs.readFileSync(path.join(root, ".craftsman/events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return { root, runners, input, events, rec: () => JSON.parse(fs.readFileSync(path.join(root, ".craftsman/approvals/r1.json"), "utf8")) };
}

test("prepare writes the record, folds runner results and logs approval_requested", () => {
  const s = setup();
  const out = prepare(s.input, { root: s.root, runners: s.runners });
  assert.equal(out.ok, true);
  assert.match(out.html, /Approval: r1/);
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
  assert.ok(!fs.existsSync(path.join(s.root, ".craftsman/approvals/r1.json")));
});

test("prepare refuses a path-like run id", () => {
  const s = setup();
  assert.equal(prepare({ ...s.input, run: "../x" }, { root: s.root, runners: s.runners }).refused, true);
});

test("check refuses mismatched head_sha, non-owner, bad choice; accepts owner match", () => {
  const s = setup();
  prepare(s.input, { root: s.root, runners: s.runners });
  const o = { root: s.root };
  assert.match(check({ run: "r1", row: { choice: "merge", head_sha: "zzz" }, writer_is_owner: true }, o).reason, /head_sha/);
  assert.match(check({ run: "r1", row: { choice: "merge", head_sha: "abc123" }, writer_is_owner: false }, o).reason, /owner/);
  assert.match(check({ run: "r1", row: { choice: "force", head_sha: "abc123" }, writer_is_owner: true }, o).reason, /choice/);
  assert.equal(s.rec().status, "requested");
  assert.equal(check({ run: "r1", row: { choice: "open-pr", head_sha: "abc123" }, writer_is_owner: true }, o).ok, true);
  assert.equal(s.rec().status, "decided");
  assert.match(check({ run: "r1", row: { choice: "merge", head_sha: "abc123" }, writer_is_owner: true }, o).reason, /status/);
  assert.deepEqual(s.events().map((e) => e.ev), ["approval_requested", "approval_decided"]);
});

test("landed only from decided; pending lists decided runs; attach-url stores https url", () => {
  const s = setup();
  const o = { root: s.root };
  prepare(s.input, { root: s.root, runners: s.runners });
  assert.equal(landed({ run: "r1", sha: "s", mode: "merge" }, o).refused, true);
  assert.equal(attachUrl({ run: "r1", url: "javascript:x" }, o).refused, true);
  assert.equal(attachUrl({ run: "r1", url: "https://claude.ai/a/1" }, o).ok, true);
  assert.deepEqual(pending({}, o).runs, []);
  check({ run: "r1", row: { choice: "merge", head_sha: "abc123" }, writer_is_owner: true }, o);
  assert.deepEqual(pending({}, o).runs.map((r) => r.run), ["r1"]);
  assert.equal(landed({ run: "r1", sha: "s1", mode: "merge" }, o).ok, true);
  assert.deepEqual(pending({}, o).runs, []);
  assert.deepEqual(s.events().at(-1), { ...s.events().at(-1), ev: "approval_landed", run: "r1", sha: "s1", mode: "merge" });
});

test("fallback writes the markdown twin and returns the one question", () => {
  const s = setup();
  const p = prepare(s.input, { root: s.root, runners: s.runners });
  const out = fallback({ run: "r1", markdown: p.markdown }, { root: s.root });
  assert.deepEqual(out.options, ["Merge now", "Open PR"]);
  assert.equal(fs.readFileSync(path.join(s.root, ".craftsman/approvals/r1.md"), "utf8"), p.markdown);
  assert.equal(fallback({ run: "nope", markdown: "x" }, { root: s.root }).refused, true);
});
