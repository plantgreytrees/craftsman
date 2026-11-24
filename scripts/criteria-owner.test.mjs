import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindingAcceptance } from "./lib/core.mjs";
import { currentState, transition } from "./tracker.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const OWNER = "- [ ] [plan:p] (owner: architect|sync-docs) rule X states Y";

test("plan.md routes a guarded-doc criterion to an owner-tagged [plan:] line, never [unit:]", () => {
  const plan = read("commands/plan.md");
  assert.match(plan, /`docWriteGuard\.docPaths`/);
  assert.match(plan, /`- \[ \] \[plan:<slug>\] \(owner: architect\|sync-docs\) <criterion>`/);
  assert.match(plan, /never `\[unit:\]`/);
});

test("plan-reviewer.md emits an owner-tagged [plan:] line for a doc-edit criterion, never a unit line", () => {
  const rev = read("agents/plan-reviewer.md");
  assert.match(rev, /\[plan:<slug>\] \(owner: architect\|sync-docs\)/);
  assert.match(rev, /never a unit line/);
});

test("scrutineer.md: an (owner: ...) criterion is MET on doc file:line evidence, UNMET when the doc is silent", () => {
  const s = read("agents/scrutineer.md");
  assert.match(s, /`\(owner: …\)` criterion is `MET` on doc `file:line` evidence \(no test required\)/);
  assert.match(s, /`UNMET` when the doc does not say it/);
});

test("instruction.md step 4 ticks the owner-tagged criteria it satisfies", () => {
  const step4 = read("commands/instruction.md").split("\n").find((l) => l.startsWith("4. /craftsman:sync-docs"));
  assert.ok(step4, "step 4 present");
  assert.match(step4, /ticks the `\(owner: …\)` criteria it satisfies/);
});

test("orchestrate.md: units never take owner-tagged lines", () => {
  assert.match(read("commands/orchestrate.md"), /Units never take `\(owner: …\)` lines/);
});

test("an (owner: ...) [plan:] line binds like any [plan:] line and never a unit's MERGED (ARCH-TRACKER-15)", () => {
  assert.deepEqual(bindingAcceptance(OWNER, { units: ["u"], plans: [] }).binding, []);
  assert.deepEqual(bindingAcceptance(OWNER, { units: ["u"], plans: ["other"] }).binding, []);
  assert.deepEqual(bindingAcceptance(OWNER, { units: [], plans: ["docs/plans/p.md"] }).binding.map((c) => c.line), [OWNER]);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-owner-"));
  try {
    const ctx = { id: ".", root, stateDir: path.join(root, ".craftsman") };
    fs.mkdirSync(ctx.stateDir, { recursive: true });
    const plan = "docs/plans/p.md";
    transition({ plan, unit: "u", status: "PENDING" }, ctx);
    transition({ plan, unit: "u", status: "IN_PROGRESS", evidence: "claimed" }, ctx);
    fs.writeFileSync(path.join(ctx.stateDir, "acceptance.md"), `- [x] [unit:u] done\n${OWNER}\n`);
    transition({ plan, unit: "u", status: "MERGED", evidence: "abc" }, ctx);
    assert.equal(currentState(ctx).find((r) => r.unit === "u").status, "MERGED");
    fs.writeFileSync(path.join(ctx.stateDir, "acceptance.md"), "- [ ] [unit:u] open\n");
    assert.throws(() => transition({ plan, unit: "u", status: "COMPLETE", evidence: "abc" }, ctx), /refused/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
