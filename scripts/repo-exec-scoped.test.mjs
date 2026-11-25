// The pre-merge gate expands {changed} / {changedDirs} from the branch diff against its landing target (ARCH-LAND-37).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

// ARCH-ENGINE-22 / ARCH-LAND-37: a gate whose program is absent is skipped silently, the skip is logged, and the land goes on.
test("merge: a gate whose program is missing lands, and one no-command event is logged", () => {
  const t = fixture("", { stopGate: { commands: { "package.json": "craftsman-no-such-program --check" } } });
  try {
    const u = unit(t, (wt) => write(wt, "src/a.js", "a2\n"));
    const before = git(t.root, "rev-parse", "main");
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    assert.notEqual(git(t.root, "rev-parse", "main"), before);
    assert.equal(t.runs().length, 0);
    const events = t.gateEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].skipped, true);
    assert.equal(events[0].reason, "no-command");
    assert.equal(events[0].ref, "main");
    assert.equal(path.basename(events[0].worktree), "u1");
  } finally { cleanup(t); }
});

test("merge: a relative gate program that does not exist lands and logs the no-command event", () => {
  const t = fixture("", { stopGate: { commands: { "package.json": "./tools/gate.mjs --check" } } });
  try {
    const u = unit(t, (wt) => write(wt, "src/a.js", "a2\n"));
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    const events = t.gateEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].reason, "no-command");
  } finally { cleanup(t); }
});

test("merge: a project whose only gate marker is dropped lands and logs the no-command event", () => {
  const t = fixture("", { stopGate: { commands: { "package.json": null } } });
  try {
    const u = unit(t, (wt) => write(wt, "src/a.js", "a2\n"));
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    const events = t.gateEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].reason, "no-command");
  } finally { cleanup(t); }
});

// {workspaceRoot} in the pre-merge gate follows the unit worktree (ARCH-STATE-19, ARCH-LAND-37). core's PROJECT_ROOT is fixed when it
// loads, so these run repo-exec as the CLI does, in a child node whose cwd is the scratch repository.
const REPO_EXEC = fileURLToPath(new URL("./repo-exec.mjs", import.meta.url));
function cli(root, input) {
  const env = { ...process.env, ...ENV };
  for (const k of Object.keys(env)) if (k.startsWith("CLAUDE_PLUGIN_OPTION_") || ["CLAUDE_PLUGIN_ROOT", "CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID", "CRAFTSMAN_WORKSPACE_MANIFEST", "CRAFTSMAN", "CRAFTSMAN_SAFETY"].includes(k)) delete env[k];
  const r = spawnSync(process.execPath, [REPO_EXEC], { cwd: root, env, input: JSON.stringify({ project: ".", ...input }), encoding: "utf8" });
  return { status: r.status, stderr: r.stderr, out: r.stdout.trim() ? JSON.parse(r.stdout.trim().split("\n").pop()) : null };
}

// A repository whose gate is `command`, with a gate.mjs at its root that exits 0 (main's copy).
function rootFixture(command) {
  const root = real(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-wsroot-")));
  git(root, "init", "-q", "-b", "main");
  write(root, "package.json", "{}\n");
  write(root, "gate.mjs", "process.exit(0);\n");
  write(root, "craftsman.config.json", JSON.stringify({ repoExec: { land: "direct" }, stopGate: { commands: { "package.json": command } } }));
  commit(root, "init");
  return root;
}
const prepared = (root) => cli(root, { action: "prepare", unit: "u1", slug: "u1" }).out.worktree_path;
const landed = (root, wt) => cli(root, { action: "merge", unit: "u1", slug: "u1", worktree_path: wt, push: false });

test("merge: a gate `node {workspaceRoot}/gate.mjs` runs the branch's own gate.mjs, so a branch that breaks it does not merge", () => {
  const root = rootFixture("node {workspaceRoot}/gate.mjs");
  const wt = prepared(root);
  write(wt, "gate.mjs", "process.exit(1);\n");
  commit(wt, "break the gate");
  const before = git(root, "rev-parse", "main");
  const r = landed(root, wt);
  assert.equal(r.status, 2, `the gate in the worktree failed (main's copy would have passed): ${r.stderr}`);
  assert.match(r.stderr, /pre-merge gate failed/);
  assert.equal(git(root, "rev-parse", "main"), before, "nothing landed");
});

test("merge: a branch that fixes its gate.mjs passes a {workspaceRoot} gate and lands", () => {
  const root = rootFixture("node {workspaceRoot}/gate.mjs");
  write(root, "gate.mjs", "process.exit(1);\n"); // main's copy is red, the branch's is green
  commit(root, "red gate on main");
  const wt = prepared(root);
  write(wt, "gate.mjs", "process.exit(0);\n");
  commit(wt, "fix the gate");
  const before = git(root, "rev-parse", "main");
  const r = landed(root, wt);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.merged, true);
  assert.notEqual(git(root, "rev-parse", "main"), before);
});

test("merge: a gate with no {workspaceRoot} runs as before, in the worktree", () => {
  const root = rootFixture("node gate.mjs");
  const wt = prepared(root);
  write(wt, "gate.mjs", "process.exit(1);\n");
  commit(wt, "break the gate");
  assert.equal(landed(root, wt).status, 2, "cwd is the worktree, so its gate.mjs ran");
  const ok = rootFixture("node gate.mjs");
  const owt = prepared(ok);
  write(owt, "src/a.js");
  commit(owt, "unit");
  const r = landed(ok, owt);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.merged, true);
});

test("merge: a gate whose relative program exists is still run, and logs no skip", () => {
  const t = fixture("");
  try {
    const log = path.join(t.root, ".craftsman", "gate.log");
    write(t.root, "tools/gate.mjs", `#!/usr/bin/env node\n${STUB}`);
    fs.chmodSync(path.join(t.root, "tools", "gate.mjs"), 0o755);
    write(t.root, "craftsman.config.json", JSON.stringify({ repoExec: { land: "direct" }, stopGate: { commands: { "package.json": `./tools/gate.mjs ${log} --check` } } }));
    commit(t.root, "relative gate program");
    const u = unit(t, (wt) => write(wt, "src/a.js", "a2\n"));
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    const runs = t.runs();
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].argv, ["--check"]);
    assert.equal(runs[0].cwd, u.real);
    assert.deepEqual(t.gateEvents(), []);
  } finally { cleanup(t); }
});

test("merge: a gate program that cannot start (EACCES) fails the gate naming the spawn error, and nothing lands", () => {
  const t = fixture("");
  try {
    const log = path.join(t.root, ".craftsman", "gate.log");
    write(t.root, "tools/gate.mjs", `#!/usr/bin/env node\n${STUB}`); // present but never made executable
    fs.chmodSync(path.join(t.root, "tools", "gate.mjs"), 0o644);
    write(t.root, "craftsman.config.json", JSON.stringify({ repoExec: { land: "direct" }, stopGate: { commands: { "package.json": `./tools/gate.mjs ${log}` } } }));
    commit(t.root, "non-executable gate program");
    const u = unit(t, (wt) => write(wt, "src/a.js", "a2\n"));
    const before = git(t.root, "rev-parse", "main");
    assert.throws(() => merge(t.context, u.input, t.info), (error) => /^pre-merge gate failed — "\.\/tools\/gate\.mjs [^"]*" did not pass in [^\n]*:\nEACCES: /.test(error.message));
    assert.equal(t.runs().length, 0);
    assert.equal(git(t.root, "rev-parse", "main"), before);
  } finally { cleanup(t); }
});

test("merge: a {changed} list past the argv cap fails the gate naming the cap and the file count, with no spawn, and nothing lands", () => {
  const t = fixture("{changed}");
  try {
    const u = unit(t, (wt) => { for (let i = 0; i < 1200; i++) write(wt, `src/${String(i).padStart(4, "0")}-${"x".repeat(120)}.js`); });
    const before = git(t.root, "rev-parse", "main");
    assert.throws(() => merge(t.context, u.input, t.info), (error) => /^pre-merge gate failed — "node gate\.mjs [^"]*\{changed\}" was not run: the change list \(1200 files, \d+ bytes of arguments\) is past the 131072-byte argv cap; run the suite unscoped$/.test(error.message));
    assert.equal(t.runs().length, 0, "no gate process was spawned");
    assert.equal(git(t.root, "rev-parse", "main"), before);
    assert.deepEqual(t.gateEvents(), []);
  } finally { cleanup(t); }
});

test("merge: a branch that adds -x.js lands with the gate receiving ./-x.js, never a bare -x.js an option parser would read", () => {
  const t = fixture("{changed}");
  try {
    const u = unit(t, (wt) => { write(wt, "-x.js"); });
    const r = merge(t.context, u.input, t.info);
    assert.equal(r.merged, true);
    const runs = t.runs();
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].argv, ["./-x.js"]);
    assert.deepEqual(t.gateEvents(), []);
  } finally { cleanup(t); }
});
