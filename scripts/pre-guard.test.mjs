import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { worktreeBindingPath } from "./lib/core.mjs";
import { forceBlocked } from "./lib/force-block.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCOPE = path.join(ROOT, "scope.mjs");
const GUARD = path.join(ROOT, "pre-guard.mjs");
const DOC_WRITE = path.join(ROOT, "doc-write.mjs");

function run(script, dir, input, extraEnv = {}) {
  // A git root: a non-git CLAUDE_PROJECT_DIR is "above a repo" and leaves craftsman off.
  if (!fs.existsSync(path.join(dir, ".git"))) spawnSync("git", ["init", "-q"], { cwd: dir });
  return spawnSync(process.execPath, [script], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...extraEnv },
  });
}

// doc-write.mjs grants only after a doc-writing command ran in the session (ARCH-SAFETY-05), so record one first.
function grant(dir, extraEnv = {}) {
  const env = { CLAUDE_CODE_SESSION_ID: "grant-session", ...extraEnv };
  run(path.join(ROOT, "orchestrate-scope-guard.mjs"), dir, { session_id: env.CLAUDE_CODE_SESSION_ID, prompt: "/craftsman:plan x" }, env);
  run(GUARD, dir, { session_id: env.CLAUDE_CODE_SESSION_ID, tool_name: "Bash", tool_input: { command: `node ${DOC_WRITE} on` } }, env);
  return run(DOC_WRITE, dir, {}, env);
}

// The guard only analyses a destructive-looking command, never runs it, but `~` and
// `$HOME` resolve against os.homedir(). Pin HOME and USERPROFILE to a throwaway dir
// that holds the fixture so the verdict never depends on where TMPDIR sits relative
// to the real home, and so a misfiring guard has nothing real to point at.
const REAL_HOME = os.homedir();
function homePinned(base = os.tmpdir()) {
  const home = fs.mkdtempSync(path.join(base, "craftsman-home-"));
  const dir = path.join(home, "project");
  fs.mkdirSync(dir);
  const env = { HOME: home, USERPROFILE: home };
  assert.notEqual(env.HOME, REAL_HOME, "the spawned HOME must not be the real home");
  assert.notEqual(env.USERPROFILE, REAL_HOME);
  return { home, dir, env };
}

test("pre-guard: active scope allows declared reads and blocks undeclared reads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scope-"));
  try {
    const sid = "scope-test";
    const allowed = path.join(dir, "src", "needed.ts");
    const forbidden = path.join(dir, "src", "unlisted.ts");
    fs.mkdirSync(path.dirname(allowed), { recursive: true });
    fs.writeFileSync(allowed, "export {}\n");
    const manifest = {
      session_id: sid,
      plan: "docs/plans/example.md",
      unit: "unit-1",
      project: ".",
      scope: { read: ["src/needed.ts"], docs: [], write: ["src/needed.ts"] },
    };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    assert.equal(run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: allowed } }).status, 0);
    const blocked = run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: forbidden } });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /re-analyse the unit dependencies/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: tracker + plan-doc reads pass as orchestration metadata even when out of declared scope", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-metadata-"));
  try {
    const sid = "metadata-test";
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    const tracker = path.join(dir, "docs", "plans", "TRACKER.md");
    const plan = path.join(dir, "docs", "plans", "example.md");
    fs.writeFileSync(tracker, "# tracker\n");
    fs.writeFileSync(plan, "# plan\n");
    const manifest = {
      session_id: sid,
      plan: "docs/plans/example.md",
      unit: "unit-1",
      project: ".",
      scope: { read: [], docs: [], write: [] },
    };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    // /orchestrate's real first action grants doc-write authority before any
    // docs/ access — the guard's doc-authority gate applies to Read too.
    assert.equal(grant(dir).status, 0);
    assert.equal(run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: tracker } }).status, 0);
    assert.equal(run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: plan } }).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: Glob/Grep pass when the search root itself is a declared '**' scope entry", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-searchroot-"));
  try {
    const sid = "searchroot-test";
    fs.mkdirSync(path.join(dir, "src", "widgets"), { recursive: true });
    const manifest = {
      session_id: sid,
      plan: "docs/plans/example.md",
      unit: "unit-1",
      project: ".",
      scope: { read: ["src/widgets/**"], docs: [], write: [] },
    };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    const allowed = run(GUARD, dir, {
      session_id: sid, tool_name: "Glob", tool_input: { path: path.join(dir, "src", "widgets"), pattern: "*.ts" },
    });
    assert.equal(allowed.status, 0);
    const blocked = run(GUARD, dir, {
      session_id: sid, tool_name: "Glob", tool_input: { path: dir, pattern: "**/*.ts" },
    });
    assert.equal(blocked.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: scope-required blocks calls before activation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-required-"));
  try {
    const sid = "required-test";
    assert.equal(run(SCOPE, dir, { action: "require", session_id: sid }).status, 0);
    const result = run(GUARD, dir, { session_id: sid, tool_name: "Glob", tool_input: { path: ".", pattern: "**/*" } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires an active unit scope/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: project boundary blocks a sibling project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-project-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    fs.mkdirSync(path.join(dir, "services", "a"), { recursive: true });
    fs.mkdirSync(path.join(dir, "services", "b"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: path.join(dir, "services", "a") });
    spawnSync("git", ["init", "-q"], { cwd: path.join(dir, "services", "b") });
    const manifestPath = path.join(dir, "craftsman.workspace.json");
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, projects: { payments: { root: "services/a" }, other: { root: "services/b" } } }));
    const sid = "project-test";
    const manifest = {
      session_id: sid,
      plan: "docs/plans/example.md",
      unit: "unit-1",
      project: "services/a",
      scope: { read: ["src/file.ts"], docs: [], write: ["src/file.ts"] },
    };
    assert.equal(run(SCOPE, dir, { ...manifest, project: "payments" }, { CRAFTSMAN_WORKSPACE_MANIFEST: manifestPath }).status, 0);
    const blocked = run(GUARD, dir, {
      session_id: sid,
      tool_name: "Read",
      tool_input: { file_path: path.join(dir, "services", "b", "src", "file.ts") },
    }, { CRAFTSMAN_WORKSPACE_MANIFEST: manifestPath });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /outside active unit scope/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: blocks mutating Git in the primary checkout while a worktree is bound", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-git-guard-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const worktree = path.join(dir, ".worktrees", "unit-1");
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    spawnSync("git", ["worktree", "add", "-q", "-b", "feat/unit-1", worktree], { cwd: dir });
    const sid = "git-guard-test";
    const bindingContext = { root: dir, stateDir: path.join(dir, ".craftsman") };
    fs.mkdirSync(path.dirname(worktreeBindingPath({ session_id: sid }, bindingContext)), { recursive: true });
    fs.writeFileSync(worktreeBindingPath({ session_id: sid }, bindingContext), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: worktree, branch: "feat/unit-1",
    }));
    const blocked = run(GUARD, dir, {
      session_id: sid, tool_name: "Bash", tool_input: { command: "git checkout main" },
    });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /Git mutation blocked outside the active worktree/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: blocks restore and add mutations outside the bound worktree", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-git-guard-extra-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const worktree = path.join(dir, ".worktrees", "unit-1");
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    spawnSync("git", ["worktree", "add", "-q", "-b", "feat/unit-1", worktree], { cwd: dir });
    const sid = "git-guard-extra-test";
    const bindingContext = { root: dir, stateDir: path.join(dir, ".craftsman") };
    fs.mkdirSync(path.dirname(worktreeBindingPath({ session_id: sid }, bindingContext)), { recursive: true });
    fs.writeFileSync(worktreeBindingPath({ session_id: sid }, bindingContext), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: worktree, branch: "feat/unit-1",
    }));
    for (const command of ["git restore README.md", "git add README.md"]) {
      const blocked = run(GUARD, dir, { session_id: sid, tool_name: "Bash", tool_input: { command } });
      assert.equal(blocked.status, 2, command);
      assert.match(blocked.stderr, /Git mutation blocked outside the active worktree/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: allows mutating Git inside the bound worktree", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-git-guard-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const worktree = path.join(dir, ".worktrees", "unit-1");
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    spawnSync("git", ["worktree", "add", "-q", "-b", "feat/unit-1", worktree], { cwd: dir });
    const sid = "git-guard-worktree-test";
    const bindingContext = { root: worktree, stateDir: path.join(dir, ".craftsman") };
    fs.mkdirSync(path.dirname(worktreeBindingPath({ session_id: sid }, bindingContext)), { recursive: true });
    fs.writeFileSync(worktreeBindingPath({ session_id: sid }, bindingContext), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: worktree, branch: "feat/unit-1",
    }));
    const allowed = run(GUARD, worktree, {
      session_id: sid, tool_name: "Bash", tool_input: { command: "git commit --allow-empty -m test" },
    });
    assert.equal(allowed.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: blocks Git mutations that target another directory explicitly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-git-target-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const worktree = path.join(dir, ".worktrees", "unit-1");
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    spawnSync("git", ["worktree", "add", "-q", "-b", "feat/unit-1", worktree], { cwd: dir });
    const sid = "git-target-test";
    const bindingContext = { root: worktree, stateDir: path.join(dir, ".craftsman") };
    fs.mkdirSync(path.dirname(worktreeBindingPath({ session_id: sid }, bindingContext)), { recursive: true });
    fs.writeFileSync(worktreeBindingPath({ session_id: sid }, bindingContext), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: worktree, branch: "feat/unit-1",
    }));
    const blocked = run(GUARD, worktree, {
      session_id: sid, tool_name: "Bash", tool_input: { command: `\n  git -C "${dir}" checkout main` },
    });
    assert.equal(blocked.status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: blocks a symlinked scope target outside the project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-symlink-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-outside-"));
  try {
    const link = path.join(dir, "linked");
    fs.symlinkSync(outside, link, "dir");
    const sid = "symlink-test";
    assert.equal(run(SCOPE, dir, {
      session_id: sid, plan: "docs/plans/example.md", unit: "unit-1", project: ".",
      scope: { read: ["linked/**"], docs: [], write: [] },
    }).status, 0);
    const blocked = run(GUARD, dir, {
      session_id: sid, tool_name: "Read", tool_input: { file_path: path.join(link, "secret.txt") },
    });
    assert.equal(blocked.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

function gitRepoWithWorktree() {
  const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-tracker-guard-")));
  const git = (...args) => spawnSync("git", ["-C", main, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { encoding: "utf8" });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "init");
  const worktree = path.join(main, ".claude", "worktrees", "wt");
  git("worktree", "add", "-q", "-b", "wt", worktree);
  const block = "<!-- craftsman:ledger:begin -->\n| plan | status |\n| a | PENDING |\n<!-- craftsman:ledger:end -->";
  const text = `# Execution tracker\n\nHand notes.\n\n${block}\n`;
  for (const root of [main, worktree]) {
    fs.mkdirSync(path.join(root, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "plans", "TRACKER.md"), text);
  }
  return { main, worktree, text };
}

// Merge of main: scope.mjs keeps the scope manifests, command records and grants of a session in the MAIN checkout's .craftsman
// (state is shared through the git common dir), but the guard judged every path relative to the session's own root, so from a linked
// worktree the real state files looked like `../../../.craftsman/...` and matched nothing protected (ARCH-SAFETY-05).
test("pre-guard: a linked worktree session cannot write the main checkout's session state (scope, commands, grants)", () => {
  const { main, worktree } = gitRepoWithWorktree();
  try {
    for (const rel of ["sessions/s1/scope.json", "sessions/s1/scope-required", "sessions/s1/commands.json", "sessions/s1/doc-write", "sessions/s1/goal-tokens.json", "off", "doc-write-pending"]) {
      for (const tool of ["Write", "Edit"]) {
        const input = tool === "Write" ? { file_path: path.join(main, ".craftsman", rel), content: "{}" } : { file_path: path.join(main, ".craftsman", rel), old_string: "a", new_string: "b" };
        const r = run(GUARD, worktree, { session_id: "wt-state", tool_name: tool, tool_input: input });
        assert.equal(r.status, 2, `${tool} ${rel}: ${r.stderr}`);
      }
    }
    // a Bash redirect reaches the same files by a relative path from the worktree (.claude/worktrees/wt -> main)
    for (const command of ["printf x > ../../../.craftsman/sessions/s2/scope.json", "touch ../../../.craftsman/off", "echo '{}' | tee ../../../.craftsman/sessions/s2/commands.json"]) {
      const r = run(GUARD, worktree, { session_id: "wt-state", tool_name: "Bash", tool_input: { command } });
      assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    }
    // removing it is the same bypass (no scope-required flag, no scope)
    for (const command of ["rm ../../../.craftsman/sessions/s2/scope-required", "rm -rf ../../../.craftsman", "mv ../../../.craftsman/sessions/s2 /tmp/gone"]) {
      const r = run(GUARD, worktree, { session_id: "wt-state", tool_name: "Bash", tool_input: { command } });
      assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    }
    // the worktree's own state stays protected, and an ordinary file in the main checkout is not made protected by this
    assert.equal(run(GUARD, worktree, { session_id: "wt-state", tool_name: "Write", tool_input: { file_path: path.join(worktree, ".craftsman", "sessions", "s1", "scope.json"), content: "{}" } }).status, 2);
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
  }
});

test("pre-guard: a sibling worktree outside the main checkout is held the same, its ordinary files are not, and so is its own git config", () => {
  const { main } = gitRepoWithWorktree();
  const sibling = path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-sibling-"))), "sib");
  try {
    spawnSync("git", ["-C", main, "worktree", "add", "-q", "-b", "sib", sibling], { encoding: "utf8" });
    const ask = (tool_name, tool_input) => run(GUARD, sibling, { session_id: "sib-state", tool_name, tool_input });
    for (const rel of ["sessions/s1/scope.json", "sessions/s1/commands.json", "off"]) {
      assert.equal(ask("Write", { file_path: path.join(main, ".craftsman", rel), content: "{}" }).status, 2, `Write ${rel}`);
    }
    for (const command of [`cd ${main}/.craftsman && printf x > off`, `printf x > ${main}/.craftsman/sessions/s2/scope.json`, `rm -rf ${main}/.craftsman`]) {
      assert.equal(ask("Bash", { command }).status, 2, command);
    }
    // the worktree's own config in the main .git decides which hooks run for it
    const own = path.join(main, ".git", "worktrees", "sib", "config.worktree");
    assert.equal(ask("Write", { file_path: own, content: "[core]\n\thooksPath = /x\n" }).status, 2, "Write config.worktree");
    assert.equal(ask("Bash", { command: `printf x > ${own}` }).status, 2, "redirect config.worktree");
    // an ordinary file in the main checkout, and a build directory, are not made protected
    assert.equal(ask("Write", { file_path: path.join(main, "src", "a.js"), content: "x" }).status, 0, "Write src/a.js");
    assert.equal(ask("Bash", { command: "rm -rf build" }).status, 0, "rm -rf build");
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
    fs.rmSync(path.dirname(sibling), { recursive: true, force: true });
  }
});

test("pre-guard: a linked worktree's copy of TRACKER.md is blocked and points at the main checkout's", () => {
  const { main, worktree } = gitRepoWithWorktree();
  try {
    const result = run(GUARD, worktree, {
      session_id: "tracker-wt", tool_name: "Edit",
      tool_input: { file_path: path.join(worktree, "docs", "plans", "TRACKER.md"), old_string: "Hand notes.", new_string: "x" },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /tracker lives only in the main checkout/);
    assert.ok(result.stderr.includes(path.join(main, "docs", "plans", "TRACKER.md")));
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
  }
});

test("pre-guard: the root TRACKER.md's generated block can't be hand-edited; the hand-written rest can", () => {
  const { main, text } = gitRepoWithWorktree();
  try {
    const file = path.join(main, "docs", "plans", "TRACKER.md");
    assert.equal(grant(main).status, 0);
    const blocked = run(GUARD, main, {
      session_id: "tracker-root", tool_name: "Edit",
      tool_input: { file_path: file, old_string: "| a | PENDING |", new_string: "| a | COMPLETE |" },
    });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /generated ledger block/);
    const overwrite = run(GUARD, main, {
      session_id: "tracker-root", tool_name: "Write", tool_input: { file_path: file, content: "# Execution tracker\n" },
    });
    assert.equal(overwrite.status, 2, "a Write that drops the block changes it too");
    const allowed = run(GUARD, main, {
      session_id: "tracker-root", tool_name: "Edit",
      tool_input: { file_path: file, old_string: "Hand notes.", new_string: "Better hand notes." },
    });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(fs.readFileSync(file, "utf8"), text, "the guard only decides; it never writes");
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
  }
});

test("pre-guard: a rollup docs/plans/<slug>/TRACKER.md fence can't be hand-edited; the generator and the rest are allowed", async () => {
  const { main } = gitRepoWithWorktree();
  try {
    const { writeRollups } = await import("./lib/tracker-rollup.mjs");
    const { buildIndex } = await import("./lib/plan-index.mjs");
    const index = buildIndex([{ slug: "e", text: "---\nslug: e\nlevel: epic\n---\n" }]);
    assert.equal(writeRollups(main, index, []).length, 1, "the generator writes it (no tool hook involved)");
    const file = path.join(main, "docs", "plans", "e", "TRACKER.md");
    fs.appendFileSync(file, "\nHand notes.\n");
    assert.equal(grant(main).status, 0);
    const blocked = run(GUARD, main, {
      session_id: "rollup", tool_name: "Edit",
      tool_input: { file_path: file, old_string: "Status: PENDING", new_string: "Status: COMPLETE" },
    });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /rollup/);
    assert.equal(run(GUARD, main, { session_id: "rollup", tool_name: "Write", tool_input: { file_path: file, content: "x\n" } }).status, 2);
    const allowed = run(GUARD, main, {
      session_id: "rollup", tool_name: "Edit",
      tool_input: { file_path: file, old_string: "Hand notes.", new_string: "Better." },
    });
    assert.equal(allowed.status, 0, allowed.stderr);
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
  }
});

// ARCH-LAND-05: destructive git is blocked only while /auto's marker exists.
const DESTRUCTIVE = [
  "git push --force origin feat/x",
  "git push -f origin main",
  "git push -uf origin main",
  "git push --force-with-lease origin main",
  "git push --force-with-lease=main:abc123 origin main",
  "git push origin +main",
  "git push origin +HEAD:main",
  "git fetch origin && git reset --hard origin/main",
  "git -C /tmp/repo reset --hard",
  "git worktree remove --force .worktrees/u1",
  "git worktree remove -f .worktrees/u1",
  // Wrapped forms (S1): a nested shell, a subshell, $( ), backticks, an alias.
  "bash -c 'git push -f origin main'",
  "sh -c \"git reset --hard origin/main\"",
  "(git push --force origin main)",
  "echo $(git reset --hard)",
  "echo `git push -f origin main`",
  "git commit -m \"$(git push -f origin main)\"", // the R3 message skip must not hide a substitution
  "git -c alias.p='push --force' p origin main",
  "git -c alias.r=\"!git reset --hard\" r",
  // An alias of the bare subcommand, the flags at the call site (R2-W2).
  "git -c alias.p=push p --force origin main",
  "git -c alias.p=push p -f o m",
  "git -c alias.p=reset p --hard",
  "git -c alias.p=push p o +HEAD:main",
  // Any interpreter's quoted script, a lone &, a quoted -C path, alias chains (R3).
  "python3 -c \"import subprocess; subprocess.run('git push -f', shell=True)\"",
  "git log -1 & bash --norc -c 'git push -f origin main'",
  "git status & git push --force origin main",
  "git -C \"/a b\" push --force origin main",
  "git -c alias.p=reset -c alias.q=p q --hard",
  "git config alias.p \"push --force\"",
  // An interpreter inside a message's $( ), a separator in a quoted -C path (R4).
  "git commit -m \"$(bash -c 'git push -f origin main')\"",
  "git commit -m \"$(sh -c 'git reset --hard')\"",
  "git tag -am \"$(bash -c 'git push -f')\" v1",
  "git -C \"/a;b\" push --force origin main",
  "git -C \"/a&b\" reset --hard",
  // An escaped quote or # comment after a message flag (R5).
  "git commit -m \"a\\\" -m \" ; git push -f origin main ; echo \"b\"",
  "git commit -m \"a\\\" -m \" && git reset --hard && echo \"b\"",
  "git tag -m \"a\\\" -m \"\ngit push --force\necho \"b\" v1",
  "echo #git commit -m \"\ngit push -f origin main\n#\"",
  "true #git commit -m \"\ngit reset --hard\n#\"",
  // Escaped quotes with no separator, brace expansion — bash's own words (R6).
  "git --namespace=\\\"x reset --hard #\\\"",
  "git --namespace=\\\"x push -f origin main #\\\"",
  "git push --receive-pack=\\\"x -f origin main --receive-pack=x\\\"",
  "git -c a.b=\\\"x worktree remove --force ../w #\\\"",
  "git push {-f,origin} main",
  // Redirections, a second git word, option prefixes, git-<sub>, $'\u'/$"", braces (R7).
  "git push -f>/dev/null origin main",
  "git reset --hard>/dev/null",
  "git reset --hard</dev/null",
  "git worktree remove --force>/dev/null ../w",
  "git push origin main -f2>/dev/null",
  "exec -a git git reset --hard",
  "git reset --har",
  "git push --force-with o HEAD:main",
  "git worktree remove --forc ../wt",
  "/usr/lib/git-core/git-push -f o HEAD:main",
  "git reset $'\\u002d\\u002dhard'",
  "git reset $\"--hard\"",
  "git reset {--hard,--hard}{,}",
  "git reset {{--hard,--hard},--hard}",
  "git reset --har{d..d}",
  "git --attr-source HEAD push -f origin main",
  // &> redirects, substitutions after a message, --mirror, a brace payload that crashed the guard (R8).
  "git push &>/dev/null -f origin main",
  "git reset &>/dev/null --hard",
  "git reset &>>log --hard",
  "git worktree remove &>/dev/null --force ../w",
  "git commit --allow-empty -m x $(bash -cm 'git push -f origin main')",
  "git commit --allow-empty -m x `bash -cm 'git reset --hard'`",
  "git tag -m x v1 $(sh -cm 'git reset --hard')",
  "git push --mirror origin",
  "git push --mirr origin",
  `echo ${'{"a,b"}'.repeat(6000)}; git push -f origin main`,
  // Blocked by design: a separator then a destructive phrase in a message (14.1).
  "git commit -m \"fix; git push -f is banned\"",
];
const ALLOWED = ["git push origin HEAD:main", "git push -u origin feat/x", "git reset --soft HEAD~1", "git worktree remove .worktrees/u1", "git status",
  "git commit -m \"note: git reset --hard is banned\"", "git commit -m 'dont git push -f'", "git tag -m \"git push -f is banned\" v1"];
const bash = (sid, command) => ({ session_id: sid, tool_name: "Bash", tool_input: { command } });

test("pre-guard: while /auto is active, force pushes, hard resets and forced worktree removal are blocked", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-force-")));
  try {
    const sid = "auto-run";
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", sid), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "sessions", sid, "auto-active"), JSON.stringify({ plan: "p", at: new Date().toISOString() }));
    for (const command of DESTRUCTIVE) {
      const r = run(GUARD, dir, bash(sid, command));
      assert.equal(r.status, 2, command);
      assert.match(r.stderr, /BLOCKED while \/auto is active \(ARCH-LAND-05\)/, command);
    }
    for (const command of ALLOWED) assert.equal(run(GUARD, dir, bash(sid, command)).status, 0, command);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: a check that throws, stalls or exhausts its heap blocks inside the deadline (fail closed)", async () => {
  const unreadable = "a command the force block cannot read";
  assert.equal(await forceBlocked("git status", { source: "throw new RangeError('stack')" }), unreadable);
  assert.equal(await forceBlocked("git status"), null);
  assert.equal(await forceBlocked("git push -f origin main"), "git push --force");
  // In a child process under --input-type=module (a flag a worker must not
  // inherit): the real worker still answers, a stalled check blocks only once
  // its deadline passes, and an exhausted heap blocks — exit 2, as pre-guard.
  const module = JSON.stringify(path.join(ROOT, "lib", "force-block.mjs"));
  const child = (body) => spawnSync(process.execPath, ["--input-type=module", "-e", `const { forceBlocked } = await import(${module}); ${body}`], { encoding: "utf8", timeout: 8000 });
  assert.equal(child(`process.exit((await forceBlocked("git status")) === null ? 0 : 1);`).status, 0);
  const stall = child(`const t = Date.now(); const v = await forceBlocked("git status", { source: "for (;;) {}", deadlineMs: 2000 }); process.exit(v && Date.now() - t >= 2000 ? 2 : 1);`);
  assert.equal(stall.status, 2);
  const heap = child(`process.exit((await forceBlocked("git status", { source: "const a = []; for (;;) a.push(new Array(1e5).fill(Math.random()));" })) ? 2 : 1);`);
  assert.equal(heap.status, 2);
});

test("pre-guard: payloads that stalled or crashed the force block exit 2 inside the hook timeout (R9)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-bounded-")));
  try {
    const sid = "auto-run";
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", sid), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "sessions", sid, "auto-active"), JSON.stringify({ plan: "p", at: new Date().toISOString() }));
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const payloads = [
      `git ${"-a ".repeat(40)}x; git push -f origin main`,
      `${"git ".repeat(20000)}push -f`,
      `echo ${"{".repeat(26000)}a,b${"}".repeat(26000)}; git push -f origin main`,
      `echo ${"{".repeat(32000)}a,b${"}".repeat(32000)}; git push -f origin main`,
      // Under the size cap, so the worker reads them.
      `${"git ".repeat(3900)}push -f`,
      `echo ${"{".repeat(7000)}a,b${"}".repeat(7000)}; git push -f origin main`,
    ];
    const guard = (command) => spawnSync(process.execPath, [GUARD], { cwd: dir, input: JSON.stringify(bash(sid, command)), encoding: "utf8", timeout: 10000, env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    for (const command of payloads) {
      const r = guard(command);
      assert.equal(r.status, 2, command.slice(0, 60));
      // Which mechanism blocked: the size cap above 16 KB.
      if (command.length > 16384) assert.match(r.stderr, /a command over 16384 bytes/, command.slice(0, 60));
    }
    assert.match(guard(payloads[0]).stderr, /git push --force is BLOCKED/);
    // No destructive form at all: only the word budget can block it.
    const benign = guard("a git ".repeat(2000));
    assert.equal(benign.status, 2);
    assert.match(benign.stderr, /a command the force block cannot read/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: the verify-bypass check is linear in a run of options", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-verify-linear-")));
  try {
    const started = Date.now();
    assert.equal(run(GUARD, dir, bash("plain", `git ${"-a ".repeat(40)}x --no-verify commit`)).status, 0);
    assert.ok(Date.now() - started < 3000);
    assert.equal(run(GUARD, dir, bash("plain", "git -C dir commit --no-verify")).status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: the verify-bypass check stays inside the hook timeout across many git words (R10)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-verify-many-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const guard = (command) => spawnSync(process.execPath, [GUARD], { cwd: dir, input: JSON.stringify(bash("plain", command)), encoding: "utf8", timeout: 10000, env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    assert.equal(guard(`${"git -a ".repeat(45000)}x; git commit --no-verify -m y`).status, 2);
    const started = Date.now();
    assert.equal(guard(`${"git -a ".repeat(45000)}x; git commit -m y`).status, 0);
    assert.ok(Date.now() - started < 3000);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: the force block lapses once the /auto run is over (ARCH-LAND-05)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-lapsed-")));
  const marker = (sid, body) => {
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", sid), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "sessions", sid, "auto-active"), body);
  };
  try {
    fs.mkdirSync(path.join(dir, ".craftsman", "tracker"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "tracker", "events.jsonl"),
      JSON.stringify({ key: ".::docs/plans/done.md::u1", plan: "docs/plans/done.md", unit: "u1", status: "PENDING" }) + "\n" +
      JSON.stringify({ key: ".::docs/plans/done.md::u1", plan: "docs/plans/done.md", unit: "u1", status: "MERGED", evidence: "x" }) + "\n");
    marker("finished", JSON.stringify({ plan: "done", at: new Date().toISOString() }));
    marker("aged", JSON.stringify({ plan: "p", at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }));
    marker("legacy", "2026-10-09T00:00:00.000Z\n");
    for (const sid of ["finished", "aged", "legacy"]) {
      assert.equal(run(GUARD, dir, bash(sid, "git push --force origin main")).status, 0, sid);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: the force block holds through Phase C while rows are PARKED or BLOCKED (ARCH-LAND-05)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-phase-c-")));
  try {
    fs.mkdirSync(path.join(dir, ".craftsman", "tracker"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "tracker", "events.jsonl"), ["PARKED", "BLOCKED"].flatMap((status, i) =>
      ["PENDING", status].map((s) => JSON.stringify({ key: `.::docs/plans/parked.md::u${i}`, plan: "docs/plans/parked.md", unit: `u${i}`, status: s }))).join("\n") + "\n");
    for (const [sid, plan] of [["phase-c", "parked"], ["no-rows", "fresh"]]) {
      fs.mkdirSync(path.join(dir, ".craftsman", "sessions", sid), { recursive: true });
      fs.writeFileSync(path.join(dir, ".craftsman", "sessions", sid, "auto-active"), JSON.stringify({ plan, at: new Date().toISOString() }));
      assert.equal(run(GUARD, dir, bash(sid, "git push --force origin main")).status, 2, sid);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: without /auto the destructive git forms are unchanged (not blocked here)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-no-auto-")));
  try {
    for (const command of [...DESTRUCTIVE, ...ALLOWED]) assert.equal(run(GUARD, dir, bash("plain", command)).status, 0, command);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: rm / git rm of a guarded doc is blocked without the grant, chained too, and allowed with it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-rm-"));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "old.md"), "# old\n");
    const bash = (command) => run(GUARD, dir, { session_id: "rm-test", tool_name: "Bash", tool_input: { command } });
    assert.equal(bash("git rm docs/plans/old.md").status, 2);
    assert.equal(bash("rm -f docs/plans/old.md").status, 2);
    assert.equal(bash("echo hi && git rm -q docs/plans/old.md").status, 2);
    assert.equal(bash("ls; rm docs/plans/old.md | cat").status, 2);
    assert.equal(bash("rm src/other.txt && ls docs").status, 0, "non-doc removal is untouched");
    assert.equal(grant(dir).status, 0);
    assert.equal(bash("git rm docs/plans/old.md").status, 0);
    assert.equal(bash("echo hi && rm docs/plans/old.md").status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const RM_FORMS = [
  // 9.1 ancestors of a guarded path
  "rm -rf docs", "rm -rf ./docs/", "git rm -r docs", "rm -rf .", "rm -rf ./", "git rm -r .",
  // 9.2 resolution and wrappers
  "git -C docs rm plans/x.md", "cd docs/plans && rm x.md", "/bin/rm docs/plans/x.md", "command rm docs/plans/x.md",
  "\\rm docs/plans/x.md", "env rm docs/plans/x.md", "env FOO=1 rm docs/plans/x.md", "sudo -u x rm docs/plans/x.md",
  "find docs/plans -name x.md | xargs rm", "find docs/plans -name x.md -delete", "find docs -name x.md -exec rm {} +",
  "unlink docs/plans/x.md", "bash -c 'rm docs/plans/x.md'", "sh -c \"cd docs && rm -r plans\"",
  "git mv docs/plans/x.md elsewhere.md", "mv docs/plans/x.md /tmp/y.md", "git -C docs mv plans/x.md ../y.md",
  "echo \"unclosed && rm docs/plans/x.md",
];

test("pre-guard: every rm form that removes or moves a guarded doc (or its ancestor) is blocked without the grant and allowed with it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-rmforms-"));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    const bash = (command) => run(GUARD, dir, { session_id: "rm-forms", tool_name: "Bash", tool_input: { command } });
    for (const command of RM_FORMS) assert.equal(bash(command).status, 2, `blocked: ${command}`);
    for (const command of ["rm -rf build", "rm src/x.md", "unlink build/x", "/bin/rm build/x", "sudo -u x rm build/x",
      "find build -name x -delete", "find docs/plans -name x.md | xargs echo", "echo hi | xargs rm", "git -C src rm x.md",
      "cd src && rm x.md", "bash -c 'rm build/x'", "mv a.txt b.txt", "git mv a.txt b.txt", "ls docs && rm -rf build"]) {
      assert.equal(bash(command).status, 0, `unrelated stays allowed: ${command}`);
    }
    assert.equal(grant(dir).status, 0);
    for (const command of RM_FORMS) assert.equal(bash(command).status, 0, `granted: ${command}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: shell keywords, more wrappers and unseen-argument removals fail closed (12.1, 12.2)", () => {
  const { home, dir, env } = homePinned();
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    const bash = (command) => run(GUARD, dir, { session_id: "bypass-forms", tool_name: "Bash", tool_input: { command } }, env);
    const forms = [
      "if true; then rm docs/plans/x.md; fi", "! rm docs/plans/x.md", "for x in a; do rm docs/plans/x.md; done",
      "nice rm docs/plans/x.md", "nice -n 5 rm docs/plans/x.md", "timeout 5 rm docs/plans/x.md", "timeout -s KILL 5 rm docs/plans/x.md",
      "busybox rm docs/plans/x.md", "stdbuf -oL rm docs/plans/x.md", "ionice -c 3 rm docs/plans/x.md", "find -name x.md -delete",
      "git ls-files | xargs rm", "xargs rm < list", "xargs -a list rm", "git ls-files | xargs unlink", "rm -rf ~", "rm -rf \"$PWD/docs\"", "rm -rf $HOME/x",
      "rm -rf $(git rev-parse --show-toplevel)/docs", "rm -rf `pwd`/docs", "rm -rf \"$(pwd)/docs\"",
      "for f in docs/plans/*.md; do rm \"$f\"; done",
    ];
    for (const command of forms) assert.equal(bash(command).status, 2, `blocked: ${command}`);
    for (const command of ["echo a | xargs echo", "echo a | xargs rm", "nice ls docs", "timeout 5 ls", "find -name x -print",
      "if true; then ls; fi"]) {
      assert.equal(bash(command).status, 0, `stays allowed: ${command}`);
    }
    assert.equal(grant(dir, env).status, 0);
    for (const command of forms) assert.equal(bash(command).status, 0, `granted: ${command}`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("pre-guard: rm ~ and $HOME verdicts hold with the fixture outside and inside the real home (2.1)", (t) => {
  const bases = [os.tmpdir()];
  try { fs.accessSync(REAL_HOME, fs.constants.W_OK); bases.push(REAL_HOME); } catch { t.diagnostic("real home not writable: inside-home case skipped"); }
  for (const base of bases) {
    const { home, dir, env } = homePinned(base);
    try {
      assert.equal(env.HOME, home);
      fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
      fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
      for (const command of ["rm -rf ~", "rm -rf $HOME/x", "rm -rf \"$PWD/docs\""]) {
        const r = run(GUARD, dir, { session_id: "home-pin", tool_name: "Bash", tool_input: { command } }, env);
        assert.equal(r.status, 2, `blocked with base ${base}: ${command}`);
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
});

test("pre-guard: a glob in the last path segment is matched against the guarded bases (11.1)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-glob-"));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    const bash = (command) => run(GUARD, dir, { session_id: "glob-forms", tool_name: "Bash", tool_input: { command } });
    const allowedForms = ["rm -f *.log", "rm -f ./*.tgz", "unlink *.pid", "mv *.log logs/",
      "find . -name '*.log' -delete", "find . -type f -name '*.o' -exec rm {} +"];
    const blockedForms = ["rm -rf d*", "rm -rf docs/*", "rm docs/plans/*.md", "find . -delete", "find . -path './docs/*' -delete",
      "find . -name 'x.md' -delete", "find . -name '*.md' -exec rm {} +", "find . ! -name '*.log' -delete"];
    for (const command of allowedForms) assert.equal(bash(command).status, 0, `allowed: ${command}`);
    for (const command of blockedForms) assert.equal(bash(command).status, 2, `blocked: ${command}`);
    assert.equal(grant(dir).status, 0);
    // The doc grant covers the docs. A find that would also delete craftsman's own state (the grant and command records now
    // under .craftsman) is a different guard's business and stays refused (ARCH-SAFETY-05).
    const alsoWipesState = new Set(["find . -delete", "find . ! -name '*.log' -delete"]);
    for (const command of [...allowedForms, ...blockedForms]) assert.equal(bash(command).status, alsoWipesState.has(command) ? 2 : 0, `granted: ${command}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: heredoc bodies are not parsed as shell, the command after the terminator still is (11.2)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-heredoc-"));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    const bash = (command) => run(GUARD, dir, { session_id: "heredoc-forms", tool_name: "Bash", tool_input: { command } });
    const body = "fix: don't rm docs/plans/x.md";
    for (const command of [
      `git commit -F - <<'EOF'\n${body}\nEOF`,
      `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`,
      `cat > s.sh <<'EOF'\nrm docs/plans/x.md\nEOF`,
    ]) assert.equal(bash(command).status, 0, command);
    assert.equal(bash(`cat <<'EOF'\nhello\nEOF\nrm docs/plans/x.md`).status, 2, "rm after the terminator");
    assert.equal(bash("cat <<EOF\n$(rm docs/plans/x.md)\nEOF").status, 2, "unquoted $() body");
    assert.equal(bash("cat <<EOF\n`rm docs/plans/x.md`\nEOF").status, 2, "unquoted backtick body");
    assert.equal(bash("cat <<'EOF'\n$(rm docs/plans/x.md)\nEOF").status, 0, "quoted body is literal");
    assert.equal(bash("cat <<EOF\nit's fine, no subst\nEOF").status, 0, "unquoted plain body");
    assert.equal(bash(`echo '<<EOF'\nrm docs/plans/x.md\nEOF`).status, 2, "quoted << is no heredoc");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function grantedPair(prefix, sid, setup, blocked, allowedForms = [], stateWipers = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs", "other"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    setup?.(dir);
    const bash = (command) => run(GUARD, dir, { session_id: sid, tool_name: "Bash", tool_input: { command } });
    for (const c of blocked) assert.equal(bash(c).status, 2, `blocked: ${c}`);
    for (const c of allowedForms) assert.equal(bash(c).status, 0, `allowed: ${c}`);
    assert.equal(grant(dir).status, 0);
    // `stateWipers` also delete craftsman's own state (the grant and records under .craftsman): the doc grant does not cover that.
    for (const c of [...blocked, ...allowedForms]) assert.equal(bash(c).status, stateWipers.includes(c) ? 2 : 0, `granted: ${c}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("pre-guard: <<< , arithmetic << and commented << are not heredocs (14.1)", () => {
  grantedPair("craftsman-here14-", "here14", null, [
    "cat <<< hi\nrm docs/plans/x.md", "echo $((1<<2))\nrm docs/plans/x.md", "# see <<EOF\nrm docs/plans/x.md",
  ]);
});

test("pre-guard: find is passed over only for the single safe form (14.2)", () => {
  grantedPair("craftsman-find14-", "find14", null, [
    'find . -name "*.log" -o -type f -delete', 'find . -name "*.log" -or -type f -delete', "find . -delete -name nothing",
    "find . -type f -exec rm {} + -name zz", "find .. -name x.md -delete",
  ], ["find . -name '*.log' -delete", "find . -type f -name '*.o' -exec rm {} +"], [
    'find . -name "*.log" -o -type f -delete', 'find . -name "*.log" -or -type f -delete', "find . -delete -name nothing", "find . -type f -exec rm {} + -name zz",
  ]);
});

test("pre-guard: git pathspec globs cross / and docPaths without ** use real entries (14.3)", () => {
  grantedPair("craftsman-git14-", "git14", null, ['git rm "*.md"', 'git rm -r "*.md"']);
  grantedPair("craftsman-doc14-", "doc14", (dir) => {
    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ docWriteGuard: { docPaths: ["docs/plans/*.md"] } }));
  }, ["rm docs/plans/*", "rm -f docs/plans/*.m?"], ["rm docs/other/*"]);
});

test("pre-guard: assigned values and if/while/until/time/mv-in-loop fail closed (15.1, 15.2)", () => {
  grantedPair("craftsman-vars15-", "vars15", null, [
    'f=docs/plans/x.md; rm "$f"', "export D=docs; rm -rf $D",
    "if rm docs/plans/x.md; then :; fi", "while rm docs/plans/x.md; do :; done", "time rm docs/plans/x.md",
    'for f in docs/plans/*.md; do mv "$f" /x; done',
  ]);
});

test("pre-guard: arithmetic in quotes, $[ ] and comment apostrophes do not hide a removal (17.1)", () => {
  grantedPair("craftsman-quote17-", "quote17", null, [
    'echo "$((1<<2))"\nrm docs/plans/x.md', 'x="$(( 4 << 1 ))"\nrm -rf docs/plans', "echo $[1<<2]\nrm docs/plans/x.md",
    "# don't\nrm -rf docs", "ls # it's\ngit rm -rq .",
  ]);
});

test("pre-guard: git pathspec magic is decoded (17.2)", () => {
  grantedPair("craftsman-magic17-", "magic17", null, [
    "git rm -r :/docs", "git rm -r ':(top)docs'", "git rm -r ':(icase)DOCS/PLANS'",
  ], ["git rm src/x.md"]);
});

test("pre-guard: exclude and icase pathspec magic fail closed (20.1)", () => {
  grantedPair("craftsman-magic20-", "magic20", null, [
    "git rm -r ':!src'", "git rm -r ':^src'", "git rm -r ':(exclude)src'", "git rm -r ':(icase)D*'", "git rm -r ':(icase)DOCS/P*'",
  ], ["git rm src/x.md"]);
});

test("pre-guard: find -exec rm checks its literal words (17.3)", () => {
  grantedPair("craftsman-exec17-", "exec17", null, [
    "find . -name '*.log' -exec rm -rf docs \\;", "find . -name '*.log' -exec rm {} docs/plans/x.md +",
  ], ["find . -name '*.log' -exec rm {} +"]);
});

test("pre-guard: find -exec strips wrappers and covers mv (20.2)", () => {
  grantedPair("craftsman-exec20-", "exec20", null, [
    "find . -name '*.log' -exec env rm -rf docs \\;", "find . -name '*.log' -exec mv docs /x \\;",
  ], ["find . -name '*.log' -exec rm {} +"]);
});

test("pre-guard: find -exec mv {} under a guarded base and icase-pathspecs fail closed (21)", () => {
  grantedPair("craftsman-find21-", "find21", null, [
    "find docs -name '*.md' -exec mv {} /x \\;", "find docs -execdir mv {} /x \\;", "find docs/plans -exec sudo mv {} /x +",
    "find docs -exec mv -t /x {} +", "find build -exec mv + docs /y \\;",
  ], ["find build -name x -exec mv {} /y \\;"]);
  grantedPair("craftsman-icase21-", "icase21", null, [
    "git --icase-pathspecs rm -r DOCS", "git --icase-pathspecs rm -r 'DOC*'", "GIT_ICASE_PATHSPECS=1 git rm -r DOCS",
  ], ["git rm src/x.md"]);
});

test("pre-guard: GIT_ICASE_PATHSPECS reaches pipelines, nested shells and exports (22.1)", () => {
  grantedPair("craftsman-icase22-", "icase22", null, [
    "echo x | GIT_ICASE_PATHSPECS=1 xargs git rm -r DOCS", "GIT_ICASE_PATHSPECS=1 sh -c 'git rm -r DOCS'",
    "export GIT_ICASE_PATHSPECS=1; git rm -r DOCS", "declare -x GIT_ICASE_PATHSPECS=1; git rm -r DOCS",
  ], ["echo x | xargs echo GIT_ICASE_PATHSPECS"]);
});

test("pre-guard: icase pathspecs compare globs in full and find -exec git rm|mv is a removal (22.2)", () => {
  grantedPair("craftsman-icase22b-", "icase22b", (dir) => {
    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ docWriteGuard: { docPaths: ["docs/plans/*.md"] } }));
  }, [
    "git --icase-pathspecs rm docs/plans/X.MD", "git rm -r ':(icase)docs/plans/X.MD'",
    "find docs -exec git rm {} +", "find docs -exec git mv {} /x \\;",
  ]);
});

test("pre-guard: find -exec git and bare icase assignments reach the git branch (23)", () => {
  grantedPair("craftsman-git23a-", "git23a", null, [
    "find build -exec git rm -r ':!src' \\;", "find build -exec git --icase-pathspecs rm -r DOCS \\;",
    "find build -exec git rm -r ':(icase)DOCS' \\;", "GIT_ICASE_PATHSPECS=1 find build -exec git rm -r DOCS \\;",
  ], ["find build -exec git rm {} +"]);
  grantedPair("craftsman-git23b-", "git23b", null, [
    "GIT_ICASE_PATHSPECS=1; export GIT_ICASE_PATHSPECS; git rm -r DOCS", "export GIT_ICASE_PATHSPECS; GIT_ICASE_PATHSPECS=1; git rm -r DOCS",
    "set -a; GIT_ICASE_PATHSPECS=1; git rm -r DOCS", "echo docs | xargs git rm -r",
    "typeset -x GIT_ICASE_PATHSPECS=1; git rm -r DOCS",
  ], []);
});

test("pre-guard: terminal allow and block events carry numeric ms", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-ms-"));
  try {
    const sid = "ms-test";
    const allowed = path.join(dir, "src", "needed.ts");
    fs.mkdirSync(path.dirname(allowed), { recursive: true });
    fs.writeFileSync(allowed, "export {}\n");
    const manifest = { session_id: sid, plan: "docs/plans/example.md", unit: "unit-1", project: ".", scope: { read: ["src/needed.ts"], docs: [], write: ["src/needed.ts"] } };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    assert.equal(run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: allowed } }).status, 0);
    assert.equal(run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: path.join(dir, "src", "other.ts") } }).status, 2);
    const events = fs.readFileSync(path.join(dir, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const pass = events.find((e) => e.ev === "preguard" && e.result === "allowed");
    const block = events.find((e) => e.ev === "scope_blocked");
    assert.ok(pass && Number.isFinite(pass.ms) && pass.ms >= 0, "allow event has ms");
    assert.ok(block && Number.isFinite(block.ms) && block.ms >= 0, "block event has ms");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: assignments reach a nested walk, env, += and arrays (18.1)", () => {
  grantedPair("craftsman-env18-", "env18", null, [
    `sh -c 'cd build && f=../docs/plans && rm -rf "$f"'`, "env D=docs sh -c 'rm -rf $D'", `env D=docs/plans/x.md bash -c 'rm "$D"'`,
    'f+=docs/plans/x.md; rm "$f"', "f=(docs); rm -rf $f",
  ]);
});

test("pre-guard: coproc, function and exec -a run the command they wrap (18.2)", () => {
  grantedPair("craftsman-coproc18-", "coproc18", null, [
    "coproc foo { rm docs/plans/x.md; }", "function f { rm docs/plans/x.md; }; f", "exec -a name rm docs/plans/x.md", "coproc rm docs/plans/x.md",
    "unlink ~user/x", 'unlink "$PWD/docs/plans/x.md"', "unlink $(pwd)/docs/plans/x.md", "mv ~user/x /tmp/y", 'mv "$PWD/docs" /tmp/y', "mv $(pwd)/docs /tmp/y",
  ]);
});

test("pre-guard: NAME=( starts an array only when ( follows the word directly (19.1)", () => {
  grantedPair("craftsman-arr19-", "arr19", null, ["f=; (rm -rf docs)", "f=\n(rm -rf docs)", "x= && (rm -rf docs/plans)", "f=(docs); rm -rf $f"]);
});

test("pre-guard: # after ) or a closing backtick is not a comment (19.2)", () => {
  grantedPair("craftsman-hash19-", "hash19", null, ["echo $(true)#; rm -rf docs", "echo `true`#; rm -rf docs", "echo $((1))#; rm -rf docs"], ["# note; rm -rf docs"]);
});

test("pre-guard: a command holding a removal word is blocked unless the parser proves it safe (24.1)", () => {
  grantedPair("craftsman-safe24a-", "safe24a", null, [
    "FOO=1 rm build/x", "rm build/x |& cat", "(rm build/x)", "{ rm build/x; }", "f() { rm build/x; }; f", "if true; then rm build/x; fi",
    "while true; do rm build/x; done", "case x in x) rm build/x;; esac", "rm \"$X\"", "rm ~user/x", "rm $(echo build/x)",
    "rm -rf \"$TMPDIR/x\"", "for f in a b; do rm \"$f\"; done", 'f=build/x; rm "$f"', "bash -c \"$CMD\"", "eval \"$X\"", 'cd "$D" && rm build/x',
    "cd && rm build/x", "echo rm | bash", "bash <<< 'rm build/x'", "echo \"unclosed; rm build/x",
    "shred docs/plans/x.md", "truncate -s 0 docs/plans/x.md", "rmdir docs/plans", "rsync -a --delete empty/ docs/plans/",
    "git clean -fdx", "echo x > docs/plans/x.md", ": > docs/plans/x.md", "echo x > \"$OUT\"; rm build/x", "cd docs/plans && echo x > y.md",
    "echo \"rm build/x\" | $SHELL", "git -c alias.zap='!rm build/x' zap",
  ], [
    "rm -f *.log", "rm -rf build", "rm ~/x", "cd src && rm x.md", "git commit -m \"chore: rm docs/plans\"", "echo \"a > b\"; rm build/x",
    "echo hi > out.txt; rm build/x", "rm build/x 2>&1 | tail -1", "rm build/x 2>/dev/null || true", "git clean -fd src",
    "find build -name x -delete", "sudo -u x rm build/x", "ls | xargs echo", "git commit -F - <<'EOF'\nrm docs/plans/x.md\nEOF",
    "git rm src/x.md; mv a.txt b.txt", "echo \"$(pwd)\"; rm build/x",
  ]);
});

test("pre-guard: the per-form denylist branches are gone, one safe-subset check remains (24.2)", () => {
  const src = fs.readFileSync(GUARD, "utf8");
  for (const gone of ["stripPrefixes", "decodeMagic", "gitRmMv", "xargsRm", "rmVar", "findNamesMiss(exprs", "icaseEnv", "state.icase"]) {
    assert.ok(!src.includes(gone), `${gone} removed from pre-guard.mjs`);
  }
  // shellSegments left the doc-removal guard with the denylist branches; the one place that reads tokens again
  // is the hook-bypass check (15.1), so it is imported once and called once, and nowhere else.
  assert.equal(src.match(/\bshellSegments\b/g).length, 2, "shellSegments: one import and one call (the hook-bypass check)");
  assert.equal(src.match(/shellSegments\(/g).length, 1);
  grantedPair("craftsman-safe24b-", "safe24b", null, [], [
    "rm -f *.log", "rm -rf build", "echo a | xargs echo", "echo hi | xargs rm", "git commit -F - <<'EOF'\nrm docs/plans/x.md and docs/architecture\nEOF",
  ]);
});

test("pre-guard: the ninth-review probes and flagged forms are blocked without the grant (24.3)", () => {
  grantedPair("craftsman-probe24-", "probe24", null, [
    "echo ':!src' | xargs git rm -r", "echo ':(icase)DOCS' | xargs git rm -r", "echo DOCS | xargs git --icase-pathspecs rm -r",
    "export GIT_ICASE_PATHSPECS; { GIT_ICASE_PATHSPECS=1; }; git rm -r DOCS",
    "if true; then export GIT_ICASE_PATHSPECS; { GIT_ICASE_PATHSPECS=1; }; git rm -r DOCS; fi",
    "for i in 1; do export GIT_ICASE_PATHSPECS; { GIT_ICASE_PATHSPECS=1; }; git rm -r DOCS; done",
    "! export GIT_ICASE_PATHSPECS; { GIT_ICASE_PATHSPECS=1; }; git rm -r DOCS",
    "find build -exec sh -c 'git rm -r docs' \\;", "find build -execdir git rm -r ../docs \\;",
    "f() { git rm -r DOCS; }; GIT_ICASE_PATHSPECS=1 f", "git --work-tree=docs rm -r plans", "GIT_WORK_TREE=docs git rm -r plans", "git --git-dir=.git rm -r docs",
  ], ["git rm src/x.md", "find build -execdir git rm {} \\;"]);
});

test("pre-guard: the removal-word gate reads de-quoted tokens and redirect targets (25.1)", () => {
  grantedPair("craftsman-gate25-", "gate25", null, [
    "r''m -rf docs", "r\\m -rf docs", '"r"m -rf docs', 'echo x > "do"cs/plans/x.md', "echo x > d\\ocs/plans/x.md",
  ], ["echo x > out.txt", "ls docs"]);
});

test("pre-guard: an argument naming a removal word to an unlisted command is unsafe (25.2)", () => {
  grantedPair("craftsman-arg25-", "arg25", null, [
    `perl -e 'unlink "docs/plans/x.md"'`, `python3 -c 'import os; os.rmdir("docs/plans")'`, `awk 'BEGIN{system("rm -rf docs")}'`,
    `node -e 'require("child_process").execSync("rm -rf docs")'`, "git config alias.zap '!rm -rf docs'",
  ], [
    'git commit -m "chore: rm docs/plans"', "git commit -am 'mv the rm helper'", "echo rm docs", "printf '%s' rm", "grep -rn rm src",
    'node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs" --evidence "rm"',
  ]);
});

test("pre-guard: dispatch examines every candidate, reads -c bodies after --, and distrusts script operands (25.3)", () => {
  grantedPair("craftsman-disp25-", "disp25", null, [
    "env -u find rm -rf docs", "env -u sh rm -rf docs", "sudo -u find rm -rf docs", "bash -c -- 'rm -rf docs'",
    "cat > s.sh <<'EOF'\nrm -rf docs\nEOF\nsh s.sh",
  ], ["sudo -u x rm build/x", "timeout 5 rm build/x", "bash -c -- 'rm build/x'"]);
});

test("pre-guard: unseen xargs input, declarations and git config overrides are unsafe (25.4)", () => {
  grantedPair("craftsman-xargs25-", "xargs25", null, [
    "echo 'a docs' | xargs rm -r", "printf 'do%s' cs | xargs rm -r", "echo -e 'd\\x6fcs' | xargs rm -r", "printf xdocs | xargs -d x rm -r",
    "export ZAP='!rm -rf docs'; git --config-env=alias.zap=ZAP zap",
    "export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.zap GIT_CONFIG_VALUE_0='!rm -rf docs'; git zap",
    "echo \"'docs'\" | xargs rm -r", "echo docs | xargs -0 rm -r",
  ], ["echo build | xargs rm -r", "export FOO; rm build/x"]);
});

test("pre-guard: targets resolve through realpath and a relative -execdir target is unsafe (25.5)", () => {
  grantedPair("craftsman-real25-", "real25", (dir) => { fs.symlinkSync("docs", path.join(dir, "d")); }, [
    "rm -rf d/plans", "rm -rf d/*", "touch docs/a.nomatch; find . -name '*.nomatch' -execdir rm -rf plans \\;",
  ], ["rm -rf build/*", "find build -name x -execdir rm -rf plans \\;"]);
});

test("pre-guard: block messages tell an unprovable command from a redirect from a matched target (25.6)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-msg25-"));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    const bash = (command) => run(GUARD, dir, { session_id: "msg25", tool_name: "Bash", tool_input: { command } });
    const unprovable = bash("rm \"$X\"");
    assert.equal(unprovable.status, 2);
    assert.match(unprovable.stderr, /cannot prove it safe/);
    const redirect = bash("echo x > docs/plans/x.md");
    assert.equal(redirect.status, 2);
    assert.match(redirect.stderr, /writes with a redirect/);
    assert.doesNotMatch(redirect.stderr, /cannot prove/);
    const matched = bash("rm -rf docs/plans");
    assert.equal(matched.status, 2);
    assert.match(matched.stderr, /removing it with rm \/ git rm/);
    assert.doesNotMatch(matched.stderr, /cannot prove|redirect/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  grantedPair("craftsman-allow25-", "allow25", null, [], [
    "grep -rn rm docs/", 'grep -n "rm" docs/plans/x.md', "cd ~/scratch/foo && rm -rf build",
  ]);
});

test("pre-guard: a heredoc delimiter is a full shell word with quote removal (26.1)", () => {
  grantedPair("craftsman-here26-", "here26", null, [
    'cat <<E"OF"\nEOF\nrm -rf docs\nEOF', "cat <<E@F\nE@F\nrm -rf docs\nE",
  ], ["git commit -F - <<'EOF'\nrm docs/plans/x.md\nEOF", 'git commit -F - <<"EOF"\nrm docs/plans/x.md\nEOF']);
});

test("pre-guard: env -C/--chdir, sudo -D/--chdir and env -S are unsafe (26.2)", () => {
  grantedPair("craftsman-env26-", "env26", null, [
    "env -C docs rm -rf plans", "env --chdir=docs rm -rf plans", "env -S 'rm -rf docs'",
    "sudo -D docs rm -rf plans", "sudo --chdir=docs rm -rf plans",
  ], ["env -u HOME rm -rf build"]);
});

test("pre-guard: a ~ or dynamic redirect target needs a removal word to fire the gate (26.3)", () => {
  grantedPair("craftsman-redir26-", "redir26", null, [
    "echo x > $D/x; rm -rf docs", "echo x > ~user/x; rm -rf build",
  ], ["npm test > ~/scratch/log.txt 2>&1", 'node --test scripts/x.test.mjs > "$TMPDIR/out" 2>&1', "echo x > $D/x"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-msg26-"));
  try {
    const r = run(GUARD, dir, { session_id: "msg26", tool_name: "Bash", tool_input: { command: "echo x > $D/x; rm -rf build" } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /redirects to a target the guard cannot resolve/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ARCH-SAFETY-02/03: a safety hook that cannot decide denies. An uncaught error used to exit 1,
// which Claude Code treats as a non-blocking failure, so the guard was silently off.
function failClosedCases(guard, script, dir) {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-badplugin-"));
  fs.writeFileSync(path.join(plugin, "craftsman.config.json"), "{ not json");
  const payload = JSON.stringify({ session_id: "fail-closed", tool_name: "Bash", tool_input: { command: "ls" } });
  const cases = [
    ["bad JSON on stdin", "not json", {}],
    ["empty stdin", "", {}],
    ["a thrown error inside the guard", payload, { CRAFTSMAN_TEST_THROW: guard }],
    ["an unreadable default config", payload, { CLAUDE_PLUGIN_ROOT: plugin }],
  ];
  try {
    for (const [label, input, env] of cases) {
      const r = spawnSync(process.execPath, [script], {
        cwd: dir, input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
      });
      assert.equal(r.status, 2, `${guard} denies on ${label}: ${r.stderr}`);
      assert.match(r.stderr, new RegExp(`craftsman: ${guard}`), `${guard} names itself on ${label}`);
    }
    // the throw hook only ever denies: another guard's name does nothing
    const other = spawnSync(process.execPath, [script], {
      cwd: dir, input: payload, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CRAFTSMAN_TEST_THROW: "someone-else" },
    });
    assert.notEqual(other.status, 2, "the test hook is scoped to one guard");
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
}

test("pre-guard: bad input, an exception or a broken default config denies and names the guard (6.1, 6.2)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-failclosed-pre-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    failClosedCases("pre-guard", path.join(path.dirname(fileURLToPath(import.meta.url)), "pre-guard.mjs"), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ARCH-SAFETY-05 (8.1/8.2): a tool call cannot switch the guards off. Token matching only; what the
// parser cannot read stays with the sandbox.
const OSG = path.join(ROOT, "orchestrate-scope-guard.mjs");

function selfDisableProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-selfdisable-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  fs.mkdirSync(path.join(dir, "hooks"));
  fs.writeFileSync(path.join(dir, "hooks", "hooks.json"), "{}\n");
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ maxFeedbackLines: 40, stopGate: { enabled: true } }, null, 2) + "\n");
  return dir;
}
const bashIn = (dir, sid, command) => run(GUARD, dir, { session_id: sid, tool_name: "Bash", tool_input: { command } });
const typed = (dir, sid, prompt) => run(OSG, dir, { session_id: sid, prompt });

test("pre-guard: a Bash command that switches the guards off or edits their config is blocked (8.1)", () => {
  const dir = selfDisableProject();
  try {
    const blocked = [
      "echo off > .craftsman/off", "touch .craftsman/off", "echo x >> .craftsman/off", "cp /dev/null .craftsman/off",
      "echo '{}' > craftsman.config.json", "sed -i 's/true/false/' craftsman.config.json", "mv x.json craftsman.config.json",
      "echo '{}' > hooks/hooks.json", "tee hooks/hooks.json < x.json", "cp evil.json hooks/hooks.json", "rm hooks/hooks.json",
      "touch .craftsman/doc-write-pending", "echo x > .craftsman/sessions/s1/doc-write", "echo '{}' > .craftsman/sessions/s1/commands.json",
      "echo '{}' > .craftsman/sessions/s1/goal-tokens.json", "touch .craftsman/sessions/s1/goal-tokens.json",
      "node scripts/toggle.mjs off", 'node "${CLAUDE_PLUGIN_ROOT}/scripts/toggle.mjs" off', "node scripts/toggle.mjs",
      "node scripts/doc-write.mjs on", 'node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs"', "cd scripts && node doc-write.mjs on",
    ];
    for (const command of blocked) {
      const r = bashIn(dir, "sd-1", command);
      assert.equal(r.status, 2, `blocked: ${command} (${r.stderr})`);
    }
    const allowed = [
      "ls .craftsman", "cat .craftsman/off", "cat craftsman.config.json | head", "git diff hooks/hooks.json", "cat hooks/hooks.json",
      "node scripts/toggle.mjs on", "node scripts/doc-write.mjs off", "node --check scripts/toggle.mjs", "grep toggle.mjs commands/toggle.md",
      "cat craftsman.config.json > /dev/null", "echo hi > notes.txt",
    ];
    for (const command of allowed) {
      const r = bashIn(dir, "sd-1", command);
      assert.equal(r.status, 0, `allowed: ${command} (${r.stderr})`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: Write and Edit cannot create .craftsman/off, edit hooks.json or the safety keys (8.1)", () => {
  const dir = selfDisableProject();
  try {
    const call = (tool, input) => run(GUARD, dir, { session_id: "sd-2", tool_name: tool, tool_input: input });
    const cfg = path.join(dir, "craftsman.config.json");
    assert.equal(call("Write", { file_path: path.join(dir, ".craftsman", "off"), content: "off\n" }).status, 2);
    assert.equal(call("Write", { file_path: path.join(dir, "hooks", "hooks.json"), content: "{}\n" }).status, 2);
    assert.equal(call("Edit", { file_path: path.join(dir, "hooks", "hooks.json"), old_string: "{}", new_string: '{"hooks":{}}' }).status, 2);
    assert.equal(call("Edit", { file_path: cfg, old_string: '"enabled": true', new_string: '"enabled": false' }).status, 2, "stopGate is a safety key");
    assert.equal(call("Write", { file_path: cfg, content: JSON.stringify({ safety: { x: 1 } }) }).status, 2, "a new safety block is a safety key");
    assert.equal(call("Write", { file_path: cfg, content: "{ not json" }).status, 2, "an unreadable result cannot be shown safe");
    assert.equal(call("Edit", { file_path: cfg, old_string: '"maxFeedbackLines": 40', new_string: '"maxFeedbackLines": 10' }).status, 0, "other keys stay editable");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: an active unit scope that names hooks.json or craftsman.config.json lets that file be edited (8.1)", () => {
  const dir = selfDisableProject();
  try {
    const sid = "sd-3";
    assert.equal(typed(dir, sid, "/craftsman:orchestrate docs/plans/p.md").status, 0); // only /orchestrate or /auto may hand a unit these files
    const manifest = { session_id: sid, plan: "docs/plans/p.md", unit: "u", project: ".",
      scope: { read: ["hooks/hooks.json", "craftsman.config.json"], docs: [], write: ["hooks/hooks.json", "craftsman.config.json"] } };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    const call = (tool, input) => run(GUARD, dir, { session_id: sid, tool_name: tool, tool_input: input });
    assert.equal(call("Edit", { file_path: path.join(dir, "craftsman.config.json"), old_string: '"enabled": true', new_string: '"enabled": false' }).status, 0);
    assert.equal(call("Write", { file_path: path.join(dir, "hooks", "hooks.json"), content: "{}\n" }).status, 0);
    assert.equal(bashIn(dir, sid, "echo '{}' > hooks/hooks.json").status, 0);
    assert.equal(call("Write", { file_path: path.join(dir, ".craftsman", "off"), content: "off\n" }).status, 2, "never, even with a scope");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: doc-write.mjs on needs a doc-writing command, toggle.mjs off needs the user to have typed /craftsman:toggle (8.1)", () => {
  const dir = selfDisableProject();
  try {
    const grant = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on';
    const off = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/toggle.mjs" off';
    assert.equal(bashIn(dir, "sd-4", grant).status, 2);
    assert.equal(typed(dir, "sd-4", "/craftsman:plan add a feature").status, 0);
    assert.equal(bashIn(dir, "sd-4", grant).status, 0, "/plan's grant call still passes");
    assert.equal(bashIn(dir, "sd-4", off).status, 2, "a plan run is not a toggle");
    assert.equal(bashIn(dir, "sd-5", grant).status, 2, "another session has no such command");
    // a model-invoked Skill call counts for doc writers, never for toggle
    const skill = (sid, name) => run(OSG, dir, { session_id: sid, tool_name: "Skill", tool_input: { skill: name, args: "off" } });
    assert.equal(skill("sd-6", "craftsman:orchestrate").status, 0);
    assert.equal(bashIn(dir, "sd-6", grant).status, 0);
    assert.equal(skill("sd-7", "craftsman:toggle").status, 0);
    assert.equal(bashIn(dir, "sd-7", off).status, 2, "the model cannot invoke its way past the toggle gate");
    assert.equal(typed(dir, "sd-8", "/craftsman:toggle off").status, 0);
    assert.equal(bashIn(dir, "sd-8", off).status, 0, "/craftsman:toggle still passes");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: CRAFTSMAN=off and a .craftsman/off file leave it blocking; only CRAFTSMAN_SAFETY=off lets a call through (8.2)", () => {
  const dir = selfDisableProject();
  try {
    const lock = { session_id: "sd-9", tool_name: "Write", tool_input: { file_path: path.join(dir, "package-lock.json"), content: "{}" } };
    assert.equal(run(GUARD, dir, lock).status, 2, "baseline: a lock file is protected");
    assert.equal(run(GUARD, dir, lock, { CRAFTSMAN: "off" }).status, 2);
    fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "off"), "off\n");
    assert.equal(run(GUARD, dir, lock).status, 2, ".craftsman/off switches off quality and docs, not safety");
    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ enabled: false }));
    assert.equal(run(GUARD, dir, lock).status, 2, "enabled:false in the config is not an off switch for safety");
    assert.equal(run(GUARD, dir, lock, { CRAFTSMAN_SAFETY: "off" }).status, 0);
    assert.equal(run(GUARD, dir, lock, { CRAFTSMAN_SAFETY: "OFF" }).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ARCH-SAFETY-08 (11.0/11.1): outside a git repository the safety checks stay on and only the
// quality, doc and tracker machinery goes off. The precedence matters: the safety verdict comes
// before the unanchored return, not after it.
const AMG = path.join(ROOT, "agent-mode-guard.mjs");
const nonGit = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-nongit-")));
const inNonGit = (script, dir, input, env = {}) => spawnSync(process.execPath, [script], {
  cwd: dir, input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8",
  env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
});
for (const key of ["CRAFTSMAN", "CRAFTSMAN_SAFETY"]) delete process.env[key];

test("pre-guard: outside a git repo a protected-path write and a bad-JSON call still deny (11.1)", () => {
  const dir = nonGit();
  try {
    const lock = { session_id: "ng-1", tool_name: "Write", tool_input: { file_path: path.join(dir, "package-lock.json"), content: "{}" } };
    assert.equal(inNonGit(GUARD, dir, lock).status, 2, "a lock file is protected without a repo too");
    assert.equal(inNonGit(GUARD, dir, "not json").status, 2);
    assert.equal(inNonGit(GUARD, dir, "").status, 2);
    assert.equal(inNonGit(GUARD, dir, { session_id: "ng-1", tool_name: "Write", tool_input: { file_path: path.join(dir, "notes.txt"), content: "x" } }).status, 0, "ordinary work is untouched");
    assert.equal(inNonGit(GUARD, dir, { session_id: "ng-1", tool_name: "Bash", tool_input: { command: "echo off > .craftsman/off" } }).status, 2, "self-protection holds too");
    assert.equal(inNonGit(GUARD, dir, lock, { CRAFTSMAN: "off" }).status, 2);
    assert.equal(inNonGit(GUARD, dir, lock, { CRAFTSMAN_SAFETY: "off" }).status, 0, "the one off switch still works");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: outside a git repo the doc-write and tracker machinery is off and nothing is written to disk (11.1)", () => {
  const dir = nonGit();
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    const write = { session_id: "ng-2", tool_name: "Write", tool_input: { file_path: path.join(dir, "docs", "plans", "x.md"), content: "# y\n" } };
    assert.equal(inNonGit(GUARD, dir, write).status, 0, "no doc-write authority is demanded without a repo");
    assert.equal(inNonGit(GUARD, dir, { session_id: "ng-2", tool_name: "Bash", tool_input: { command: "rm docs/plans/x.md" } }).status, 0);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman")), false, "no state for an unanchored root");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: inside a repo the doc guard still follows enabled(): CRAFTSMAN=off lifts it, safety stays (11.1)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-docside-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    const doc = { session_id: "ng-3", tool_name: "Write", tool_input: { file_path: path.join(dir, "docs", "plans", "x.md"), content: "# y\n" } };
    const lock = { session_id: "ng-3", tool_name: "Write", tool_input: { file_path: path.join(dir, "package-lock.json"), content: "{}" } };
    assert.equal(inNonGit(GUARD, dir, doc).status, 2, "baseline: docs need the grant");
    assert.equal(inNonGit(GUARD, dir, doc, { CRAFTSMAN: "off" }).status, 0, "the doc side follows CRAFTSMAN=off");
    assert.equal(inNonGit(GUARD, dir, lock, { CRAFTSMAN: "off" }).status, 2, "the safety side does not");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("agent-mode-guard and the scope guard: outside a git repo dispatch stays gated, no state is written (11.1)", () => {
  const dir = nonGit();
  try {
    const dispatch = { session_id: "ng-4", tool_name: "Agent", tool_input: { subagent_type: "craftsman:implementer" } };
    assert.equal(inNonGit(AMG, dir, dispatch).status, 2, "root-only holds without a repo");
    assert.equal(inNonGit(OSG, dir, { session_id: "ng-4", prompt: "/craftsman:plan add a thing" }).status, 0);
    assert.equal(inNonGit(OSG, dir, { session_id: "ng-4", prompt: "/orchestrate docs/plans/x.md" }).status, 0);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman")), false, "neither arms a scope nor records a command outside a repo");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("quality-gate and stop-gate: outside a git repo they stay quiet and write nothing (11.1)", () => {
  const dir = nonGit();
  try {
    fs.writeFileSync(path.join(dir, "a.js"), "var x = 1\n");
    for (const [script, input] of [
      ["quality-gate.mjs", { session_id: "ng-5", tool_name: "Write", tool_input: { file_path: path.join(dir, "a.js") } }],
      ["stop-gate.mjs", { session_id: "ng-5" }],
    ]) {
      const r = inNonGit(path.join(ROOT, script), dir, input);
      assert.equal(r.status, 0, `${script}: ${r.stderr}`);
      assert.equal(r.stdout + r.stderr, "", script);
    }
    assert.equal(fs.existsSync(path.join(dir, ".craftsman")), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ARCH-SAFETY-11 (14.0): the launcher's Read/Glob/Grep filter must never change a verdict. Every case runs
// through `node pre-guard.mjs` directly and through `sh hooks/run.sh scripts/pre-guard.mjs`; the exit codes
// must match, including the cases pre-guard blocks on a Read with no scope at all (protected paths).
const RUN_SH = path.join(ROOT, "..", "hooks", "run.sh");
const PLUGIN = path.resolve(ROOT, "..");
const overLauncher = (dir, input, env = {}) => spawnSync("sh", [RUN_SH, "scripts/pre-guard.mjs"], {
  cwd: dir, input: JSON.stringify(input), encoding: "utf8",
  env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: PLUGIN, ...env },
});

function parity(dir, label, input, env) {
  const direct = run(GUARD, dir, input, env);
  const launched = overLauncher(dir, input, env);
  assert.equal(launched.status, direct.status, `${label}: launcher ${launched.status} vs direct ${direct.status}\n${launched.stderr}`);
  return direct.status;
}

test("pre-guard: the launcher filter gives the same verdict as the guard for every tool and case (14.0)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-parity-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    for (const rel of ["src/a.js", "src/other.js", ".env", "node_modules/x/index.js", "package-lock.json", "docs/plans/x.md", "dist/app.js"]) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), "x\n");
    }
    const at = (rel) => path.join(dir, rel);
    const sid = "parity-1";
    const tool = (name, tool_input) => ({ session_id: sid, tool_name: name, tool_input });
    const table = [
      ["Read source", tool("Read", { file_path: at("src/a.js") }), 0],
      ["Read .env", tool("Read", { file_path: at(".env") }), 2],
      ["Read node_modules", tool("Read", { file_path: at("node_modules/x/index.js") }), 2],
      ["Read lock file", tool("Read", { file_path: at("package-lock.json") }), 2],
      ["Read dist", tool("Read", { file_path: at("dist/app.js") }), 2],
      ["Read a doc", tool("Read", { file_path: at("docs/plans/x.md") }), 0],
      ["Glob source", tool("Glob", { pattern: "src/**/*.js", path: dir }), 0],
      ["Grep source", tool("Grep", { pattern: "x", path: at("src") }), 0],
      // pre-guard path-checks file_path only, so a Grep or Glob named by `path` passes it today; parity is the point here
      ["Grep .env by path", tool("Grep", { pattern: "x", path: at(".env") }), 0],
      ["Grep .env by file_path", tool("Grep", { pattern: "x", file_path: at(".env") }), 2],
      ["Write lock file", tool("Write", { file_path: at("package-lock.json"), content: "{}" }), 2],
      ["Write notes", tool("Write", { file_path: at("notes.txt"), content: "x" }), 0],
      ["Write guarded doc", tool("Write", { file_path: at("docs/plans/x.md"), content: "y" }), 2],
      ["Edit hooks.json", tool("Edit", { file_path: at("hooks/hooks.json"), old_string: "a", new_string: "b" }), 2],
      ["NotebookEdit source", tool("NotebookEdit", { notebook_path: at("n.ipynb"), file_path: at("n.ipynb") }), 0],
      ["Bash ls", tool("Bash", { command: "ls" }), 0],
      ["Bash git status", tool("Bash", { command: "git status" }), 0],
      ["Bash rm guarded doc", tool("Bash", { command: "rm docs/plans/x.md" }), 2],
      ["Bash redirect to off flag", tool("Bash", { command: "echo off > .craftsman/off" }), 2],
      ["Bash doc-write on", tool("Bash", { command: "node scripts/doc-write.mjs on" }), 2],
      ["Bash toggle off", tool("Bash", { command: "node scripts/toggle.mjs off" }), 2],
      ["Bash hook bypass", tool("Bash", { command: "git commit --no" + "-verify -m x" }), 2],
      ["bad payload", { session_id: sid }, 0],
    ];
    for (const [label, input, want] of table) assert.equal(parity(dir, label, input), want, `${label}: expected ${want}`);

    // with an active scope the Read is judged against its allow-list, through the launcher too
    const scoped = "parity-2";
    const manifest = { session_id: scoped, plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: ["src/a.js"], docs: [], write: ["src/a.js"] } };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    const read = (rel) => ({ session_id: scoped, tool_name: "Read", tool_input: { file_path: at(rel) } });
    assert.equal(parity(dir, "scope: declared read", read("src/a.js")), 0);
    assert.equal(parity(dir, "scope: undeclared read", read("src/other.js")), 2);
    assert.equal(parity(dir, "scope: Grep outside the scope", { session_id: scoped, tool_name: "Grep", tool_input: { pattern: "x", path: at("src/other.js") } }), 2);

    // the scope-required flag alone (no scope yet) blocks reads, through the launcher too
    const armed = "parity-3";
    assert.equal(run(OSG, dir, { session_id: armed, prompt: "/orchestrate docs/plans/x.md" }).status, 0);
    assert.equal(parity(dir, "scope required, none active", { session_id: armed, tool_name: "Read", tool_input: { file_path: at("src/a.js") } }), 2);

    // a project that overrides protectedPaths keeps its own list honoured on reads
    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ protectedPaths: ["secrets/**"] }));
    fs.mkdirSync(path.join(dir, "secrets"));
    fs.writeFileSync(path.join(dir, "secrets", "key.txt"), "k");
    assert.equal(parity(dir, "project protectedPaths", { session_id: "parity-4", tool_name: "Read", tool_input: { file_path: at("secrets/key.txt") } }), 2);

    // the same list in the other file loadConfig merges (craftsman.project.json) is honoured through the launcher too
    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ maxFeedbackLines: 5 }));
    fs.writeFileSync(path.join(dir, "craftsman.project.json"), JSON.stringify({ protectedPaths: ["secrets/**"] }));
    assert.equal(parity(dir, "project override file protectedPaths", { session_id: "parity-5", tool_name: "Read", tool_input: { file_path: at("secrets/key.txt") } }), 2);

    // CRAFTSMAN_SAFETY=off is the one off switch, with or without the launcher
    assert.equal(parity(dir, "safety off", tool("Read", { file_path: at(".env") }), { CRAFTSMAN_SAFETY: "off" }), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 15.0: the hook-bypass check also reads short flags and git's other spellings, by token (shell-words), no new
// parser. The flag text is assembled from parts so this file never holds a bypass literal.
const NOV = "--no" + "-verify";
const CFG = (key, value = "") => `-c ${key}${value}`;
const HOOKS = "core.hooks" + "Path";
const SIGN = "commit.gpg" + "sign";

test("pre-guard: short, clustered and abbreviated hook-bypass flags and -c forms are blocked (15.1)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-bypass-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const bash = (command) => run(GUARD, dir, { session_id: "bypass-15", tool_name: "Bash", tool_input: { command } });
    const blocked = [
      "git commit -n", "git commit -an", "git commit -na", "git commit -nm msg", "git commit -anm 'a message'", "git commit -m msg -n",
      "git commit -a -m msg -n", "git commit --amend -n", "git commit -sn", "git commit -m msg --no-v", "git commit -m msg --no-ver", "git commit -m msg --no-verif",
      `git commit ${NOV.slice(0, 7)}`, `git push ${NOV.slice(0, 8)}`,
      `git ${CFG(HOOKS, "=/dev/null")} commit -m x`, `git -c${HOOKS}=/dev/null commit -m x`, `git ${CFG(HOOKS.toLowerCase(), "=/x")} commit -m x`,
      `git ${CFG(HOOKS.toUpperCase(), "=/x")} push`, `git --config-env=${HOOKS}=HOOKS_DIR commit -m x`, `git ${CFG(HOOKS)} commit -m x`,
      `git ${CFG(SIGN, "=false")} commit -m x`, `git ${CFG(SIGN, "=0")} commit -m x`, `git ${CFG(SIGN, "=no")} commit -m x`, `git ${CFG(SIGN.toUpperCase(), "=OFF")} commit -m x`,
      "cd sub && git commit -n", "GIT_AUTHOR_NAME=a git commit -n", "env git commit -n", "/usr/bin/git commit -n", "git -C sub commit -n",
      "sudo git commit -n", "git add . && git commit -an -m msg", "git commit -m msg; git commit -n", `git ${CFG("user.name", "=x")} ${CFG(HOOKS, "=/y")} commit -m z`,
      "git $(echo commit) -n", "echo ok | git commit -n -m msg",
    ];
    for (const command of blocked.filter((c) => !c.includes("$("))) assert.equal(bash(command).status, 2, `blocked: ${command}`);
    const allowed = [
      "git commit -m msg", "git commit -a -m msg", "git commit -m 'fix: handle -n flag'", 'git commit -m "a -n b"', "git commit -mn", "git commit -F msg.txt",
      "git commit -F -n", "git commit -am 'x -n'", "git commit -- -n", "git commit -m msg -- file-n",
      "git push -n origin main", "git push --dry-run", "git log -n 5", "git -C sub log -n 5", "git status -sn", "git diff -n",
      `git ${CFG("user.name", "=x")} commit -m y`, `git ${CFG("core.editor", "=vim")} commit -m y`, "echo git commit -n", 'echo "git commit -n"',
      "git config core.editor vim", "git checkout -n", "ls -n", "grep -n x file", "git commit --amend --no-edit", "git commit --no-status -m x",
    ];
    for (const command of allowed) assert.equal(bash(command).status, 0, `allowed: ${command}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: a command shell-words cannot read falls through to the existing text check (15.1)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-bypass-fall-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const bash = (command) => run(GUARD, dir, { session_id: "bypass-fall", tool_name: "Bash", tool_input: { command } });
    // 300 brace alternatives overflow the lexer's word budget: it cannot tell what the words are
    const wide = `{${Array.from({ length: 300 }, (_, i) => `a${i}`).join(",")}}`;
    assert.equal(bash(`echo ${wide}; git commit ${NOV} -m x`).status, 2, "the text check still catches the long flag");
    assert.equal(bash(`echo ${wide}; git commit -m x`).status, 0, "and an innocent command is not blocked for being unreadable");
    assert.equal(bash(`git commit -m "unterminated ${NOV}`).status, 2, "an unterminated quote still reaches the text check");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Scrutiny round: markers, symlinks and scope files are never written by a tool call.
test("pre-guard: mkdir or ln onto a marker path, and a forged scope file, are blocked (self-protection)", () => {
  const dir = selfDisableProject();
  try {
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", "s1"), { recursive: true });
    const blocked = [
      "mkdir -p .craftsman/doc-write-pending", "mkdir .craftsman/off", "mkdir -p .craftsman/sessions/s1/doc-write",
      "install /dev/null .craftsman/off", "ln -s /dev/null .craftsman/off", "ln -s .craftsman/sessions cs",
      "printf '{}' > .craftsman/sessions/s1/scope.json", "echo x > .craftsman/sessions/s1/scope-required",
      "cp evil.json .craftsman/sessions/s1/scope-ab12.json", "touch .craftsman/sessions/s1/root-worktree-binding.json",
    ];
    for (const command of blocked) {
      const r = bashIn(dir, "sp-1", command);
      assert.equal(r.status, 2, `blocked: ${command} (${r.stderr})`);
    }
    for (const command of ["mkdir build", "mkdir -p .craftsman/runs", "ls .craftsman/sessions", "cat .craftsman/sessions/s1/scope.json"]) {
      const r = bashIn(dir, "sp-1", command);
      assert.equal(r.status, 0, `allowed: ${command} (${r.stderr})`);
    }
    const call = (tool, input) => run(GUARD, dir, { session_id: "sp-1", tool_name: tool, tool_input: input });
    for (const name of ["scope.json", "scope-required", "scope-ab12.json", "root-worktree-binding.json"]) {
      assert.equal(call("Write", { file_path: path.join(dir, ".craftsman", "sessions", "s1", name), content: "{}" }).status, 2, `Write ${name}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: a symlinked directory into .craftsman cannot forge a goal token or command record (self-protection)", () => {
  const dir = selfDisableProject();
  try {
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", "s1"), { recursive: true });
    fs.symlinkSync(path.join(".craftsman", "sessions"), path.join(dir, "cs"));
    fs.mkdirSync(path.join(dir, "plain", "s1"), { recursive: true });
    const call = (tool, input) => run(GUARD, dir, { session_id: "sp-2", tool_name: tool, tool_input: input });
    for (const name of ["goal-tokens.json", "commands.json", "doc-write"]) {
      assert.equal(call("Write", { file_path: path.join(dir, "cs", "s1", name), content: "{}" }).status, 2, `Write cs/s1/${name}`);
      assert.equal(call("Write", { file_path: path.join("cs", "s1", name), content: "{}" }).status, 2, `relative Write cs/s1/${name}`);
      assert.equal(bashIn(dir, "sp-2", `echo '{}' > cs/s1/${name}`).status, 2, `redirect to cs/s1/${name}`);
    }
    assert.equal(call("Edit", { file_path: path.join(dir, "cs", "s1", "goal-tokens.json"), old_string: "a", new_string: "b" }).status, 2);
    assert.equal(call("Write", { file_path: path.join(dir, "plain", "s1", "goal-tokens.json"), content: "{}" }).status, 0, "a real directory of that name is just a file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: every doc-write or toggle invocation is gated, with node options and several calls (self-protection)", () => {
  const dir = selfDisableProject();
  try {
    const plugin = 'node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/';
    const grants = [
      "node scripts/doc-write.mjs off; node scripts/doc-write.mjs on", "node scripts/doc-write.mjs off && node scripts/doc-write.mjs",
      "node -- scripts/doc-write.mjs on", `${plugin}doc-write.mjs"`, "node --no-warnings scripts/doc-write.mjs on",
      "node -r ./x.js scripts/doc-write.mjs on", "node --input-type=module scripts/doc-write.mjs on",
    ];
    const offs = [
      "node --no-warnings scripts/toggle.mjs off", "node scripts/toggle.mjs on; node scripts/toggle.mjs off", `${plugin}toggle.mjs" off`,
      "node -- scripts/toggle.mjs",
    ];
    for (const command of [...grants, ...offs]) {
      const r = bashIn(dir, "sg-1", command);
      assert.equal(r.status, 2, `blocked: ${command} (${r.stderr})`);
    }
    for (const command of ["node --check scripts/toggle.mjs", "node --check scripts/doc-write.mjs", "node scripts/doc-write.mjs off",
      "node --no-warnings scripts/doc-write.mjs off", "node scripts/toggle.mjs on", "node scripts/doc-write.mjs off; node scripts/toggle.mjs on"]) {
      const r = bashIn(dir, "sg-1", command);
      assert.equal(r.status, 0, `allowed: ${command} (${r.stderr})`);
    }
    // The owning command opens exactly its own gate.
    assert.equal(typed(dir, "sg-2", "/craftsman:plan add a feature").status, 0);
    for (const command of grants) assert.equal(bashIn(dir, "sg-2", command).status, 0, `after /plan: ${command}`);
    for (const command of offs) assert.equal(bashIn(dir, "sg-2", command).status, 2, `a plan run is not a toggle: ${command}`);
    assert.equal(typed(dir, "sg-3", "/craftsman:toggle off").status, 0);
    for (const command of offs) assert.equal(bashIn(dir, "sg-3", command).status, 0, `after /toggle: ${command}`);
    for (const command of grants) assert.equal(bashIn(dir, "sg-3", command).status, 2, `a toggle run is not a doc writer: ${command}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Scrutiny round: more spellings of a skipped hook. Flag text is built by concatenation so this
// source never holds the forbidden words together.
test("pre-guard: git config, env config, value-taking wrappers and sh -c cannot skip hooks (bypass round 2)", () => {
  const dir = selfDisableProject();
  try {
    const nv = "--no-" + "verify";
    const hp = "core.hooks" + "Path";
    const blocked = [
      `git config ${hp} /dev/null`, `git config --global ${hp} /x`, `git config --local ${hp.toLowerCase()} x`, `git -C . config ${hp} x`,
      `git config alias.ci "commit ${nv}"`, "git config alias.ci '!git commit -n'", `git config --global alias.ci 'commit -a ${nv}'`,
      `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=${hp} GIT_CONFIG_VALUE_0=/dev/null git commit -m x`,
      `GIT_CONFIG_PARAMETERS="'${hp}'='/x'" git commit -m x`, `env GIT_CONFIG_KEY_0=${hp} git commit -m x`,
      "env -u FOO git commit -n -m x", "sudo -u me git commit -n -m x", "busybox git commit -n -m x", "env -C /tmp git commit -n -m x",
      "sh -c 'git commit -n -m x'", 'bash -lc "git commit -n -m x"', "sh -c \"sh -c 'git commit -n'\"", "env -u FOO sh -c 'git commit -n'",
    ];
    for (const command of blocked) {
      const r = bashIn(dir, "bf-1", command);
      assert.equal(r.status, 2, `blocked: ${command} (${r.stderr})`);
    }
    const allowed = [
      "git config core.editor vim", "git config user.name x", `git config --get ${hp}`, `git config --unset ${hp}`, "git config alias.st status",
      "env -u FOO git commit -m msg", "sudo -u me git status", "sh -c 'git status'", "bash -c 'echo -n hi'", "env -u FOO git log -n 3",
      "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.editor GIT_CONFIG_VALUE_0=vim git commit -m x",
    ];
    for (const command of allowed) {
      const r = bashIn(dir, "bf-1", command);
      assert.equal(r.status, 0, `allowed: ${command} (${r.stderr})`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: the allowed event names the tool, so the Stop drift report can tell a read from an edit", () => {
  const dir = selfDisableProject();
  try {
    const file = path.join(dir, "notes.txt");
    fs.writeFileSync(file, "x\n");
    assert.equal(run(GUARD, dir, { session_id: "ev-1", tool_name: "Read", tool_input: { file_path: file } }).status, 0);
    assert.equal(run(GUARD, dir, { session_id: "ev-1", tool_name: "Write", tool_input: { file_path: file, content: "y" } }).status, 0);
    const events = fs.readFileSync(path.join(dir, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
      .filter((e) => e.ev === "preguard" && e.result === "allowed" && e.sid === "ev-1");
    assert.deepEqual(events.map((e) => e.tool), ["Read", "Write"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Scrutiny round: the harness settings that decide whether craftsman's hooks run at all, and NotebookEdit.
test("pre-guard: a tool call cannot switch craftsman off through .claude/settings*.json (self-protection)", () => {
  const dir = selfDisableProject();
  try {
    fs.mkdirSync(path.join(dir, ".claude"));
    const settings = path.join(dir, ".claude", "settings.json");
    const local = path.join(dir, ".claude", "settings.local.json");
    fs.writeFileSync(settings, '{"permissions":{"allow":[]},"theme":"dark"}\n');
    fs.writeFileSync(local, '{"permissions":{"allow":["Bash(ls)"]}}\n');
    const call = (tool, input) => run(GUARD, dir, { session_id: "st-1", tool_name: tool, tool_input: input });
    const write = (file, doc) => call("Write", { file_path: file, content: JSON.stringify(doc) });
    for (const file of [settings, local]) {
      assert.equal(write(file, { disableAllHooks: true }).status, 2, `disableAllHooks in ${file}`);
      assert.equal(write(file, { env: { CRAFTSMAN_SAFETY: "off" } }).status, 2, "the safety env switch");
      assert.equal(write(file, { enabledPlugins: { "craftsman@craftsman-marketplace": false } }).status, 2, "craftsman disabled as a plugin");
      assert.equal(write(file, { hooks: { PreToolUse: [] } }).status, 2, "hooks");
      assert.equal(write(file, { permissions: { allow: ["Bash(ls)"] }, theme: "light", env: { DEBUG: "1" }, enabledPlugins: { "other@x": true } }).status, 0, "unrelated keys stay editable");
    }
    assert.equal(call("Edit", { file_path: settings, old_string: '"theme":"dark"', new_string: '"theme":"dark","disableAllHooks":true' }).status, 2);
    assert.equal(call("Edit", { file_path: settings, old_string: '"theme":"dark"', new_string: '"theme":"light"' }).status, 0);
    for (const command of ["echo '{}' > .claude/settings.json", "cp evil.json .claude/settings.local.json", "sed -i 's/a/b/' .claude/settings.json", "tee .claude/settings.json < x.json"]) {
      assert.equal(bashIn(dir, "st-1", command).status, 2, `blocked: ${command}`);
    }
    for (const command of ["cat .claude/settings.json", "ls .claude", "grep theme .claude/settings.json"]) {
      assert.equal(bashIn(dir, "st-1", command).status, 0, `allowed: ${command}`);
    }
    // A unit scope that names the file (made by /orchestrate) may edit it.
    assert.equal(typed(dir, "st-2", "/craftsman:orchestrate docs/plans/p.md").status, 0);
    const manifest = { session_id: "st-2", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: [".claude/settings.json"], docs: [], write: [".claude/settings.json"] } };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    assert.equal(run(GUARD, dir, { session_id: "st-2", tool_name: "Write", tool_input: { file_path: settings, content: '{"disableAllHooks":true}' } }).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: NotebookEdit is held to the same protected-path, doc and self-protection checks as Write (notebook_path)", () => {
  const dir = selfDisableProject();
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    const call = (notebook_path) => run(GUARD, dir, { session_id: "nb-1", tool_name: "NotebookEdit", tool_input: { notebook_path, new_source: "x", cell_id: "c" } });
    assert.equal(call(path.join(dir, ".craftsman", "off")).status, 2, "a marker");
    assert.equal(call(path.join(dir, "package-lock.json")).status, 2, "a protected path");
    assert.equal(call(path.join(dir, "docs", "plans", "n.ipynb")).status, 2, "a guarded doc without the grant");
    assert.equal(call(path.join(dir, "hooks", "hooks.json")).status, 2, "the hooks file");
    assert.equal(call(path.join(dir, "analysis.ipynb")).status, 0, "an ordinary notebook");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Scrutiny round 2 (12.x): the config and settings keys that switch a guard off are protected, whatever else a Write keeps.
test("pre-guard: the config and settings keys that disable a guard are protected (12.1-12.3)", () => {
  const dir = selfDisableProject();
  try {
    const base = { maxFeedbackLines: 40, timeoutMs: 20000, enabled: true, protectedPaths: ["**/.env"],
      docWriteGuard: { enabled: true, docPaths: ["docs/**"] }, execution: { agentMode: "root-only", engine: "workflow", maxSubagents: 0 }, stopGate: { enabled: true } };
    const cfg = path.join(dir, "craftsman.config.json");
    fs.writeFileSync(cfg, JSON.stringify(base, null, 2) + "\n");
    const call = (tool, input) => run(GUARD, dir, { session_id: "ck-1", tool_name: tool, tool_input: input });
    const variant = (mutate) => { const next = JSON.parse(JSON.stringify(base)); mutate(next); return call("Write", { file_path: cfg, content: JSON.stringify(next) }); };
    const blocked = {
      "protectedPaths emptied": (c) => { c.protectedPaths = []; },
      "docWriteGuard disabled": (c) => { c.docWriteGuard.enabled = false; },
      "docWriteGuard.docPaths emptied": (c) => { c.docWriteGuard.docPaths = []; },
      "agentMode loosened": (c) => { c.execution.agentMode = "subagents"; },
      "engine changed": (c) => { c.execution.engine = "root"; },
      "enabled false": (c) => { c.enabled = false; },
      "enabled removed": (c) => { delete c.enabled; },
    };
    for (const [name, mutate] of Object.entries(blocked)) assert.equal(variant(mutate).status, 2, name);
    for (const [name, mutate] of Object.entries({
      "maxFeedbackLines": (c) => { c.maxFeedbackLines = 10; }, "timeoutMs": (c) => { c.timeoutMs = 5000; },
      "an unrelated execution key": (c) => { c.execution.maxSubagents = 1; },
    })) assert.equal(variant(mutate).status, 0, `${name} stays editable`);

    fs.mkdirSync(path.join(dir, ".claude"));
    const settings = path.join(dir, ".claude", "settings.json");
    fs.writeFileSync(settings, '{"theme":"dark"}\n');
    const env = (obj) => call("Write", { file_path: settings, content: JSON.stringify({ theme: "dark", env: obj }) });
    for (const key of ["NODE_OPTIONS", "NODE_PATH", "PATH", "CLAUDE_PLUGIN_ROOT", "CRAFTSMAN_SAFETY"]) assert.equal(env({ [key]: "x" }).status, 2, `env ${key}`);
    assert.equal(env({ DEBUG: "1" }).status, 0, "an unrelated env key stays editable");

    const notebook = (notebook_path) => call("NotebookEdit", { notebook_path, new_source: "x", cell_id: "c" });
    assert.equal(notebook(settings).status, 2, "NotebookEdit of the settings file");
    assert.equal(notebook(cfg).status, 2, "NotebookEdit of the config");
    assert.equal(notebook(path.join(dir, "analysis.ipynb")).status, 0, "an ordinary notebook");

    // A unit scope that names the config (made by /orchestrate) may still edit it.
    assert.equal(typed(dir, "ck-2", "/craftsman:orchestrate docs/plans/p.md").status, 0);
    const manifest = { session_id: "ck-2", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: ["craftsman.config.json"], docs: [], write: ["craftsman.config.json"] } };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    const loosened = JSON.parse(JSON.stringify(base)); loosened.protectedPaths = [];
    assert.equal(run(GUARD, dir, { session_id: "ck-2", tool_name: "Write", tool_input: { file_path: cfg, content: JSON.stringify(loosened) } }).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Scrutiny round 2 (13.x): self-protection reads shell words (quotes removed, cwd tracked), not the raw command text.
test("pre-guard: a quote-split name or a cd into .craftsman cannot forge a marker, grant, record or scope (13.1-13.2)", () => {
  const dir = selfDisableProject();
  try {
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", "s1"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src"));
    const blocked = [
      `touch .craftsman/o""ff`, `touch .crafts''man/off`, `touch .craftsman/sessions/s1/doc-w""rite`,
      `tee .craftsman/sessions/s1/command""s.json`, `tee .craftsman/sessions/s1/goal-token""s.json`, `tee .craftsman/sessions/s1/sco""pe.json`,
      `ln -s .crafts''man x`, `cp x .craftsman/o''ff`, `install -m 644 x .craftsman/o""ff`, `mkdir .craftsman/doc-write-pen""ding`,
      `dd if=/dev/null of=.craftsman/o""ff`, `sed -i s/a/b/ .craftsman/o""ff`, `perl -pi -e 's/a/b/' .craftsman/o""ff`,
      `sudo touch .craftsman/o""ff`, `echo x | tee .craftsman/o""ff`,
      `cd .craftsman && touch off`, `cd .craftsman; echo x > off`, `pushd .craftsman && touch off`, `cd .craftsman/sessions/s1 && tee doc-write`,
    ];
    for (const command of blocked) {
      const r = bashIn(dir, "sw-1", command);
      assert.equal(r.status, 2, `blocked: ${command} (${r.stderr})`);
    }
    const allowed = [
      "ls .craftsman", "cat .craftsman/off", "touch notes.txt", "cd src && touch a.txt", "cd src; echo x > a.txt", "cp x src/y",
      "tee src/log.txt", "sed -i s/a/b/ src/a.txt", "ln -s src/a src/b", "dd if=/dev/null of=src/a.bin", "mkdir -p src/deep/er",
      "cd .craftsman && ls", "cd .craftsman && cat off",
    ];
    for (const command of allowed) {
      const r = bashIn(dir, "sw-1", command);
      assert.equal(r.status, 0, `allowed: ${command} (${r.stderr})`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Scrutiny round 2 (15.x): git config set, -c alias, the other subcommands that take the skip flag, .git/config, one -c extractor.
test("pre-guard: git config set, -c alias.X, merge/rebase/am/cherry-pick skip flags and .git writes are blocked (15.1-15.4)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-bypass3-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const bash = (command) => run(GUARD, dir, { session_id: "bypass-15b", tool_name: "Bash", tool_input: { command } });
    const blocked = [
      `git config set ${HOOKS} /x`, `git config set --global ${HOOKS} /x`, `git config set --local ${HOOKS.toLowerCase()} /x`,
      "git -c alias.ci='commit -n' ci -m x", `git -c "alias.ci=commit ${NOV}" ci -m x`, "git -c alias.ci='!git commit -n' ci -m x",
      `git merge ${NOV} topic`, `git rebase ${NOV} main`, `git am ${NOV} p.patch`, `git cherry-pick ${NOV} abc`, `git merge ${NOV.slice(0, 8)} topic`,
      "bash -lc 'git commit -n -m x'", "sh -o pipefail -c 'git commit -n -m x'", "bash -c -- 'git commit -n -m x'", `bash -c "git ${CFG(HOOKS, "=/x")} commit -m x"`,
      "echo '[core]' >> .git/config", "cp evil .git/hooks/pre-commit", "tee .git/hooks/commit-msg < x", "printf x > .git/config",
    ];
    for (const command of blocked) assert.equal(bash(command).status, 2, `blocked: ${command}`);
    const allowed = [
      "git config get core.editor", "git config set user.name x", "git config user.name x", "git -c alias.st=status st", "git merge topic",
      "git rebase main", "git am p.patch", "git cherry-pick abc", "git merge --no-ff topic", "git rebase -n main", "git commit -m 'about -n'",
      "bash -c 'git status'", "bash -lc 'git log -n 3'", "cat .git/config", "ls .git/hooks",
    ];
    for (const command of allowed) assert.equal(bash(command).status, 0, `allowed: ${command}`);

    const write = (rel, content) => run(GUARD, dir, { session_id: "bypass-15b", tool_name: "Write", tool_input: { file_path: path.join(dir, rel), content } });
    assert.equal(write(".git/config", `[core]\n\t${HOOKS} = /x\n`).status, 2, "Write of .git/config");
    assert.equal(write(".git/hooks/pre-commit", "#!/bin/sh\nexit 0\n").status, 2, "Write of a git hook");
    assert.equal(write("notes.txt", "x").status, 0, "an ordinary file stays writable");

    // One extractor for sh -c bodies (15.4).
    const source = fs.readFileSync(GUARD, "utf8");
    assert.equal((source.match(/function shellBodyAfter\(/g) || []).length, 1, "one shell-body extractor");
    assert.doesNotMatch(source, /rest\.findIndex\(\(w\) => \/\^-\[a-z\]\*c\[a-z\]\*\$\//, "the second copy is gone");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Round 3 (18.x): a directory destination, or removing/moving an ancestor, cannot reach a protected path.
test("pre-guard: a directory destination and the removal of an ancestor cannot reach a protected path (18.1-18.2)", () => {
  const dir = selfDisableProject();
  try {
    for (const d of [".claude", ".craftsman/sessions/s1", "src", "build", "node_modules/pkg"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
    const blocked = [
      "cp /tmp/settings.json .claude/", "cp /tmp/settings.json .claude", "mv /tmp/settings.json .claude/", "mv /tmp/settings.json .claude", "cp /tmp/off .craftsman", "cp /tmp/hooks.json hooks",
      "install -t .claude settings.json", "cp -t .craftsman/sessions/s1 commands.json", "cp /tmp/commands.json .craftsman/sessions/s1/", "ln -s /tmp/settings.json .claude/",
      "mv /tmp/commands.json .craftsman/sessions/s1/", "cp --target-directory=.claude settings.json", "cp /tmp/x.json /tmp/settings.json .claude/",
      "rm -rf .craftsman/sessions/s1", "rm -rf .craftsman", "mv .craftsman/sessions /tmp/x", "rm -rf hooks", "rm -rf .claude", "rm -r .craftsman/sessions",
      "rmdir .claude", "cd .craftsman && rm -rf sessions", "rm -rf ./.craftsman/", "git rm -r hooks", "mv hooks /tmp/h",
    ];
    for (const command of blocked) {
      const r = bashIn(dir, "sd-18", command);
      assert.equal(r.status, 2, `blocked: ${command} (${r.stderr})`);
    }
    const allowed = [
      "cp x src/", "cp x build", "cp x src/deep/", "cp x .claude/commands/", "cp /tmp/x .claude/", "cp /tmp/x .claude", "mv /tmp/x .claude/", "cp /tmp/h hooks", "mv a.txt b.txt", "mv a.txt src/", "rm -rf build", "rm -rf node_modules", "rm src/a.txt",
      "rm -rf .craftsman/tmp-notes", "cd .claude && cp /tmp/x notes.md", "install -t src x", "ln -s ../a src/b", "rm -f *.log", "rm -rf src/*", "cp /tmp/x .claude/notes.md",
      "mv .craftsman/notes.txt notes.txt",
    ];
    for (const command of allowed) {
      const r = bashIn(dir, "sd-18", command);
      assert.equal(r.status, 0, `allowed: ${command} (${r.stderr})`);
    }
    // A unit scope that names hooks/hooks.json (made by /orchestrate) may remove it with its directory; the state dir stays protected.
    assert.equal(typed(dir, "sd-18b", "/craftsman:orchestrate docs/plans/p.md").status, 0);
    const manifest = { session_id: "sd-18b", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: [], docs: [], write: ["hooks/hooks.json"] } };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    assert.equal(bashIn(dir, "sd-18b", "rm -rf hooks").status, 0, "the scope names the file hooks holds");
    assert.equal(bashIn(dir, "sd-18b", "rm -rf .craftsman").status, 2, "the state dir is never scoped");
    assert.equal(bashIn(dir, "sd-18b", "rm -rf .claude").status, 2, "a scope that does not name settings does not cover it");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Round 3 (19.x): a symlinked directory is the same file for the hooks.json deny and for the scope exemption.
test("pre-guard: hooks.json and the scope exemption are judged by real path through a symlinked directory (19.1-19.2)", () => {
  const dir = selfDisableProject();
  try {
    fs.mkdirSync(path.join(dir, ".claude"));
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), '{"theme":"dark"}\n');
    for (const [link, target] of [["h", "hooks"], ["c", ".claude"], ["s", "src"]]) fs.symlinkSync(target, path.join(dir, link));
    const call = (sid, tool, input) => run(GUARD, dir, { session_id: sid, tool_name: tool, tool_input: input });
    const at = (rel) => path.join(dir, rel);
    // 19.1: hooks.json through a symlinked directory.
    assert.equal(call("sl-1", "Edit", { file_path: at("h/hooks.json"), old_string: "{}", new_string: '{"hooks":{}}' }).status, 2, "Edit via h/");
    assert.equal(call("sl-1", "Write", { file_path: at("h/hooks.json"), content: "{}\n" }).status, 2, "Write via h/");
    assert.equal(call("sl-1", "Edit", { file_path: at("hooks/hooks.json"), old_string: "{}", new_string: '{"hooks":{}}' }).status, 2, "the direct path (control)");
    assert.equal(call("sl-1", "Write", { file_path: at("s/a.txt"), content: "x\n" }).status, 0, "an unrelated file through a symlink stays writable");
    // 19.2: a session scope that names the file only through the link does not give the exemption.
    const manifest = (sid, write) => ({ session_id: sid, plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: [], docs: [], write } });
    assert.equal(run(SCOPE, dir, manifest("sl-2", ["c/**"])).status, 2, "scope activation judges the real path: c/** reaches the settings file");
    assert.equal(typed(dir, "sl-3", "/craftsman:orchestrate docs/plans/p.md").status, 0);
    assert.equal(run(SCOPE, dir, manifest("sl-3", ["c/**"])).status, 0, "after /orchestrate the manifest may activate");
    const addHooksOff = { file_path: at("c/settings.json"), old_string: '"theme":"dark"', new_string: '"theme":"dark","disableAllHooks":true' };
    assert.equal(call("sl-3", "Edit", addHooksOff).status, 2, "a scope that names c/** does not skip the safety-key check on .claude/settings.json");
    assert.equal(typed(dir, "sl-4", "/craftsman:orchestrate docs/plans/p.md").status, 0);
    assert.equal(run(SCOPE, dir, manifest("sl-4", [".claude/settings.json"])).status, 0);
    assert.equal(call("sl-4", "Edit", { ...addHooksOff, file_path: at(".claude/settings.json") }).status, 0, "a scope that names the real file allows the edit by that path");
    assert.equal(call("sl-4", "Edit", addHooksOff).status, 2, "the same edit through the link is outside that scope, which names only the real path");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: the approval gate keys cannot be flipped by a tool call", () => {
  const dir = selfDisableProject();
  try {
    const base = { maxFeedbackLines: 40, stopGate: { enabled: true }, repoExec: { approval: { required: true, prLines: 400 } }, planning: { featureBranches: true } };
    const cfg = path.join(dir, "craftsman.config.json");
    fs.writeFileSync(cfg, JSON.stringify(base, null, 2) + "\n");
    const write = (mutate) => {
      const next = JSON.parse(JSON.stringify(base)); mutate(next);
      return run(GUARD, dir, { session_id: "ak-1", tool_name: "Write", tool_input: { file_path: cfg, content: JSON.stringify(next) } });
    };
    assert.equal(write((c) => { c.repoExec.approval.required = false; }).status, 2, "approval.required off");
    assert.equal(write((c) => { c.planning.featureBranches = false; }).status, 2, "featureBranches off");
    assert.equal(write((c) => { c.repoExec.approval.prLines = 10; }).status, 0, "unrelated key passes");
    const projectCfg = path.join(dir, "craftsman.project.json");
    fs.writeFileSync(projectCfg, JSON.stringify(base, null, 2) + "\n");
    const writeProject = (mutate) => {
      const next = JSON.parse(JSON.stringify(base)); mutate(next);
      return run(GUARD, dir, { session_id: "ak-3", tool_name: "Write", tool_input: { file_path: projectCfg, content: JSON.stringify(next) } });
    };
    assert.equal(writeProject((c) => { c.repoExec.approval.required = false; }).status, 2, "craftsman.project.json: approval.required off");
    assert.equal(writeProject((c) => { c.planning.featureBranches = false; }).status, 2, "craftsman.project.json: featureBranches off");
    assert.equal(writeProject((c) => { c.repoExec.approval.prLines = 10; }).status, 0, "craftsman.project.json: unrelated key passes");
    assert.equal(typed(dir, "ak-2", "/craftsman:orchestrate docs/plans/p.md").status, 0);
    assert.equal(run(SCOPE, dir, { session_id: "ak-2", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: ["craftsman.config.json"], docs: [], write: ["craftsman.config.json"] } }).status, 0);
    assert.equal(run(GUARD, dir, { session_id: "ak-2", tool_name: "Write", tool_input: { file_path: cfg, content: JSON.stringify({ ...base, planning: { featureBranches: false } }) } }).status, 0, "a scope naming the file may flip it");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Round 3 (21.x): the worktree sweep controls decide what the sweep may remove, so they are safety keys.
test("pre-guard: the worktree sweep config keys cannot be loosened by a tool call (21.1)", () => {
  const dir = selfDisableProject();
  try {
    const base = { maxFeedbackLines: 40, timeoutMs: 20000, stopGate: { enabled: true }, worktrees: { disposable: ["**/node_modules/**", "**/dist/**"], sweepClaudeWorktrees: false } };
    const cfg = path.join(dir, "craftsman.config.json");
    fs.writeFileSync(cfg, JSON.stringify(base, null, 2) + "\n");
    const write = (sid, mutate) => {
      const next = JSON.parse(JSON.stringify(base)); mutate(next);
      return run(GUARD, dir, { session_id: sid, tool_name: "Write", tool_input: { file_path: cfg, content: JSON.stringify(next) } });
    };
    assert.equal(write("wk-1", (c) => { c.worktrees.disposable = ["**"]; }).status, 2, "disposable widened to everything");
    assert.equal(write("wk-1", (c) => { c.worktrees.disposable.push("**/data/**"); }).status, 2, "disposable extended");
    assert.equal(write("wk-1", (c) => { c.worktrees.sweepClaudeWorktrees = true; }).status, 2, "Claude Code's own worktrees opted in");
    assert.equal(write("wk-1", (c) => { delete c.worktrees; }).status, 2, "the block removed");
    assert.equal(run(GUARD, dir, { session_id: "wk-1", tool_name: "Edit", tool_input: { file_path: cfg, old_string: '"sweepClaudeWorktrees": false', new_string: '"sweepClaudeWorktrees": true' } }).status, 2, "Edit form");
    assert.equal(write("wk-1", (c) => { c.maxFeedbackLines = 10; }).status, 0, "other keys stay editable");
    // A unit scope that names the config (made by /orchestrate) may still change them.
    assert.equal(typed(dir, "wk-2", "/craftsman:orchestrate docs/plans/p.md").status, 0);
    assert.equal(run(SCOPE, dir, { session_id: "wk-2", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: ["craftsman.config.json"], docs: [], write: ["craftsman.config.json"] } }).status, 0);
    assert.equal(write("wk-2", (c) => { c.worktrees.sweepClaudeWorktrees = true; }).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Round 3 (20.x): a config include or an alternative config file reaches core.hooksPath without naming it.
const INC = "include" + ".path";
const INCIF = "includeIf.gitdir:/x/" + ".path";
const CFGENV = (name, value = "/tmp/g") => `GIT_CONFIG${name}=${value}`;
test("pre-guard: config includes and alternative config files are hook-skip routes (20.1)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-bypass4-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const bash = (command) => run(GUARD, dir, { session_id: "bypass-20", tool_name: "Bash", tool_input: { command } });
    const blocked = [
      `git -c ${INC}=/tmp/g commit -m x`, `git -c ${INCIF}=/tmp/g commit -m x`, `git -c ${INC}=/tmp/g merge topic`, `git -c includeIf.onbranch:main.path=/tmp/g rebase main`,
      `${CFGENV("_GLOBAL")} git commit -m x`, `${CFGENV("_SYSTEM")} git commit -m x`, `${CFGENV("")} git rebase main`, `env ${CFGENV("_GLOBAL")} git push`,
      `export ${CFGENV("_GLOBAL")}; git commit -m x`, `bash -c '${CFGENV("_SYSTEM")} git commit -m x'`, `${CFGENV("_GLOBAL", '"/tmp/g"')} git commit -m x`,
      `git config ${INC} /tmp/g`, `git config --add ${INC} /tmp/g`, `git config --global ${INC} /tmp/g`, `git config set ${INCIF} /tmp/g`, `git config set --local ${INC} /tmp/g`,
      `${CFGENV("_KEY_0", INC)} git commit -m x`.replace("GIT_CONFIG_KEY_0=", "GIT_CONFIG_KEY_0="),
    ];
    for (const command of blocked) assert.equal(bash(command).status, 2, `blocked: ${command}`);
    const allowed = [
      `git config get ${INC}`, `git config --get ${INC}`, `git config --list`, "git config user.name x", "git -c user.name=x commit -m y",
      `${CFGENV("_GLOBAL")} git status`, `${CFGENV("_GLOBAL", "/dev/null")} git commit -m y`, `${CFGENV("_SYSTEM", "/dev/null")} git push`, `git -c ${INC}=/x status`,
      "git commit -m 'about an include'", `echo ${INC}`,
    ];
    for (const command of allowed) assert.equal(bash(command).status, 0, `allowed: ${command}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Round 4: a self-protection claim is about a REAL write, so each attack form below is run for real in a throwaway
// project, unguarded, to prove it changes protected state, and then offered to the guard in a fresh one, which must deny it.
function attackProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-attack-")));
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-attack-home-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  for (const d of [".claude", "hooks", ".craftsman/sessions/s1", "src", "stage/.claude", "stage/hooks"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), '{"theme":"dark"}\n');
  fs.writeFileSync(path.join(dir, "hooks", "hooks.json"), "{}\n");
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), '{"maxFeedbackLines":40}\n');
  fs.writeFileSync(path.join(dir, "src", "a.txt"), "a\n");
  fs.writeFileSync(path.join(dir, "stage", "x"), "x\n");
  fs.writeFileSync(path.join(dir, "stage", ".claude", "settings.json"), '{"theme":"STAGED"}\n');
  fs.writeFileSync(path.join(dir, "stage", "hooks", "hooks.json"), '{"staged":true}\n');
  fs.writeFileSync(path.join(dir, "stage", "x.patch"), '--- .claude/settings.json\n+++ .claude/settings.json\n@@ -1 +1 @@\n-{"theme":"dark"}\n+{"theme":"PATCHED"}\n');
  spawnSync("tar", ["-cf", path.join(dir, "stage", "x.tar"), "-C", path.join(dir, "stage", ".claude"), "settings.json"]);
  spawnSync("zip", ["-qj", path.join(dir, "stage", "x.zip"), path.join(dir, "stage", ".claude", "settings.json")]);
  assert.ok(home !== os.homedir(), "the attack runs against a temp HOME");
  return { dir, home, env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home, CLAUDE_CODE_SESSION_ID: "atk" } };
}
function treeOf(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.name === ".git" && d === dir) {
        // Only what git reads for hooks and config; the rest of .git changes with every command.
        const cfg = path.join(p, "config");
        if (fs.existsSync(cfg)) out[".git/config"] = fs.readFileSync(cfg, "utf8");
        const hooks = path.join(p, "hooks");
        if (fs.existsSync(hooks)) for (const h of fs.readdirSync(hooks)) out[".git/hooks/" + h] = fs.readFileSync(path.join(hooks, h), "utf8");
        continue;
      }
      if (e.isSymbolicLink()) out[path.relative(dir, p)] = "-> " + fs.readlinkSync(p);
      else if (e.isDirectory()) { out[path.relative(dir, p) + "/"] = ""; walk(p); }
      else out[path.relative(dir, p)] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}
const PROTECTED_TREE = [/^\.claude\//, /^hooks\//, /^craftsman\.config\.json$/, /^\.craftsman\/(?:off|doc-write-pending)$/, /^\.craftsman\/sessions\//, /^\.git\/(?:hooks|config)/];
const changedProtected = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter((k) => before[k] !== after[k] && PROTECTED_TREE.some((re) => re.test(k)) && !k.startsWith("stage/"));
// Returns what the command changes among the protected paths when run unguarded.
function unguardedEffect(command) {
  const p = attackProject();
  try {
    const before = treeOf(p.dir);
    spawnSync("sh", ["-c", command], { cwd: p.dir, env: p.env, encoding: "utf8" });
    return changedProtected(before, treeOf(p.dir));
  } finally { fs.rmSync(p.dir, { recursive: true, force: true }); fs.rmSync(p.home, { recursive: true, force: true }); }
}
// Asserts: the command really changes protected state when run unguarded, the guard denies it, and (re-run guarded) nothing changed.
function assertDenied(command, why = "") {
  const effect = unguardedEffect(command);
  assert.ok(effect.length > 0, `the attack form is real: ${command} changes protected state when run unguarded${why}`);
  const p = attackProject();
  try {
    const r = run(GUARD, p.dir, { session_id: "atk", tool_name: "Bash", tool_input: { command } }, { HOME: p.home, USERPROFILE: p.home });
    assert.equal(r.status, 2, `denied: ${command} (would have changed ${effect.join(", ")})`);
  } finally { fs.rmSync(p.dir, { recursive: true, force: true }); fs.rmSync(p.home, { recursive: true, force: true }); }
}
function assertAllowed(command) {
  const p = attackProject();
  try {
    const r = run(GUARD, p.dir, { session_id: "atk", tool_name: "Bash", tool_input: { command } }, { HOME: p.home, USERPROFILE: p.home });
    assert.equal(r.status, 0, `allowed: ${command} (${r.stderr})`);
  } finally { fs.rmSync(p.dir, { recursive: true, force: true }); fs.rmSync(p.home, { recursive: true, force: true }); }
}

// Round 4 (24.x): a subshell cannot hide a write to a protected path.
test("pre-guard: a write wrapped in a subshell that names a protected path is refused (24.1-24.3)", () => {
  for (const command of [
    `(echo '{"disableAllHooks":true}' > .claude/settings.local.json)`,
    `(echo granted > .craftsman/sessions/s1/doc-write)`,
    `true && (cat stage/x > hooks/hooks.json)`,
    `(echo hi > .craftsman/off)`,
    `x=1; (touch .craftsman/off)`,
    `echo $(date) > .claude/settings.local.json`,
    `cat <(echo x) > hooks/hooks.json`,
    `{ (echo x > .craftsman/off); }`,
    `if true; then (echo x > .craftsman/off); fi`,
    `{ cd .claude; cat ../stage/x > settings.local.json; }`,
  ]) assertDenied(command);
  for (const command of ["(cd src && ls)", "(echo hi > notes.txt)", "(cat .craftsman/off)", "(git status)", "(echo hi > src/a.txt)", "x=$(cat hooks/hooks.json); echo $x", "(echo off > notes.txt) && ls"]) assertAllowed(command);
});

// Round 4 (26.x): recursive copies, in-place edits, archive extraction and find -delete that reach a protected path.
const haveTool = (tool) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0;
test("pre-guard: recursive copies, in-place edits, archives and find -delete that reach a protected path are refused (26.1-26.3)", { skip: process.platform === "win32" && "needs a POSIX shell" }, () => {
  const denied = [
    "cp -r stage/.claude .", "cp -rT stage/.claude .claude", "cp -a stage/. .", "cp -r stage/hooks .git/", "cp -R stage/hooks .",
    "sed --in-place s/dark/LIGHT/ .claude/settings.json", "sed --in-place=.bak s/dark/LIGHT/ .claude/settings.json",
    "find .claude -delete", "find . -name settings.json -delete", "find . -name craftsman.config.json -delete",
    "find .claude -name settings.json -exec rm {} +", "find . -name '*.json' -delete", "find hooks -type f -delete",
  ];
  if (haveTool("rsync")) denied.push("rsync -a stage/ ./", "rsync -a stage/.claude/ .claude/");
  if (haveTool("gawk")) denied.push("gawk -i inplace '{sub(\"dark\",\"LIGHT\");print}' .claude/settings.json");
  if (haveTool("patch")) denied.push("patch -p0 .claude/settings.json < stage/x.patch");
  if (haveTool("tar")) denied.push("tar -xf stage/x.tar -C .claude", "tar xf stage/x.tar -C .claude");
  if (haveTool("unzip") && haveTool("zip")) denied.push("unzip -o stage/x.zip -d .claude");
  for (const command of denied) assertDenied(command);
  const allowed = [
    "cp -r src copy", "cp -r stage/.claude /tmp/craftsman-nowhere-out", "cp -r a b", "sed -n 1p .claude/settings.json", "sed --in-place s/a/b/ src/a.txt", "gawk '{print}' .claude/settings.json",
    "find src -name x -print", "find . -name '*.log' -delete", "find build -delete", "find src -type f -delete", "tar -tf stage/x.tar", "tar -xf stage/x.tar -C src",
    "patch --dry-run -p0 .claude/settings.json < stage/x.patch", "ed -V",
  ];
  for (const command of allowed) assertAllowed(command);
});

// Round 4 (32.2): craftsman.project.json can override every config key, so it is protected like craftsman.config.json.
test("pre-guard: craftsman.project.json is self-protected like the config: only a unit scope that names it may change the safety keys (32.2)", () => {
  const dir = selfDisableProject();
  try {
    const project = path.join(dir, "craftsman.project.json");
    fs.writeFileSync(project, JSON.stringify({ stopGate: { markdownTests: ["README.md"] } }) + "\n");
    const write = (sid, doc) => run(GUARD, dir, { session_id: sid, tool_name: "Write", tool_input: { file_path: project, content: JSON.stringify(doc) } }).status;
    assert.equal(write("pc-1", { stopGate: { markdownTests: ["README.md"] }, protectedPaths: [] }), 2, "protectedPaths emptied through the override");
    assert.equal(write("pc-1", { enabled: false }), 2, "enabled false through the override");
    assert.equal(write("pc-1", { docWriteGuard: { enabled: false } }), 2, "doc guard off through the override");
    assert.equal(write("pc-1", { stopGate: { markdownTests: ["README.md", "docs/*.md"] } }), 2, "stopGate is a safety key, so even the list it holds is");
    assert.equal(write("pc-1", { timeoutMs: 5000, stopGate: { markdownTests: ["README.md"] } }), 0, "a key outside the safety list stays editable");
    for (const command of ["echo '{}' > craftsman.project.json", "rm craftsman.project.json", "(echo '{\"enabled\":false}' > craftsman.project.json)", "cp x craftsman.project.json"]) {
      assert.equal(run(GUARD, dir, { session_id: "pc-1", tool_name: "Bash", tool_input: { command } }).status, 2, `blocked: ${command}`);
    }
    assert.equal(typed(dir, "pc-2", "/craftsman:orchestrate docs/plans/p.md").status, 0);
    const manifest = { session_id: "pc-2", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: ["craftsman.project.json"], docs: [], write: ["craftsman.project.json"] } };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    assert.equal(run(GUARD, dir, { session_id: "pc-2", tool_name: "Write", tool_input: { file_path: project, content: JSON.stringify({ protectedPaths: [] }) } }).status, 0, "a scope that names the file may change it");
    const refused = run(SCOPE, dir, { ...manifest, session_id: "pc-3" });
    assert.equal(refused.status, 2, "scope.mjs refuses a manifest that reaches it without /orchestrate or /auto");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Round 4 (29.x): the settings keys that make the sandbox, the permission mode and the process environment, and path comparisons that ignore case.
test("pre-guard: sandbox, permission mode and preload settings are protected, and protected paths compare case-folded (29.1-29.2)", () => {
  const dir = selfDisableProject();
  try {
    fs.mkdirSync(path.join(dir, ".claude"));
    const settings = path.join(dir, ".claude", "settings.json");
    const local = path.join(dir, ".claude", "settings.local.json");
    fs.writeFileSync(settings, '{"theme":"dark","permissions":{"allow":["Bash(ls)"]}}\n');
    const call = (sid, tool, input) => run(GUARD, dir, { session_id: sid, tool_name: tool, tool_input: input });
    const write = (file, doc) => call("sk-1", "Write", { file_path: file, content: JSON.stringify({ theme: "dark", permissions: { allow: ["Bash(ls)"] }, ...doc }) });
    for (const file of [settings, local]) {
      assert.equal(write(file, { sandbox: { enabled: false } }).status, 2, `sandbox in ${file}`);
      assert.equal(write(file, { permissions: { allow: ["Bash(ls)"], defaultMode: "bypassPermissions" } }).status, 2, "permission mode");
      for (const key of ["LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID"]) {
        assert.equal(write(file, { env: { [key]: "/tmp/x" } }).status, 2, `env ${key}`);
      }
      assert.equal(write(file, { permissions: { allow: ["Bash(ls)", "Bash(cat *)"] }, env: { DEBUG: "1", MY_PATH: "x", PATHEXT: ".EXE" } }).status, 0, "unrelated permission and env keys stay editable");
    }
    assert.equal(call("sk-1", "Edit", { file_path: settings, old_string: '"theme":"dark"', new_string: '"theme":"dark","sandbox":{"enabled":false}' }).status, 2, "Edit form");
    // 29.2: the same paths with other capitals (a case-insensitive filesystem reaches them).
    for (const rel of [".Claude/settings.local.json", ".CLAUDE/Settings.json", ".Craftsman/OFF", ".craftsman/Doc-Write-Pending", "Hooks/Hooks.json", "CRAFTSMAN.CONFIG.JSON"]) {
      assert.equal(call("sk-2", "Write", { file_path: path.join(dir, rel), content: '{"disableAllHooks":true,"enabled":false}' }).status, 2, `Write ${rel}`);
    }
    for (const command of ["touch .Craftsman/OFF", "echo x > .CLAUDE/settings.local.json", "cp x Hooks/hooks.json", "(echo x > .Claude/Settings.local.json)", "rm -rf .CRAFTSMAN"]) {
      assert.equal(run(GUARD, dir, { session_id: "sk-2", tool_name: "Bash", tool_input: { command } }).status, 2, `blocked: ${command}`);
    }
    assert.equal(call("sk-2", "Write", { file_path: path.join(dir, "src", "Hooks", "readme.md"), content: "x\n" }).status, 0, "an ordinary file with a protected word in its path stays writable");
    assert.equal(call("sk-2", "Write", { file_path: path.join(dir, "Docs", "x.txt"), content: "x\n" }).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Round 4 (28.x): git reads its hooks path from config it finds through HOME, XDG_CONFIG_HOME and GIT_CONFIG_KEY_n. The routes
// are first proven real (a failing pre-commit hook is skipped), then the guard must refuse each spelling of them.
test("pre-guard: HOME, XDG_CONFIG_HOME and quote-split GIT_CONFIG_KEY routes to a model-written git config are refused (28.1-28.2)", { skip: process.platform === "win32" && "needs a POSIX shell and git hooks" }, () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-hookskip-")));
  try {
    const repo = path.join(root, "repo");
    fs.mkdirSync(repo);
    const gitIn = (args, env = {}) => spawnSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, ...env } });
    gitIn(["init", "-q"]);
    gitIn(["config", "--local", "user.name", "t"]); gitIn(["config", "--local", "user.email", "t@example.com"]); gitIn(["config", "--local", "commit.gpgsign", "false"]);
    fs.writeFileSync(path.join(repo, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const empty = path.join(root, "empty"); fs.mkdirSync(empty);
    const isolated = { HOME: path.join(root, "iso-home"), XDG_CONFIG_HOME: path.join(root, "iso-xdg") };
    fs.mkdirSync(isolated.HOME); fs.mkdirSync(isolated.XDG_CONFIG_HOME);
    const fakeHome = path.join(root, "fakehome"); fs.mkdirSync(fakeHome);
    fs.writeFileSync(path.join(fakeHome, ".gitconfig"), `[core]\n\thooksPath = ${empty}\n`);
    const fakeXdg = path.join(root, "fakexdg"); fs.mkdirSync(path.join(fakeXdg, "git"), { recursive: true });
    fs.writeFileSync(path.join(fakeXdg, "git", "config"), `[core]\n\thooksPath = ${empty}\n`);
    const commit = (env) => gitIn(["commit", "--allow-empty", "-qm", "x"], { ...isolated, ...env }).status;
    assert.notEqual(commit({}), 0, "the failing pre-commit hook blocks a normal commit");
    const works = {
      HOME: commit({ HOME: fakeHome }) === 0,
      XDG: commit({ XDG_CONFIG_HOME: fakeXdg }) === 0,
      KEY: commit({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: empty }) === 0,
    };
    assert.ok(works.HOME, "the HOME route really skips the hook when run unguarded");
    const bash = (command) => run(GUARD, repo, { session_id: "hs", tool_name: "Bash", tool_input: { command } }, { HOME: isolated.HOME, USERPROFILE: isolated.HOME }).status;
    const c = "git commit --allow-empty -qm x";
    const denied = [
      `HOME=${fakeHome} ${c}`, `env HOME=${fakeHome} ${c}`, `export HOME=${fakeHome}; ${c}`, `HOME=${fakeHome}; ${c}`, `HOME=${fakeHome} git rebase main`, `HOME=${fakeHome} git push`,
      `bash -c 'HOME=${fakeHome} ${c}'`, `HOME=${fakeHome} git merge topic`, `HOME=${fakeHome} git am p.patch`,
    ];
    if (works.XDG) denied.push(`XDG_CONFIG_HOME=${fakeXdg} ${c}`, `env XDG_CONFIG_HOME=${fakeXdg} git push`);
    denied.push(`GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hoo""ksPath GIT_CONFIG_VALUE_0=${empty} ${c}`, `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=includ""e.path GIT_CONFIG_VALUE_0=/tmp/g ${c}`);
    for (const command of denied) assert.equal(bash(command), 2, `denied: ${command}`);
    const allowed = [
      `HOME=${fakeHome} git status`, `HOME=/dev/null ${c}`, `XDG_CONFIG_HOME=/dev/null ${c}`, 'git commit -m "HOME=x"', "echo HOME=x", "echo $HOME",
      `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=x ${c}`, `HOME=${fakeHome} ls`, c,
    ];
    for (const command of allowed) assert.equal(bash(command), 0, `allowed: ${command}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// Round 4 (27.x): a dangling symlink must not be a way to create a protected file.
test("pre-guard: a dangling symlink cannot be written through, and ln refuses a link to a protected path (27.1-27.2)", { skip: process.platform === "win32" && "symlinks need privileges" }, () => {
  const probe = attackProject();
  try {
    fs.symlinkSync(".claude/settings.local.json", path.join(probe.dir, "x.json"));
    assert.equal(fs.existsSync(path.join(probe.dir, ".claude", "settings.local.json")), false, "the link dangles");
    fs.writeFileSync(path.join(probe.dir, "x.json"), '{"disableAllHooks":true}');
    assert.equal(fs.existsSync(path.join(probe.dir, ".claude", "settings.local.json")), true, "the attack is real: a Write through the dangling link creates the protected file");
  } finally { fs.rmSync(probe.dir, { recursive: true, force: true }); fs.rmSync(probe.home, { recursive: true, force: true }); }

  const p = attackProject();
  try {
    fs.symlinkSync(".claude/settings.local.json", path.join(p.dir, "x.json"));
    fs.symlinkSync("x.json", path.join(p.dir, "y.json")); // a chain of two dangling links
    fs.symlinkSync("src/new.txt", path.join(p.dir, "ok.json"));
    fs.symlinkSync(".craftsman/off", path.join(p.dir, "z.json"));
    const write = (rel) => run(GUARD, p.dir, { session_id: "dl", tool_name: "Write", tool_input: { file_path: path.join(p.dir, rel), content: '{"disableAllHooks":true}' } }, { HOME: p.home, USERPROFILE: p.home }).status;
    assert.equal(write("x.json"), 2, "Write through a dangling link to settings.local.json");
    assert.equal(write("y.json"), 2, "a chain of dangling links");
    assert.equal(write("z.json"), 2, "a dangling link to the off flag");
    assert.equal(write("ok.json"), 0, "a dangling link to an ordinary new file stays writable");
    const bash = (command) => run(GUARD, p.dir, { session_id: "dl", tool_name: "Bash", tool_input: { command } }, { HOME: p.home, USERPROFILE: p.home }).status;
    for (const command of [`ln -s .clau""de/settings.local.json w.json`, "ln -s hooks/hooks.json h.json", "ln -s .git/hooks/pre-commit p", "ln -s ../.claude/settings.json src/s.json", "ln hooks/hooks.json hard.json", "ln -s .craftsman/off o.json"]) {
      assert.equal(bash(command), 2, `blocked: ${command}`);
      assert.equal(fs.readdirSync(p.dir).filter((n) => ["w.json", "h.json", "p", "hard.json", "o.json"].includes(n)).length, 0, "the guard ran instead of the command");
    }
    for (const command of ["ln -s src/a.txt src/b", "ln -s /tmp/craftsman-nowhere out.link", "ln -s a.txt b.txt"]) assert.equal(bash(command), 0, `allowed: ${command}`);
  } finally { fs.rmSync(p.dir, { recursive: true, force: true }); fs.rmSync(p.home, { recursive: true, force: true }); }
});
