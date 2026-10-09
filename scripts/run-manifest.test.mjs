import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { currentState, transition } from "./tracker.mjs";
import { buildManifest, manifestPath, planSlug, syncRunManifest } from "./run-manifest.mjs";

const fixtures = new Set();
function context() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-run-manifest-"));
  fixtures.add(root);
  return { id: ".", root, stateDir: path.join(root, ".craftsman") };
}
afterEach(() => {
  for (const fixture of fixtures) fs.rmSync(fixture, { recursive: true, force: true });
  fixtures.clear();
});

const PLAN = "docs/plans/demo.md";
const DECISION = { question: "Which queue?", options: ["redis", "sqs"], recommended: "redis" };
const move = (selected, unit, status, extra = {}) =>
  transition({ plan: PLAN, unit, status, evidence: `${unit} ${status}`, ...extra }, selected);
const read = (selected) => JSON.parse(fs.readFileSync(manifestPath(selected, PLAN), "utf8"));

// What the ledger says, feature by feature — the manifest must equal it.
function fromLedger(selected) {
  return currentState(selected).filter((row) => row.plan === PLAN)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({ unit: row.unit, status: row.status, decision: row.status === "PARKED" ? row.decision : null }));
}
const brief = (manifest) => manifest.features.map(({ unit, status, decision }) => ({ unit, status, decision }));

test("run-manifest: .craftsman/runs/<slug>.json matches the ledger after every transition (ARCH-TRACKER-01)", () => {
  const selected = context();
  fs.mkdirSync(selected.stateDir, { recursive: true });
  fs.writeFileSync(path.join(selected.stateDir, "acceptance.md"), [
    "- [x] [unit:alpha] first", "- [ ] [unit:alpha] second", "- [ ] [unit:S-beta] scoped", "- [ ] plan-wide",
  ].join("\n") + "\n");
  assert.equal(manifestPath(selected, PLAN), path.join(selected.root, ".craftsman", "runs", "demo.json"));

  const steps = [
    ["alpha", "PENDING"], ["beta", "PENDING", { scope_id: "S-beta" }], ["alpha", "IN_PROGRESS"], ["beta", "IN_PROGRESS"],
    ["beta", "PARKED", { autonomous: true, decision: DECISION }], ["alpha", "BLOCKED"],
  ];
  for (const [unit, status, extra] of steps) {
    move(selected, unit, status, extra);
    assert.deepEqual(brief(read(selected)), fromLedger(selected), `after ${unit} → ${status}`);
  }
  const manifest = read(selected);
  assert.equal(manifest.slug, "demo");
  assert.equal(manifest.plan, PLAN);
  assert.deepEqual(manifest.features, [
    { unit: "alpha", status: "BLOCKED", criteria: { ticked: 1, total: 2 }, decision: null },
    { unit: "beta", status: "PARKED", criteria: { ticked: 0, total: 1 }, decision: DECISION },
  ]);

  // Unparked → the decision leaves the manifest with the ledger.
  move(selected, "beta", "IN_PROGRESS");
  assert.deepEqual(brief(read(selected)), fromLedger(selected));
  assert.equal(read(selected).features[1].decision, null);
});

test("run-manifest: a hand edit is overwritten by the next transition", () => {
  const selected = context();
  move(selected, "alpha", "PENDING");
  move(selected, "beta", "PENDING");
  const file = manifestPath(selected, PLAN);
  const tampered = read(selected);
  tampered.features[0].status = "COMPLETE";
  tampered.features.push({ unit: "ghost", status: "COMPLETE", criteria: { ticked: 9, total: 9 }, decision: null });
  fs.writeFileSync(file, JSON.stringify(tampered));

  move(selected, "beta", "IN_PROGRESS");
  assert.deepEqual(brief(read(selected)), fromLedger(selected));
  assert.ok(!read(selected).features.some((f) => f.unit === "ghost"));

  // Even a direct sync with nothing new restores it from the ledger.
  fs.writeFileSync(file, "{}");
  assert.equal(syncRunManifest(selected, PLAN, currentState(selected)).changed, true);
  assert.deepEqual(brief(read(selected)), fromLedger(selected));
  assert.equal(syncRunManifest(selected, PLAN, currentState(selected)).changed, false, "no-op when it already matches");
});

test("run-manifest: one file per plan, and other plans' rows stay out", () => {
  const selected = context();
  move(selected, "alpha", "PENDING");
  transition({ plan: "docs/plans/other.md", unit: "zeta", status: "PENDING" }, selected);
  assert.deepEqual(read(selected).features.map((f) => f.unit), ["alpha"]);
  const other = JSON.parse(fs.readFileSync(manifestPath(selected, "docs/plans/other.md"), "utf8"));
  assert.deepEqual(other.features.map((f) => f.unit), ["zeta"]);
  assert.equal(planSlug("docs/plans/a-b.md"), "a-b");
  assert.deepEqual(buildManifest(PLAN, [], "").features, []);
});
