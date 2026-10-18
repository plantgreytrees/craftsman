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
    assert.equal(run(DOC_WRITE, dir, {}).status, 0);
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
    assert.equal(run(DOC_WRITE, main, {}).status, 0);
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
    assert.equal(run(DOC_WRITE, main, {}).status, 0);
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
    assert.equal(run(DOC_WRITE, dir, {}).status, 0);
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
    assert.equal(run(DOC_WRITE, dir, {}).status, 0);
    for (const command of RM_FORMS) assert.equal(bash(command).status, 0, `granted: ${command}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: shell keywords, more wrappers and unseen-argument removals fail closed (12.1, 12.2)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-bypass-"));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    const bash = (command) => run(GUARD, dir, { session_id: "bypass-forms", tool_name: "Bash", tool_input: { command } });
    const forms = [
      "if true; then rm docs/plans/x.md; fi", "! rm docs/plans/x.md", "for x in a; do rm docs/plans/x.md; done",
      "nice rm docs/plans/x.md", "nice -n 5 rm docs/plans/x.md", "timeout 5 rm docs/plans/x.md", "timeout -s KILL 5 rm docs/plans/x.md",
      "busybox rm docs/plans/x.md", "stdbuf -oL rm docs/plans/x.md", "ionice -c 3 rm docs/plans/x.md", "find -name x.md -delete",
      "git ls-files | xargs rm", "xargs rm < list", "xargs -a list rm", "git ls-files | xargs unlink", "rm -rf ~", "rm -rf \"$PWD/docs\"", "rm -rf $HOME/x",
      "rm -rf $(git rev-parse --show-toplevel)/docs", "rm -rf `pwd`/docs", "rm -rf \"$(pwd)/docs\"",
      "for f in docs/plans/*.md; do rm \"$f\"; done",
    ];
    for (const command of forms) assert.equal(bash(command).status, 2, `blocked: ${command}`);
    for (const command of ["rm -rf \"$TMPDIR/x\"", "echo a | xargs echo", "echo a | xargs rm", "nice ls docs", "timeout 5 ls", "find -name x -print",
      "if true; then ls; fi", "for f in a b; do rm \"$f\"; done"]) {
      assert.equal(bash(command).status, 0, `stays allowed: ${command}`);
    }
    assert.equal(run(DOC_WRITE, dir, {}).status, 0);
    for (const command of forms) assert.equal(bash(command).status, 0, `granted: ${command}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
    assert.equal(run(DOC_WRITE, dir, {}).status, 0);
    for (const command of [...allowedForms, ...blockedForms]) assert.equal(bash(command).status, 0, `granted: ${command}`);
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

function grantedPair(prefix, sid, setup, blocked, allowedForms = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs", "other"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    setup?.(dir);
    const bash = (command) => run(GUARD, dir, { session_id: sid, tool_name: "Bash", tool_input: { command } });
    for (const c of blocked) assert.equal(bash(c).status, 2, `blocked: ${c}`);
    for (const c of allowedForms) assert.equal(bash(c).status, 0, `allowed: ${c}`);
    assert.equal(run(DOC_WRITE, dir, {}).status, 0);
    for (const c of [...blocked, ...allowedForms]) assert.equal(bash(c).status, 0, `granted: ${c}`);
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
  ], ["find . -name '*.log' -delete", "find . -type f -name '*.o' -exec rm {} +"]);
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
  ], ['f=build/x; rm "$f"']);
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

test("pre-guard: find -exec rm checks its literal words (17.3)", () => {
  grantedPair("craftsman-exec17-", "exec17", null, [
    "find . -name '*.log' -exec rm -rf docs \\;", "find . -name '*.log' -exec rm {} docs/plans/x.md +",
  ], ["find . -name '*.log' -exec rm {} +"]);
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
  ], ['f=build/x; rm "$f"']);
});

test("pre-guard: coproc, function and exec -a run the command they wrap (18.2)", () => {
  grantedPair("craftsman-coproc18-", "coproc18", null, [
    "coproc foo { rm docs/plans/x.md; }", "function f { rm docs/plans/x.md; }; f", "exec -a name rm docs/plans/x.md", "coproc rm docs/plans/x.md",
    "unlink ~/x", 'unlink "$PWD/docs/plans/x.md"', "unlink $(pwd)/docs/plans/x.md", "mv ~/x /tmp/y", 'mv "$PWD/docs" /tmp/y', "mv $(pwd)/docs /tmp/y",
  ]);
});
