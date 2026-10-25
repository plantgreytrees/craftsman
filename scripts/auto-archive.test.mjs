import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { autoArchiveEligible } from "./lib/archive.mjs";
import { landingCapability } from "./doc-retire.mjs";
import { buildIndex } from "./lib/plan-index.mjs";
import { inspectRepo, landFeature, prepare } from "./repo-exec.mjs";
import { ledgerPath } from "./tracker.mjs";
import { projectContext } from "./lib/core.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

// ---- 5.1: autoArchiveEligible, one reason-bearing case per condition -------------------------------------------------
const PLAN = "docs/plans/p.md";
const closed = [{ plan: PLAN, unit: "a", status: "COMPLETE" }, { plan: PLAN, unit: "b", status: "CANCELLED" }];
const ok = {
  capability: landingCapability(),
  resolveArchive: () => ({ id: "archive", root: "/tmp/archive" }),
  currentState: () => closed,
  findReferrers: () => ({ hits: [PLAN, "docs/plans/TRACKER.md"], blocking: [], rewritable: [] }),
  git: () => "",
  loadIndex: () => ({ get: () => undefined, nodes: new Map() }),
};
const ctx = { root: "/tmp/x" };

test("autoArchiveEligible: eligible only when every condition holds", () => {
  assert.deepEqual(autoArchiveEligible(ctx, PLAN, ok), { eligible: true });
});

test("autoArchiveEligible: each failing condition is refused with its reason", () => {
  const notTracked = () => { throw new Error("not tracked"); };
  const table = [
    ["no archive project", { resolveArchive: () => ({ off: "no workspace manifest" }) }, /no archive project: no workspace manifest/],
    ["no tracker rows", { currentState: () => [] }, /no tracker rows/],
    ["an open row", { currentState: () => [...closed, { plan: PLAN, unit: "c", status: "IN_PROGRESS" }] }, /open rows: c=IN_PROGRESS/],
    ["a failed scan", { findReferrers: () => null }, /referrer scan failed/],
    ["a blocking referrer", { findReferrers: () => ({ hits: [PLAN, "scripts/x.test.mjs"] }) }, /referenced by scripts\/x\.test\.mjs/],
    ["a rewritable prose referrer", { findReferrers: () => ({ hits: [PLAN, "docs/plans/q.md"], rewritable: ["docs/plans/q.md"] }) }, /referenced by docs\/plans\/q\.md/],
    ["an open sibling", { currentState: () => [...closed, { plan: "docs/plans/scrutinise-p.md", unit: "s", status: "IN_PROGRESS" }] }, /open sibling plans keep docs\/plans\/p\.md: docs\/plans\/scrutinise-p\.md \(s=IN_PROGRESS\)/],
    ["a live descendant", { loadIndex: () => buildIndex([
      { path: PLAN, slug: "p", text: "---\nlevel: epic\nchildren: [c]\n---\n# p\n" },
      { path: "docs/plans/c.md", slug: "c", text: "---\nparent: p\n---\n# c\n" }]) }, /has live descendants: c/],
    ["an untracked doc", { git: (args) => { if (args[0] === "ls-files") notTracked(); return ""; } }, /not tracked/],
    ["a dirty doc", { git: (args) => (args[0] === "status" ? " M docs/plans/p.md\n" : "") }, /uncommitted changes/],
    ["a throwing seam", { resolveArchive: () => { throw new Error("boom"); } }, /eligibility check failed: boom/],
    ["a bad plan path", { plan: "../p.md" }, /invalid plan path/],
    ["no landing capability", { capability: undefined }, /no landing capability/],
    ["a forged capability", { capability: { landing: true } }, /no landing capability/],
  ];
  for (const [name, override, reason] of table) {
    const { plan, ...seams } = override;
    const verdict = autoArchiveEligible(ctx, plan ?? PLAN, { ...ok, ...seams });
    assert.equal(verdict.eligible, false, name);
    assert.match(verdict.reason, reason, name);
  }
});

test("autoArchiveEligible: sibling plans and the plan's own rollup are not referrers", () => {
  const hits = [PLAN, "docs/plans/p/TRACKER.md", "docs/plans/scrutinise-p.md", "docs/plans/investigate-p.md", "docs/plans/TRACKER-x.md"];
  assert.equal(autoArchiveEligible(ctx, PLAN, { ...ok, findReferrers: () => ({ hits }) }).eligible, true);
});

// ---- 5.2/5.3: land-feature wiring ------------------------------------------------------------------------------------
function scenario(deps, { dirtyMain = false, mainFiles = {}, featureFiles = {}, extraRows = [], plan = "docs/plans/p.md" } = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-archive-"));
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  try {
    const repos = {};
    for (const id of ["one", "archive"]) {
      const root = path.join(workspace, id);
      fs.mkdirSync(root, { recursive: true });
      git(root, ["init", "-q"]);
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "t"]);
      fs.writeFileSync(path.join(root, "README.md"), `${id}\n`);
      git(root, ["add", "README.md"]);
      git(root, ["commit", "-q", "-m", "init"]);
      const origin = path.join(workspace, `${id}-origin.git`);
      git(workspace, ["init", "-q", "--bare", origin]);
      git(root, ["remote", "add", "origin", origin]);
      git(root, ["push", "-q", "-u", "origin", git(root, ["branch", "--show-current"])]);
      repos[id] = { root, origin };
    }
    const manifest = path.join(workspace, "craftsman.workspace.json");
    fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: { one: { root: "one" }, archive: { root: "archive" } } }));
    process.env.CRAFTSMAN_WORKSPACE_MANIFEST = manifest;
    const context = projectContext("one");
    fs.writeFileSync(path.join(context.root, "craftsman.config.json"), JSON.stringify({ planning: { featureBranches: true }, repoExec: { approval: { required: false } } }));
    git(context.root, ["add", "craftsman.config.json"]);
    git(context.root, ["commit", "-q", "-m", "config"]);
    git(context.root, ["push", "-q", "origin", git(context.root, ["branch", "--show-current"])]);
    const put = (root, files, message) => {
      for (const [file, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); }
      if (Object.keys(files).length) { git(root, ["add", ...Object.keys(files)]); git(root, ["commit", "-q", "-m", message]); }
    };
    put(context.root, mainFiles, "docs on main");
    if (Object.keys(mainFiles).length) git(context.root, ["push", "-q", "origin", git(context.root, ["branch", "--show-current"])]);
    const info = inspectRepo(context);
    const feature = prepare(context, { unit: "f-x", slug: "p-f1", branch: "feature/p-f1" }, info);
    git(feature.worktree_path, ["push", "-q", "-u", "origin", "feature/p-f1"]);
    fs.writeFileSync(path.join(feature.worktree_path, "a.txt"), "a\n");
    git(feature.worktree_path, ["add", "a.txt"]);
    git(feature.worktree_path, ["commit", "-q", "-m", "feat: a"]);
    put(feature.worktree_path, featureFiles, "docs in the landed merge");
    git(feature.worktree_path, ["push", "-q", "origin", "feature/p-f1"]);
    const rows = ["u0", "u1"].map((unit) => ({ key: `.::${plan}::${unit}`, project: ".", plan, unit, status: "IN_PROGRESS", evidence: "x", session_id: "s", feature: "f1", feature_branch: "feature/p-f1", updated_at: "2026-01-01T00:00:00Z" }));
    const file = ledgerPath(context);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, rows.flatMap((row) => [JSON.stringify(row), JSON.stringify({ ...row, status: "FEATURE_MERGED" })]).join("\n") + "\n" + extraRows.map((r) => JSON.stringify({ key: `.::${r.plan}::${r.unit}`, project: ".", evidence: "x", session_id: "s", updated_at: "2026-01-01T00:00:00Z", ...r })).map((l) => `${l}\n`).join(""));
    if (dirtyMain) fs.appendFileSync(path.join(context.root, "README.md"), "dirty\n");
    const archiveBefore = git(repos.archive.root, ["rev-parse", "HEAD"]);
    const originBefore = git(repos.archive.origin, ["rev-parse", "HEAD"]);
    const calls = { retire: [], retireCapability: [] };
    const mainState = () => ({ head: git(context.root, ["rev-parse", "HEAD"]), status: git(context.root, ["status", "--porcelain", "-uno"]) });
    const mainBefore = mainState();
    const result = landFeature(context, { plan, feature: "f1", session_id: "s" }, info, deps(calls, repos));
    const events = fs.existsSync(path.join(context.stateDir, "events.jsonl"))
      ? fs.readFileSync(path.join(context.stateDir, "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    const normal = JSON.parse(JSON.stringify(result, (k, v) => (typeof v === "string" ? v.replaceAll(workspace, "<ws>").replace(/\b[0-9a-f]{40}\b/g, "<sha>") : v)));
    const after = { archiveFiles: git(repos.archive.root, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n"), archiveSubject: git(repos.archive.root, ["log", "-1", "--format=%s"]),
      planPresent: fs.existsSync(path.join(context.root, plan)), mainSubject: git(context.root, ["log", "-1", "--format=%s"]) };
    return { after, mainBefore, mainAfter: mainState(), normal, events, calls, repos, archiveBefore, originBefore, archiveAfter: git(repos.archive.root, ["rev-parse", "HEAD"]), originAfter: git(repos.archive.origin, ["rev-parse", "HEAD"]), context };
  } finally {
    if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

const eligibleSeam = () => ({ eligible: true });
const noRetire = () => ({});

test("land-feature: no retire is attempted when the plan is not eligible, and the landing is unchanged", () => {
  const baseline = scenario(noRetire);
  const skipped = scenario((calls) => ({ autoArchiveEligible: () => ({ eligible: false, reason: "referenced by x" }), retire: (i) => { calls.retire.push(i); return {}; } }));
  assert.equal(skipped.calls.retire.length, 0);
  assert.ok(skipped.events.some((e) => e.ev === "doc_retire_skipped" && e.reason === "referenced by x"));
  assert.deepEqual(skipped.normal, baseline.normal);
  assert.equal(baseline.normal.merged, true);
});

test("land-feature: an eligible plan is retired through the landing capability, archive_push_pending is logged and the archive is never pushed", () => {
  const baseline = scenario(noRetire);
  const done = scenario((calls, repos) => ({
    autoArchiveEligible: eligibleSeam,
    retire: (input, _context, capability) => {
      calls.retire.push(input);
      calls.retireCapability.push(capability);
      fs.writeFileSync(path.join(repos.archive.root, "x.txt"), "x\n");
      git(repos.archive.root, ["add", "x.txt"]);
      git(repos.archive.root, ["commit", "-q", "-m", "archive p"]);
      return { retired: input.plan, sha: "abc" };
    },
  }));
  assert.equal(done.calls.retire.length, 1);
  assert.equal("auto" in done.calls.retire[0], false, "auto is not an input field: only the capability makes a retire automatic");
  assert.equal(done.calls.retireCapability[0], landingCapability(), "retire is called with the landing capability (ARCH-DOCS-17)");
  assert.equal(done.calls.retire[0].plan, "docs/plans/p.md");
  assert.equal(done.calls.retire[0].sid, "s");
  assert.notEqual(done.archiveAfter, done.archiveBefore, "archive committed locally");
  assert.equal(done.originAfter, done.originBefore, "archive remote untouched");
  const pending = done.events.find((e) => e.ev === "archive_push_pending");
  assert.equal(pending.commit, done.archiveAfter);
  // The single auto doc_retired event is written by retire itself (it carries the capability); autoArchive adds none.
  assert.equal(done.events.filter((e) => e.ev === "doc_retired").length, 0);
  assert.deepEqual(done.normal, baseline.normal);
});

test("land-feature: a retire refusal or exception leaves the landing result identical and never parks", () => {
  const baseline = scenario(noRetire);
  const variants = {
    refused: () => ({ autoArchiveEligible: eligibleSeam, retire: () => ({ refused: true, reason: "no doc-write grant" }) }),
    throws: () => ({ autoArchiveEligible: eligibleSeam, retire: () => { throw new Error("retire exploded"); } }),
    eligibilityThrows: () => ({ autoArchiveEligible: () => { throw new Error("check exploded"); }, retire: () => ({}) }),
  };
  for (const [name, deps] of Object.entries(variants)) {
    const run = scenario(deps);
    assert.deepEqual(run.normal, baseline.normal, name);
    assert.equal(run.normal.merged, true, name);
    assert.equal(run.normal.parked, undefined, name);
    assert.equal(run.originAfter, run.originBefore, name);
    assert.ok(run.events.some((e) => e.ev === "doc_retire_skipped"), name);
    assert.ok(!run.events.some((e) => e.ev === "archive_push_pending"), name);
  }
});

test("land-feature: a dirty main checkout skips the retire without changing the landing", () => {
  const baseline = scenario(noRetire);
  const dirty = scenario((calls) => ({ autoArchiveEligible: eligibleSeam, retire: (i) => { calls.retire.push(i); return {}; } }), { dirtyMain: true });
  assert.equal(dirty.calls.retire.length, 0);
  assert.deepEqual(dirty.normal, baseline.normal);
});

test("land-feature: with no archive project the main checkout HEAD and working tree are untouched (ARCH-LAND-30)", () => {
  const run = scenario((calls) => ({
    autoArchiveEligible: (ctx, plan) => autoArchiveEligible(ctx, plan, { capability: landingCapability(), resolveArchive: () => ({ off: "none" }) }),
    retire: (i) => { calls.retire.push(i); return {}; },
  }));
  assert.equal(run.normal.merged, true);
  assert.equal(run.calls.retire.length, 0);
  assert.deepEqual(run.mainAfter, run.mainBefore);
  assert.ok(run.events.some((e) => e.ev === "doc_retire_skipped" && /no archive project/.test(e.reason)));
});

test("land-feature: an ineligible plan leaves the main checkout HEAD and working tree untouched", () => {
  const run = scenario((calls) => ({ autoArchiveEligible: () => ({ eligible: false, reason: "open rows: u0=IN_PROGRESS" }), retire: (i) => { calls.retire.push(i); return {}; } }));
  assert.equal(run.calls.retire.length, 0);
  assert.deepEqual(run.mainAfter, run.mainBefore);
});

test("land-feature: a throwing retire does not change the landing result", () => {
  const baseline = scenario(noRetire);
  const run = scenario(() => ({ autoArchiveEligible: eligibleSeam, retire: () => { throw new Error("retire exploded"); } }));
  assert.deepEqual(run.normal, baseline.normal);
  assert.equal(run.normal.merged, true);
});

// ---- fix-pointer-rewrite-and-ff: eligibility predicts retire, so the main checkout never moves for a retire that cannot run ----
const real = (calls) => ({ retire: (i) => { calls.retire.push(i); return {}; } });
const P = "docs/plans/zq-plan.md";

test("land-feature: an open sibling plan leaves the main checkout HEAD and working tree untouched (ARCH-LAND-30)", () => {
  const run = scenario(real, { plan: P,
    mainFiles: { [P]: "# zq-plan\n", "docs/plans/scrutinise-zq-plan.md": "# s\n" },
    extraRows: [{ plan: "docs/plans/scrutinise-zq-plan.md", unit: "s1", status: "IN_PROGRESS" }],
  });
  assert.equal(run.normal.merged, true);
  assert.equal(run.calls.retire.length, 0);
  assert.deepEqual(run.mainAfter, run.mainBefore);
  assert.ok(run.events.some((e) => e.ev === "doc_retire_skipped" && /open sibling plans/.test(e.reason)), JSON.stringify(run.events));
});

test("land-feature: a live descendant leaves the main checkout HEAD and working tree untouched (ARCH-LAND-30)", () => {
  const run = scenario(real, { plan: P,
    mainFiles: { [P]: "---\nlevel: epic\nchildren: [c]\n---\n# zq-plan\n", "docs/plans/c.md": "---\nparent: zq-plan\n---\n# c\n" },
  });
  assert.equal(run.normal.merged, true);
  assert.equal(run.calls.retire.length, 0);
  assert.deepEqual(run.mainAfter, run.mainBefore);
  assert.ok(run.events.some((e) => e.ev === "doc_retire_skipped" && /live descendants: c/.test(e.reason)), JSON.stringify(run.events));
});

test("land-feature: a referrer brought by the landed merge leaves the main checkout HEAD and working tree untouched (ARCH-LAND-30)", () => {
  const run = scenario(real, { plan: P, mainFiles: { [P]: "# zq-plan\n" }, featureFiles: { "docs/plans/q.md": `# q\nsee ${P}\n` } });
  assert.equal(run.normal.merged, true);
  assert.equal(run.calls.retire.length, 0);
  assert.deepEqual(run.mainAfter, run.mainBefore);
  assert.ok(run.events.some((e) => e.ev === "doc_retire_skipped" && /referenced by docs\/plans\/q\.md/.test(e.reason)), JSON.stringify(run.events));
});

test("land-feature: a plan doc that exists only in the landed merge is eligible, not reported untracked", () => {
  const run = scenario(real, { plan: P, featureFiles: { [P]: "# zq-plan\n" } });
  assert.equal(run.normal.merged, true);
  assert.equal(run.calls.retire.length, 1, JSON.stringify(run.events));
  assert.ok(!run.events.some((e) => e.ev === "doc_retire_skipped" && /not tracked/.test(e.reason)));
});

// ---- impl-landing-token 5.4: the real retire, no stub (ARCH-DOCS-17, ARCH-LAND-32, ARCH-ARCHIVE-03, ARCH-ARCHIVE-09) ----
test("land-feature end to end: a landed, referrer-free plan is archived locally through the real retire, with no grant and no push", () => {
  const run = scenario(() => ({}), { plan: P, mainFiles: { [P]: "# zq-plan\n" } });
  assert.equal(run.normal.merged, true);
  assert.ok(!run.events.some((e) => e.ev === "doc_retire_skipped"), JSON.stringify(run.events));
  // Copied and committed locally in the archive repo, never pushed (ARCH-ARCHIVE-03, ARCH-ARCHIVE-09).
  assert.notEqual(run.archiveAfter, run.archiveBefore, "archive committed locally");
  assert.ok(run.after.archiveFiles.some((f) => f.endsWith("docs/plans/zq-plan.md")), run.after.archiveFiles.join(","));
  assert.match(run.after.archiveSubject, /^archive plans\/zq-plan /);
  assert.equal(run.originAfter, run.originBefore, "archive remote untouched");
  // Retired in the main checkout by the real retire, and logged once as automatic.
  assert.equal(run.after.planPresent, false, "the plan doc left the main checkout");
  assert.equal(run.after.mainSubject, `docs: retire ${P}`);
  const retired = run.events.filter((e) => e.ev === "doc_retired");
  assert.equal(retired.length, 1, JSON.stringify(run.events));
  assert.equal(retired[0].auto, true);
  assert.equal(retired[0].plan, P);
  const pending = run.events.filter((e) => e.ev === "archive_push_pending");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].commit, run.archiveAfter);
  assert.ok(run.events.some((e) => e.ev === "archive_copied"));
});

test("land-feature: with no landing capability the main checkout HEAD and working tree are untouched (ARCH-LAND-32)", () => {
  // The real eligibility check, called without the capability, as a caller that never obtained it would.
  const run = scenario((calls) => ({
    autoArchiveEligible: (ctx, plan, seams) => autoArchiveEligible(ctx, plan, { ...seams, capability: undefined }),
    retire: (i) => { calls.retire.push(i); return {}; },
  }), { plan: P, mainFiles: { [P]: "# zq-plan\n" }, featureFiles: { "a2.txt": "x\n" } });
  assert.equal(run.normal.merged, true);
  assert.equal(run.calls.retire.length, 0);
  assert.deepEqual(run.mainAfter, run.mainBefore, "main HEAD and tree did not move");
  assert.ok(run.events.some((e) => e.ev === "doc_retire_skipped" && /no landing capability/.test(e.reason)), JSON.stringify(run.events));
});
