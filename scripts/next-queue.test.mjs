import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseNext, queue, lintNext } from "./lib/next-queue.mjs";
import { buildIndex } from "./lib/plan-index.mjs";

const doc = (slug, fm = "") => ({ path: `docs/plans/${slug}.md`, slug, text: `---\nslug: ${slug}\n${fm}---\n# ${slug}\n` });
const row = (plan, status, updated_at = "2026-01-01T00:00:00Z") => ({ plan: `docs/plans/${plan}.md`, unit: "u", status, updated_at });

test("parseNext: lines in order, blanks and prose ignored, missing text empty", () => {
  assert.deepEqual(parseNext("# Next\n\n1. a — do a\n\n2. b - do b\nnot a line\n"),
    [{ slug: "a", intent: "do a" }, { slug: "b", intent: "do b" }]);
  assert.deepEqual(parseNext(""), []);
  assert.deepEqual(parseNext(undefined), []);
});

test("queue: NEXT first, then ready by priority, children order, oldest; lanes marked", () => {
  const index = buildIndex([
    doc("epic", "level: epic\nchildren: [c2, c1]\n"),
    doc("c1", "parent: epic\n"), doc("c2", "parent: epic\n"),
    doc("hot", "priority: P0\n"), doc("old"), doc("new"), doc("blocked"), doc("done"), doc("pinned"),
  ]);
  const rows = [
    row("c1", "PENDING"), row("c2", "PENDING"), row("hot", "IN_PROGRESS"),
    row("old", "PENDING", "2025-01-01T00:00:00Z"), row("new", "PENDING", "2026-06-01T00:00:00Z"),
    row("blocked", "PENDING"), row("blocked", "BLOCKED"), row("done", "COMPLETE"), row("pinned", "PENDING"),
  ];
  const q = queue({ root: "/nowhere", index, rows, sessions: 2, nextText: "1. pinned — first\n2. ghost — nothing\n" });
  assert.deepEqual(q.map((e) => e.slug), ["pinned", "ghost", "hot", "old", "c2", "new", "c1"]);
  assert.deepEqual(q.map((e) => e.lane), [true, true, false, false, false, false, false]);
  assert.deepEqual(q.map((e) => e.source), ["next", "next", "ready", "ready", "ready", "ready", "ready"]);
});

test("queue: no NEXT.md and one lane by default", () => {
  const index = buildIndex([doc("a")]);
  const q = queue({ root: "/nowhere", index, rows: [row("a", "PENDING")] });
  assert.deepEqual(q, [{ slug: "a", source: "ready", lane: true }]);
});

test("lintNext: unresolved, status-word, complete; none without NEXT.md; logs events", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-next-"));
  try {
    const index = buildIndex([doc("a"), doc("fin"), doc("ok")]);
    const rows = [row("fin", "COMPLETE"), row("a", "PENDING")];
    assert.deepEqual(lintNext({ root, index, rows }), []);
    const nextText = "1. ok — fine\n2. ghost — x\n3. a — PARKED for now\n4. fin — wrap up\n";
    const got = lintNext({ root, index, rows, nextText });
    assert.deepEqual(got, [
      { slug: "ghost", problem: "unresolved" }, { slug: "a", problem: "status-word" }, { slug: "fin", problem: "complete" },
    ]);
    const ev = fs.readFileSync(path.join(root, ".craftsman", "events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(ev.map((e) => [e.ev, e.slug, e.problem]), got.map((p) => ["next_queue_lint", p.slug, p.problem]));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("arch-check lint prints NEXT.md warnings and keeps exit 0", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-next-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "plans", "a.md"), "# a\n");
    const cli = () => spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "arch-check.mjs"), "lint", "--root", root], { encoding: "utf8" });
    assert.equal(cli().status, 0);
    assert.doesNotMatch(cli().stdout, /NEXT\.md/);
    fs.writeFileSync(path.join(root, "docs", "plans", "NEXT.md"), "1. ghost — x\n2. a — MERGED soon\n");
    const r = cli();
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /warning: NEXT\.md ghost: unresolved/);
    assert.match(r.stdout, /warning: NEXT\.md a: status-word/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
