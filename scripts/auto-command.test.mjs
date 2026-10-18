import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const auto = read("commands/auto.md");
const instruction = read("commands/instruction.md");
const merge = read("commands/merge.md");

const section = (doc, heading) => {
  const start = doc.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `missing heading ${heading}`);
  const next = doc.indexOf("\n## ", start + heading.length + 2);
  return doc.slice(start, next < 0 ? undefined : next);
};

test("auto.md: the four phases appear, in order (ARCH-AUTO-01)", () => {
  const headings = ["## Phase A — Ask", "## Phase B — Run", "## Phase C — Ask again", "## Finish"];
  const at = headings.map((h) => auto.indexOf(`\n${h}\n`));
  assert.ok(at.every((i) => i >= 0), `headings: ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test("auto.md: Phase A asks every open decision up front and never defaults one (ARCH-AUTO-02)", () => {
  const ask = section(auto, "## Phase A — Ask");
  assert.match(ask, /\/idea .*\/architect .*\/plan /s);
  assert.match(ask, /ask them all now with `AskUserQuestion`, before Phase B/);
  assert.match(ask, /\*\*Never default an open decision\*\*/);
  assert.match(ask, /only for a conventional choice/);
  assert.match(section(auto, "## Phase C — Ask again"), /one consolidated `AskUserQuestion` round[\s\S]*PARKED row's decision/);
});

test("auto.md: Phase C builds its round from ledger decisions; the runner parks through tracker.mjs with one (ARCH-TRACKER-03, LAND-06)", () => {
  const again = section(auto, "## Phase C — Ask again");
  assert.match(again, /build the round from the ledger, not from memory: `tracker\.mjs` `status`/);
  assert.match(again, /\.craftsman\/runs\/<slug>\.json/);
  assert.match(again, /decision \{question, options\[\], recommended\?\}/);
  assert.match(again, /conflict, ff-only, rejected push, auto-merge; ARCH-LAND-06/);
  assert.match(again, /asked with its own question and options and its `recommended` marked/);
  assert.match(again, /without a decision → ask what it needs; never guess/);
  const runner = read("agents/unit-runner.md");
  const park = section(runner, "## park");
  assert.match(park, /`S tracker` → `PARKED` with `autonomous:true`, `evidence:"<reason>"` and `decision:<parked\[0\]>`/);
  assert.match(park, /Never `CANCELLED`/);
  assert.match(section(runner, "## land"), /`\{parked:true, decision\}`[^\n]*→ return `PARKED` with `parked:\[decision\]`/);
  assert.match(section(runner, "## block"), /Any `BLOCKED` return from implement, review or land → root runs `block`/);
});

test("auto.md: Phase B sizes a fresh turn cap from instruction.md's bands and falls back to the paste (AUTO-04/05/07)", () => {
  const run = section(auto, "## Phase B — Run");
  assert.match(run, /commands\/instruction\.md/);
  assert.match(run, /QUICK 20 · 2–3 MEDIUM 50 · 4–7 LONG 100 · ≥ 8 EXTRA LONG 180/);
  assert.match(run, /fresh on every pass/);
  assert.match(run, /\.craftsman\/instructions\/<slug>\.goal\.txt/);
  assert.match(run, /\*\*Fallback:\*\*.*`-p`, `disableAllHooks`, no mod support.*print the paste-ready goal/s);
  for (const band of ["QUICK 20", "MEDIUM 50", "LONG 100", "EXTRA LONG 180"]) assert.ok(instruction.includes(band), `instruction.md band ${band}`);
});

test("auto.md: every run ends by listing the remaining rows and prompting to continue (ARCH-AUTO-03)", () => {
  const finish = section(auto, "## Finish");
  assert.match(finish, /End \*\*every\*\* run by listing the remaining rows/);
  assert.match(finish, /prompting the user to continue — `\/craftsman:auto <slug>`/);
  assert.match(finish, /until every row for the slug is COMPLETE/);
});

test("auto.md: states its git authority and its limits (ARCH-LAND-01/05)", () => {
  assert.match(auto, /standing approval to commit, branch, merge base in, push, land and clean up/);
  assert.match(auto, /never `--force`\/`-f`\/`\+refspec` on push, `reset --hard` or `worktree remove --force`/);
});

// The goal template, filled the way /auto composes it for a large plan.
function template() {
  const block = /```\n(\/goal Deliver[\s\S]*?)\n```/.exec(instruction);
  assert.ok(block, "instruction.md carries the /goal template");
  return block[1];
}

test("instruction.md: the goal template keeps the evidence clause, BLOCKED ON USER and the parked-rows met stop (ARCH-AUTO-04)", () => {
  const goal = template();
  assert.match(goal, /Done when the final turn prints COMPLETION EVIDENCE/);
  assert.match(goal, /BLOCKED ON USER: /);
  assert.match(goal, /Parked rows whose decisions \/auto's Phase C asked = met stop\./);
});

test("instruction.md: a composed sample goal measures ≤ 4000 characters", () => {
  const ids = "ARCH-STATE-01..07, ENGINE-01..11, AUTO-01..07, MOD-01..05, TRACKER-01..05, LAND-01..06";
  const goal = template()
    .replace(/<slug>/g, "autonomous-e2e-loop")
    .replace(/<one-sentence user-visible outcome>/, "one /craftsman:auto entry that asks every decision up front, runs units unattended, asks again, lands everything")
    .replace(/<\.rules\.md paths>/, "docs/architecture/{state,engine,auto,mod,tracker,landing}.rules.md")
    .replace(/<ARCH ids>/g, ids)
    .replace(/<neutral request>/, "autonomous-e2e-loop")
    .replace(/<idea "done" outcomes not yet covered>/, "root identical from two cwds; /auto asks all decisions before and after")
    .replace(/\s*\[plan exists → omit[^\]]*\]/, "")
    .replace(/<test command>/, "node --test scripts/*.test.mjs scripts/lib/*.test.mjs")
    .replace(/<base>/g, "main")
    .replace(/<N>/, "180");
  assert.doesNotMatch(goal, /<(slug|ARCH ids|N|base|test command|neutral request|\.rules\.md paths)>/, "every placeholder is filled");
  assert.ok(Buffer.byteLength(goal) <= 4000, `composed goal is ${Buffer.byteLength(goal)} bytes`);
});

test("merge.md: /auto's standing authority, per-repo plan-graph landing and submodule bump (ARCH-LAND-01..03, 07)", () => {
  const under = section(merge, "## 5a. Under /auto");
  assert.match(under, /standing approval[\s\S]*across every registered workspace project/);
  assert.match(under, /own\s+`repo-exec\.mjs` `merge`[\s\S]*order `plan-graph\.mjs`/);
  assert.match(under, /submodule pointer bump is an explicit\s+dependent unit in the parent/);
  assert.match(under, /submodules whose gitlinks their indexes record[\s\S]*never find repos by\s+scanning directories \(ARCH-LAND-07\)/);
});

test("hierarchy flags: --level/--feature on orchestrate and auto, detail in _features.md, files within budget (ARCH-PLAN-03/06, SLIM-04)", () => {
  const features = read("commands/_features.md");
  for (const f of ["orchestrate", "auto", "instruction"]) {
    const doc = read(`commands/${f}.md`);
    assert.match(doc.split("\n").find((l) => l.startsWith("argument-hint")), /--level epic\|story\|feature\|unit\] \[--feature <id>\]/, f);
    assert.match(doc, /_features\.md/, `${f} points at the detail doc`);
  }
  assert.match(features, /## levels and flags/);
  assert.match(features, /default feature/);
  assert.match(features, /`unit` is `--step`/);
  assert.match(features, /wave allowance/);
  assert.match(features, /`level`, `parent`, `children`, `priority`/);
  assert.match(read("commands/plan.md"), /`level`, `parent`, `children`, `priority`/);
  const tmpl = read("skills/language-aware-planning/references/plan-template.md");
  for (const k of ["level:", "parent:", "children:", "priority:"]) assert.ok(tmpl.includes(`\n${k}`), `template ${k}`);
  const caps = { "commands/orchestrate.md": 9911, "commands/auto.md": 4620, "commands/instruction.md": 8781, "commands/plan.md": 9969, "commands/_features.md": 3500 };
  for (const [rel, max] of Object.entries(caps)) assert.ok(fs.statSync(path.join(ROOT, rel)).size <= max, `${rel} within ${max}`);
});

test("idea.md Phase 1 overlap scan lists TRACKER-archive.md (ARCH-DOCS-05)", () => {
  assert.match(section(read("commands/idea.md"), "## Phase 1 — Overlap & prior work (bounded)"), /`TRACKER-archive\.md`/);
});

// Byte ceilings are the sizes before the lookup callers were added (ARCH-SLIM-02).
test("auto, instruction, orchestrate resolve an unknown slug through tracker.mjs lookup without growing (ARCH-DOCS-06, SLIM-02)", () => {
  const ceilings = { idea: 7232, auto: 4604, instruction: 8764, orchestrate: 9893 };
  for (const f of ["auto", "instruction", "orchestrate"]) {
    assert.match(read(`commands/${f}.md`), /[Uu]nknown slug → `tracker\.mjs lookup` before treating it as new/, f);
  }
  for (const [f, max] of Object.entries(ceilings)) {
    assert.ok(Buffer.byteLength(read(`commands/${f}.md`)) <= max, `${f}.md grew past ${max} bytes`);
  }
});
