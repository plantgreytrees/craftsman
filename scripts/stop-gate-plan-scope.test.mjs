// Stop gate binds an owning session only to its own plans' criteria (acc-stop-gate).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STOP_GATE_PATH = fileURLToPath(new URL("./stop-gate.mjs", import.meta.url));

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stop-gate-plan-"));
  for (const a of [["init", "-q"], ["config", "user.email", "t@e.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"]])
    spawnSync("git", a, { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: true } }));
  return dir;
}

function seed(dir, sid, text, tracker = []) {
  const state = path.join(dir, ".craftsman");
  fs.mkdirSync(path.join(state, "sessions", sid), { recursive: true });
  fs.writeFileSync(path.join(state, "acceptance.md"), text);
  const identity = crypto.createHash("sha1").update(
    text.split("\n").map((l) => l.replace(/^(\s*[-*]\s*)\[[ xX]\]/, "$1[ ]").trimEnd()).join("\n").trim()
  ).digest("hex");
  fs.writeFileSync(path.join(state, "sessions", sid, "acceptance.ref"), JSON.stringify({ identity, ts: Date.now() }));
  if (tracker.length) {
    fs.mkdirSync(path.join(state, "tracker"), { recursive: true });
    fs.writeFileSync(path.join(state, "tracker", "events.jsonl"), tracker.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
}

function run(dir, sid) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STOP_GATE_PATH], { cwd: dir });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("error", reject);
    child.on("close", () => {
      let events = [];
      try {
        events = fs.readFileSync(path.join(dir, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.sid === sid);
      } catch {}
      resolve({ stdout, events });
    });
    child.stdin.end(JSON.stringify({ session_id: sid }));
  });
}

const sid = "plan-scope";
const ledgerB = [{ key: ".::docs/plans/b.md::u1", project: ".", plan: "docs/plans/b.md", unit: "u1", status: "IN_PROGRESS", evidence: "x", session_id: sid }];

async function withFixture(fn) {
  const dir = makeFixture();
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("A: untagged unchecked line of another plan does not block a session that touched only plan b", () => withFixture(async (dir) => {
  seed(dir, sid, "- [ ] plan a legacy criterion\n", ledgerB);
  const r = await run(dir, sid);
  assert.doesNotMatch(r.stdout, /"decision":"block"/);
}));

test("B: an unchecked [plan:b] line blocks and the reason names b", () => withFixture(async (dir) => {
  seed(dir, sid, "- [ ] plan a legacy criterion\n- [ ] [plan:b] b criterion\n", ledgerB);
  const r = await run(dir, sid);
  assert.match(r.stdout, /"decision":"block"/);
  assert.match(r.stdout, /\bb\b/);
  assert.match(r.stdout, /b criterion/);
  assert.doesNotMatch(r.stdout, /plan a legacy/);
}));

test("C: case A prints the legacy notice and logs stop-acceptance-legacy", () => withFixture(async (dir) => {
  seed(dir, sid, "- [ ] plan a legacy criterion\n", ledgerB);
  const r = await run(dir, sid);
  assert.match(r.stdout, /systemMessage/);
  assert.match(r.stdout, /1 unscoped \(untagged or feature-only\)/);
  assert.match(r.stdout, /\[plan:<slug>\]/);
  assert.ok(r.events.some((e) => e.ev === "stop-acceptance-legacy"));
}));

test("D: no ledger file, unchecked untagged line still blocks", () => withFixture(async (dir) => {
  seed(dir, sid, "- [ ] plan a legacy criterion\n");
  const r = await run(dir, sid);
  assert.match(r.stdout, /"decision":"block"/);
  assert.match(r.stdout, /plan a legacy criterion/);
}));

test("E: ledger with no plan events for this session still blocks on untagged line", () => withFixture(async (dir) => {
  seed(dir, sid, "- [ ] plan a legacy criterion\n", [{ key: "k", status: "IN_PROGRESS", session_id: "other", plan: "docs/plans/b.md" }]);
  const r = await run(dir, sid);
  assert.match(r.stdout, /"decision":"block"/);
}));

const heldRows = (status) => [
  { key: ".::docs/plans/b.md::u1", project: ".", plan: "docs/plans/b.md", unit: "u1", status: "IN_PROGRESS", evidence: "x", session_id: sid },
  ...(status === "IN_PROGRESS" ? [] : [{ key: ".::docs/plans/b.md::u1", project: ".", plan: "docs/plans/b.md", unit: "u1", status, evidence: "needs a user decision", session_id: sid }]),
];

test("F: an unticked [unit:] line of a BLOCKED unit does not block, is named in the notice and logs stop-acceptance-held", () => withFixture(async (dir) => {
  seed(dir, sid, "- [ ] [plan:b] [unit:u1] u1 criterion\n", heldRows("BLOCKED"));
  const r = await run(dir, sid);
  assert.doesNotMatch(r.stdout, /"decision":"block"/);
  assert.match(r.stdout, /systemMessage/);
  assert.match(r.stdout, /1 acceptance line\(s\) held by BLOCKED\/PARKED units u1/);
  assert.match(r.stdout, /\/craftsman:auto Phase C/);
  const ev = r.events.find((e) => e.ev === "stop-acceptance-held");
  assert.ok(ev);
  assert.deepEqual(ev.units, ["u1"]);
}));

test("G: the same line for an IN_PROGRESS unit still blocks and the reason offers the BLOCKED ON USER exit", () => withFixture(async (dir) => {
  seed(dir, sid, "- [ ] [plan:b] [unit:u1] u1 criterion\n", heldRows("IN_PROGRESS"));
  const r = await run(dir, sid);
  assert.match(r.stdout, /"decision":"block"/);
  assert.match(r.stdout, /u1 criterion/);
  assert.match(r.stdout, /record it PARKED via tracker\.mjs with decision \{question, options\[\]\} \(or BLOCKED with evidence only\) and print BLOCKED ON USER/);
  assert.doesNotMatch(r.stdout, /BLOCKED\/PARKED via tracker\.mjs with a decision/);
  assert.ok(!r.events.some((e) => e.ev === "stop-acceptance-held"));
}));

test("H: a PARKED unit's line is held too, while an IN_PROGRESS sibling still blocks", () => withFixture(async (dir) => {
  const rows = [...heldRows("PARKED"), { key: ".::docs/plans/b.md::u2", project: ".", plan: "docs/plans/b.md", unit: "u2", status: "IN_PROGRESS", evidence: "x", session_id: sid }];
  seed(dir, sid, "- [ ] [plan:b] [unit:u1] u1 criterion\n- [ ] [plan:b] [unit:u2] u2 criterion\n", rows);
  const r = await run(dir, sid);
  assert.match(r.stdout, /"decision":"block"/);
  assert.match(r.stdout, /u2 criterion/);
  assert.doesNotMatch(r.stdout, /u1 criterion/);
  assert.match(r.stdout, /held by BLOCKED\/PARKED units u1/);
}));

test("I: a BLOCKED row of the same id in another plan holds nothing; the IN_PROGRESS unit of the ledger's plan still blocks", () => withFixture(async (dir) => {
  const rows = [
    { key: ".::docs/plans/a.md::u1", project: ".", plan: "docs/plans/a.md", unit: "u1", status: "BLOCKED", evidence: "x", session_id: sid },
    { key: ".::docs/plans/b.md::u1", project: ".", plan: "docs/plans/b.md", unit: "u1", status: "IN_PROGRESS", evidence: "x", session_id: sid },
  ];
  seed(dir, sid, "- [ ] [plan:b] [unit:u1] u1 criterion\n", rows);
  const r = await run(dir, sid);
  assert.match(r.stdout, /"decision":"block"/);
  assert.match(r.stdout, /u1 criterion/);
  assert.ok(!r.events.some((e) => e.ev === "stop-acceptance-held"));
}));
