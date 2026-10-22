// arch-check lint only proves that a cited line range exists. A cite that has drifted onto unrelated code passes it, so
// this test pins, for each ARCH-SAFETY rule, the identifiers its cited ranges must hold: every cited range of a file
// must contain at least one of that rule's identifiers for that file. When code moves, the test names the cite to re-point.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RULES = fs.readFileSync(`${ROOT}docs/architecture/safety.rules.md`, "utf8");

// rule id -> { cited file -> identifiers; a cited range of that file must hold at least one }
const HOLDS = {
  "ARCH-SAFETY-01": { "scripts/pre-guard.mjs": ["deterministic"] },
  "ARCH-SAFETY-02": { "hooks/run.sh": ["guards cannot run", "SAFETY_HOOKS", "exec node"] },
  "ARCH-SAFETY-03": {
    "scripts/pre-guard.mjs": ["failClosed"], "scripts/agent-mode-guard.mjs": ["failClosed"], "scripts/orchestrate-scope-guard.mjs": ["failClosed"],
  },
  "ARCH-SAFETY-04": { "scripts/lib/core.mjs": ["advisorySkipped", "guardState"], "scripts/session-context.mjs": ["guardState"] },
  "ARCH-SAFETY-05": {
    "scripts/lib/core.mjs": ["safetyEnabled"],
    "scripts/pre-guard.mjs": ["selfKind", "denySelfDisable", "heldNever", "safetyKeysChanged", "hooks/hooks.json", "CLAUDE_CODE_SESSION_ID"],
    "scripts/scope.mjs": ["namesSelfScoped"],
  },
  "ARCH-SAFETY-06": {
    "scripts/lib/unpushed.mjs": ["unpushedReport", "formatReport"], "scripts/stop-gate.mjs": ["stopReports", "safetyEnabled", "unpushedReport"],
    "scripts/session-end.mjs": ["unpushedReport", "formatReport"],
  },
  "ARCH-SAFETY-07": { "scripts/worktree-sweep.mjs": ["baseRefs", "sweepConfig", "sweep-log", "branch\", \"-D\""] },
  "ARCH-SAFETY-08": {
    "scripts/lib/core.mjs": ["rootUnanchored", "safetyEnabled"], "scripts/pre-guard.mjs": ["safetyEnabled", "docSide"],
  },
  "ARCH-SAFETY-09": { "hooks/register.js": ["goal", "token"], "scripts/goal-token.mjs": ["mintGoalToken", "createHash"] },
  "ARCH-SAFETY-10": {
    "scripts/lib/doc-snapshot.mjs": ["docDrift", "snapshotDocs", "unseenDocChanges"], "scripts/stop-gate.mjs": ["stopReports", "docDrift"],
    "scripts/lib/settings-merge.mjs": ["mergeSettings", "export function"],
  },
  "ARCH-SAFETY-11": { "hooks/run.sh": ["guard_cannot_act", "ARCH-SAFETY-11"] },
};

function citesOf(ruleId) {
  const line = RULES.split("\n").find((l) => l.includes(`**${ruleId}**`));
  assert.ok(line, `${ruleId} is in safety.rules.md`);
  const cites = line.slice(line.lastIndexOf("cite:") + 5);
  return [...cites.matchAll(/([A-Za-z0-9_\-./]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g)].map((m) => ({ file: m[1], from: +m[2], to: +(m[3] || m[2]) }));
}

test("every ARCH-SAFETY rule is covered by this test, so a new rule cannot skip it", () => {
  const ids = [...RULES.matchAll(/\*\*(ARCH-SAFETY-\d+)\*\*/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)].sort(), Object.keys(HOLDS).sort());
});

for (const [ruleId, files] of Object.entries(HOLDS)) {
  test(`${ruleId}: each cited range holds an identifier the rule is about`, () => {
    const cites = citesOf(ruleId);
    assert.ok(cites.length > 0, `${ruleId} has cites`);
    for (const { file, from, to } of cites) {
      const symbols = files[file];
      assert.ok(symbols, `${ruleId} cites ${file}, which this test does not know: add it to HOLDS`);
      const lines = fs.readFileSync(`${ROOT}${file}`, "utf8").split("\n");
      assert.ok(to <= lines.length, `${ruleId}: ${file}:${from}-${to} is past the end of the file (${lines.length} lines)`);
      const text = lines.slice(from - 1, to).join("\n");
      assert.ok(symbols.some((s) => text.includes(s)), `${ruleId}: ${file}:${from}-${to} holds none of ${JSON.stringify(symbols)}: the code moved, re-point the cite`);
    }
  });
}

test("safety.rules.md verified_at names a commit that exists in this repository's history", () => {
  const sha = /^verified_at:\s*([0-9a-f]{7,40})/m.exec(RULES)?.[1];
  assert.ok(sha, "verified_at is a commit id");
  assert.notEqual(sha, "96a029c6928ee7d87bd41a0d0e142bad25928a9b", "verified_at was bumped past the first safety commit");
});
