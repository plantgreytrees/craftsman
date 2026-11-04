// The pre-merge gate expands {changed} / {changedDirs} from the branch diff against its landing target (ARCH-LAND-37).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { inspectRepo, landFeature, landUnit, merge, prepare } from "./repo-exec.mjs";
import { ledgerPath } from "./tracker.mjs";
import { projectContext } from "./lib/core.mjs";

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", LC_ALL: "C" };
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"] }).trim();
const real = (p) => fs.realpathSync(p);

// The stub gate appends its argv and cwd to a log outside every worktree, so the worktrees stay clean.
const STUB = [
  'import fs from "node:fs";',
  "const [out, ...argv] = process.argv.slice(2);",
  'fs.appendFileSync(out, JSON.stringify({ argv, cwd: process.cwd() }) + "\\n");',
  "",
].join("\n");

const write = (dir, file, text = "x\n") => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
const commit = (dir, message, ...extra) => { git(dir, "add", "-A"); git(dir, "commit", "-q", ...extra, "-m", message); };

// A local repo whose package.json gate is the stub, called with `args` after the log path. `config` is merged into the project config.
function fixture(args, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scoped-"));
  const log = path.join(root, ".craftsman", "gate.log");
  fs.mkdirSync(path.dirname(log), { recursive: true });
  git(root, "init", "-q", "-b", "main");
  write(root, "package.json", "{}\n");
  write(root, "gate.mjs", STUB);
  write(root, "README.md");
  write(root, "src/a.js", "a\n");
  write(root, "src/b.js", "b\n");
  write(root, "craftsman.config.json", JSON.stringify({ repoExec: { land: "direct" }, stopGate: { commands: { "package.json": `node gate.mjs ${log} ${args}`.trim() } }, ...config }));
  commit(root, "init");
  write(root, "craftsman.workspace.json", JSON.stringify({ version: 1, projects: { one: { root: "." } } }));
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = path.join(root, "craftsman.workspace.json");
  const context = projectContext("one");
  const info = inspectRepo(context, { base_branch: "main" });
  const read = (file) => { try { return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; } };
  return {
    root, context, info,
    runs: () => read(log),
    gateEvents: () => read(path.join(root, ".craftsman", "events.jsonl")).filter((e) => e.ev === "pre_merge_gate"),
  };
}
const cleanup = (t) => fs.rmSync(t.root, { recursive: true, force: true });

// A unit worktree off main, with one commit made by `change(worktree)`.
function unit(t, change) {
  const wt = prepare(t.context, { unit: "u1", slug: "u1" }, t.info).worktree_path;
  change(wt);
  commit(wt, "unit", "--allow-empty");
  // The landing removes the worktree, so its physical path (what a gate's process.cwd() reports) is taken now.
  return { wt, real: real(wt), input: { unit: "u1", slug: "u1", worktree_path: wt, push: false } };
}

test("merge: a {changed}/{changedDirs} gate expands from the branch diff against base, deleted files left out", () => {
  const t = fixture("{changed} -- {changedDirs}");
  try {
    const u = unit(t, (wt) => {
      write(wt, "src/a.js", "a2\n");
      write(wt, "lib/c.js");
      write(wt, "src/with space.js");
      write(wt, "src/ünï.js");
      fs.unlinkSync(path.join(wt, "src", "b.js"));
    });
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    const runs = t.runs();
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].argv, ["lib/c.js", "src/a.js", "src/with space.js", "src/ünï.js", "--", "lib", "src"]);
    assert.equal(runs[0].cwd, u.real);
    assert.deepEqual(t.gateEvents(), []);
  } finally { cleanup(t); }
});

test("merge: an empty diff skips the gate and logs one no-changes event", () => {
  const t = fixture("{changed}");
  try {
    const u = unit(t, () => {});
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    assert.equal(t.runs().length, 0);
    const events = t.gateEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].reason, "no-changes");
    assert.equal(events[0].skipped, true);
    assert.equal(events[0].ref, "main");
  } finally { cleanup(t); }
});

test("merge: a diff that cannot be computed fails the gate as any gate failure, and nothing lands", () => {
  const t = fixture("{changed}");
  try {
    const u = unit(t, (wt) => write(wt, "src/a.js", "a2\n"));
    const before = git(t.root, "rev-parse", "main");
    assert.throws(() => merge(t.context, u.input, { ...t.info, base_branch: "no-such-branch" }), /pre-merge gate failed[^]*no-such-branch\.\.\.HEAD/);
    assert.equal(t.runs().length, 0);
    assert.equal(git(t.root, "rev-parse", "main"), before);
    assert.equal(t.gateEvents().length, 0);
  } finally { cleanup(t); }
});

test("merge: a command without a placeholder runs once, unchanged, even when the diff is empty", () => {
  const t = fixture("--flag value");
  try {
    const u = unit(t, () => {});
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    const runs = t.runs();
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].argv, ["--flag", "value"]);
    assert.equal(runs[0].cwd, u.real);
    assert.deepEqual(t.gateEvents(), []);
  } finally { cleanup(t); }
});

test("merge: an unscoped command is never given a diff, so a base it cannot diff against does not fail it", () => {
  const t = fixture("");
  try {
    const u = unit(t, (wt) => write(wt, "src/a.js", "a2\n"));
    // The gate runs before anything else touches base: with no placeholder the missing ref is never looked at.
    assert.throws(() => merge(t.context, u.input, { ...t.info, base_branch: "no-such-branch" }), (error) => !/pre-merge gate failed/.test(error.message));
    assert.equal(t.runs().length, 1);
  } finally { cleanup(t); }
});

test("merge: a placeholder embedded in a token fails the gate, is never run, and nothing lands", () => {
  const t = fixture("--files={changed}");
  try {
    const u = unit(t, (wt) => write(wt, "src/a.js", "a2\n"));
    const before = git(t.root, "rev-parse", "main");
    assert.throws(() => merge(t.context, u.input, t.info), (error) => /^pre-merge gate failed — \{changed\}\/\{changedDirs\} must be a whole argument in "node gate\.mjs [^"]*--files=\{changed\}"/.test(error.message));
    assert.equal(t.runs().length, 0);
    assert.equal(git(t.root, "rev-parse", "main"), before);
    assert.deepEqual(t.gateEvents(), []);
  } finally { cleanup(t); }
});

test("merge: a branch that only deletes files fails a scoped gate with the deletions-only message, and nothing lands", () => {
  const t = fixture("{changed}");
  try {
    const u = unit(t, (wt) => fs.unlinkSync(path.join(wt, "src", "b.js")));
    const before = git(t.root, "rev-parse", "main");
    assert.throws(() => merge(t.context, u.input, t.info), (error) => error.message === "pre-merge gate failed — this branch only deletes files, so a scoped command has nothing to name; run the suite unscoped");
    assert.equal(t.runs().length, 0);
    assert.equal(git(t.root, "rev-parse", "main"), before);
    assert.deepEqual(t.gateEvents(), []);
  } finally { cleanup(t); }
});

test("merge: a branch that deletes one file and adds another expands only the added one", () => {
  const t = fixture("{changed} -- {changedDirs}");
  try {
    const u = unit(t, (wt) => { fs.unlinkSync(path.join(wt, "src", "b.js")); write(wt, "lib/new.js"); });
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    const runs = t.runs();
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].argv, ["lib/new.js", "--", "lib"]);
    assert.deepEqual(t.gateEvents(), []);
  } finally { cleanup(t); }
});

test("merge (pr mode): a unit PR's gate diffs against the feature branch the PR targets", () => {
  const t = fixture("{changed}", { repoExec: { land: "pr" } });
  try {
    git(t.root, "branch", "feature/p-1", "main");
    const fw = path.join(t.root, ".worktrees", "p-1");
    git(t.root, "worktree", "add", fw, "feature/p-1");
    write(fw, "feature-only.js");
    commit(fw, "earlier unit");
    const wt = path.join(t.root, ".worktrees", "u1");
    git(t.root, "worktree", "add", "-b", "feat/u1", wt, "feature/p-1");
    write(wt, "src/a.js", "a2\n");
    commit(wt, "unit");
    // No origin: the landing refuses once the gate has passed, which is all this test needs of it.
    assert.throws(() => merge(t.context, { unit: "u1", slug: "u1", worktree_path: wt, feature_branch: "feature/p-1" }, t.info), /no origin remote/);
    const runs = t.runs();
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].argv, ["src/a.js"]);
  } finally { cleanup(t); }
});

test("land-unit: the gate in the unit worktree diffs against the feature branch the unit lands onto", () => {
  const t = fixture("{changed}", { planning: { featureBranches: true } });
  try {
    const fw = path.join(t.root, ".worktrees", "p-1");
    git(t.root, "worktree", "add", "-b", "feature/p-1", fw, "main");
    write(fw, "feature-only.js");
    commit(fw, "earlier unit");
    const uw = path.join(t.root, ".worktrees", "u2");
    git(t.root, "worktree", "add", "-b", "feat/u2", uw, "feature/p-1");
    write(uw, "src/a.js", "a2\n");
    commit(uw, "unit");
    const physical = real(uw); // landUnit removes the unit worktree
    const r = landUnit(t.context, { unit: "u2", feature_branch: "feature/p-1", worktree_path: fw, unit_worktree: uw, push: false }, t.info);
    assert.equal(r.merged, true);
    const runs = t.runs();
    assert.equal(runs.length, 1);
    // Against main the earlier unit's feature-only.js would be listed too.
    assert.deepEqual(runs[0].argv, ["src/a.js"]);
    assert.equal(runs[0].cwd, physical);
  } finally { cleanup(t); }
});

test("land-feature: the gate in the temp worktree diffs against origin/<base> after it was merged in", () => {
  const t = fixture("{changed}", { planning: { featureBranches: true }, repoExec: { land: "direct", approval: { required: false } } });
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scoped-other-"));
  const origin = path.join(other, "origin.git");
  try {
    git(other, "init", "-q", "--bare", "-b", "main", origin);
    git(t.root, "remote", "add", "origin", origin);
    git(t.root, "push", "-q", "origin", "main");
    git(t.root, "fetch", "-q", "origin");
    const info = inspectRepo(t.context, { base_branch: "main" });
    // The feature forks from local main; origin/main then gains a commit the feature has never seen.
    const fw = path.join(t.root, ".worktrees", "p-1");
    git(t.root, "worktree", "add", "-b", "feature/p-1", fw, "main");
    write(fw, "src/a.js", "a2\n");
    commit(fw, "feature work");
    const clone = path.join(other, "clone");
    git(other, "clone", "-q", origin, clone);
    write(clone, "upstream.js");
    commit(clone, "upstream");
    git(clone, "push", "-q", "origin", "main");
    fs.mkdirSync(path.dirname(ledgerPath(t.context)), { recursive: true });
    fs.writeFileSync(ledgerPath(t.context), JSON.stringify({ project: ".", plan: "docs/plans/p.md", unit: "u1", feature: "1", feature_branch: "feature/p-1", status: "FEATURE_MERGED", session_id: "s", evidence: "x", updated_at: "2026-01-01T00:00:00Z", key: ".::docs/plans/p.md::u1" }) + "\n");
    const r = landFeature(t.context, { plan: "docs/plans/p.md", feature: "1", feature_branch: "feature/p-1", network: "online" }, info);
    assert.equal(r.merged, true, JSON.stringify(r));
    const runs = t.runs();
    assert.equal(runs.length, 1);
    // Against local main (which lacks upstream.js) the merged-in upstream file would be listed too.
    assert.deepEqual(runs[0].argv, ["src/a.js"]);
  } finally { cleanup(t); fs.rmSync(other, { recursive: true, force: true }); }
});
