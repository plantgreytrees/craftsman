import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SELF_SCOPED, SELF_NEVER, SAFETY_CONFIG_KEYS, SAFETY_ENV, WRITER_VERBS, NEVER_TEXT, heldNever, heldScoped, namesProtected, namesSelfScoped, realEntries, safetyProjection, gitCommonDir, commonRel } from "./self-protect.mjs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { globToRe } from "./core.mjs";

test("self-protect: the self-scoped list is the hooks, the config and both settings files", () => {
  assert.deepEqual([...SELF_SCOPED], ["hooks/hooks.json", "craftsman.config.json", "craftsman.project.json", ".claude/settings.json", ".claude/settings.local.json"]);
});

test("self-protect: namesSelfScoped matches exact names, suffixes, directories and globs", () => {
  const hits = (entries) => namesSelfScoped(entries);
  assert.deepEqual(hits(["hooks/hooks.json"]), ["hooks/hooks.json"]);
  assert.deepEqual(hits(["pkg/hooks/hooks.json"]), ["hooks/hooks.json"]);
  assert.deepEqual(hits(["./craftsman.config.json"]), ["craftsman.config.json"]);
  assert.deepEqual(hits([".claude/settings.json"]), [".claude/settings.json"]);
  assert.deepEqual(hits(["**"]), [...SELF_SCOPED]);
  assert.deepEqual(hits([".claude/**"]), [".claude/settings.json", ".claude/settings.local.json"]);
  assert.deepEqual(hits([".claude/*"]), [".claude/settings.json", ".claude/settings.local.json"]);
  assert.deepEqual(hits([".claude"]), [".claude/settings.json", ".claude/settings.local.json"]);
  assert.deepEqual(hits(["*.json"]), ["craftsman.config.json", "craftsman.project.json"]);
  assert.deepEqual(hits(["hooks"]), ["hooks/hooks.json"]);
  assert.deepEqual(hits(["."]), [...SELF_SCOPED]);
});

test("self-protect: SELF_NEVER holds the craftsman markers, the scope files and git's own config and hooks", () => {
  for (const p of [".craftsman/off", ".craftsman/doc-write-pending", ".craftsman/sessions/**/doc-write", ".craftsman/sessions/**/scope*", "**/.git/config", "**/.git/hooks/**"]) {
    assert.ok(SELF_NEVER.includes(p), p);
  }
  const hit = (rel) => SELF_NEVER.some((p) => globToRe(p).test(rel));
  for (const rel of [".git/config", "a/b/.git/config", ".git/hooks/pre-commit", ".git/config.worktree"]) assert.ok(hit(rel), rel);
  for (const rel of [".gitignore", ".git/HEAD", "src/git/config", ".github/hooks/x"]) assert.ok(!hit(rel), rel);
});

test("self-protect: a linked worktree's own git config in the main .git is held too", () => {
  const hit = (rel) => SELF_NEVER.some((p) => globToRe(p).test(rel));
  for (const rel of [".git/worktrees/wt/config.worktree", ".git/worktrees/wt/config", "a/.git/worktrees/x y/config.worktree"]) assert.ok(hit(rel), rel);
  for (const rel of [".git/worktrees/wt/HEAD", ".git/worktrees/wt/gitdir", "src/worktrees/wt/config"]) assert.ok(!hit(rel), rel);
  for (const text of [".git/worktrees/wt/config.worktree", ".git/worktrees/wt/config"]) assert.match(text, NEVER_TEXT, text);
});

test("self-protect: NEVER_TEXT is derived from SELF_NEVER and catches every spelling of a never-written path (18.3)", () => {
  for (const text of [".craftsman/off", "x > .craftsman/off", ".craftsman/doc-write-pending", ".craftsman/sessions/s1/doc-write", ".craftsman/sessions/s1/commands.json",
    ".craftsman/sessions/a/b/goal-tokens.json", ".craftsman/sessions/s1/scope-abc.json", ".craftsman/sessions/s1/x-worktree-binding.json", ".git/config", "a/b/.git/config",
    ".git/hooks/pre-commit", ".git/config.worktree"]) assert.match(text, NEVER_TEXT, text);
  for (const text of [".craftsman/offline", ".craftsman/off.bak", ".craftsman/sessions/s1/notes.md", "git config user.name x", ".gitignore", ".git/HEAD", "src/git/config"]) {
    assert.doesNotMatch(text, NEVER_TEXT, text);
  }
});

test("self-protect: heldNever and heldScoped say which directories hold a protected path (18.2)", () => {
  for (const rel of [".craftsman", ".craftsman/sessions", ".craftsman/sessions/s1", ".craftsman/off", ".git", ".git/hooks", "./.craftsman/"]) assert.equal(heldNever(rel), true, rel);
  for (const rel of ["build", "src", "src/deep", ".craftsman/tmp-notes", ".gitignore", "node_modules", ".", "", "..", "../x"]) assert.equal(heldNever(rel), false, rel);
  assert.deepEqual(heldScoped("hooks"), ["hooks/hooks.json"]);
  assert.deepEqual(heldScoped(".claude"), [".claude/settings.json", ".claude/settings.local.json"]);
  assert.deepEqual(heldScoped("craftsman.config.json"), ["craftsman.config.json"]);
  assert.deepEqual(heldScoped("hooks/hooks.json"), ["hooks/hooks.json"]);
  for (const rel of ["src", "a.txt", "pkg", ".claude/commands", "docs", "."]) assert.deepEqual(heldScoped(rel), [], rel);
});

test("self-protect: pre-guard keeps one writer-verb list and no hand-copied path regex (18.3)", () => {
  const source = fs.readFileSync(new URL("../pre-guard.mjs", import.meta.url), "utf8");
  assert.deepEqual([...WRITER_VERBS].sort(), ["cp", "dd", "install", "link", "ln", "mkdir", "mv", "perl", "sed", "tee", "touch", "truncate"]);
  assert.doesNotMatch(source, /new Set\(\["touch"/, "no second verb list");
  assert.doesNotMatch(source, /\(\?:touch\|tee\|/, "no verb alternation typed out");
  assert.doesNotMatch(source, /\\\.craftsman\\\/\(\?:off\|doc-write-pending\)/, "the path regex is not hand-copied");
  assert.match(source, /NEVER_TEXT\.test\(command\)/);
});

test("self-protect: realEntries follows the symlinks in a write entry's literal directory prefix (19.2)", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-real-")));
  try {
    fs.mkdirSync(path.join(root, ".claude"));
    fs.mkdirSync(path.join(root, "src"));
    fs.symlinkSync(".claude", path.join(root, "c"));
    fs.symlinkSync("src", path.join(root, "s"));
    fs.symlinkSync("/tmp", path.join(root, "out"));
    assert.deepEqual(realEntries(["c/**", "c/settings.json", "c/*", "c", "s/a.txt", "src/a.txt", "out/x", "plain.txt", "gone/x/**"], root),
      [".claude/**", ".claude/settings.json", ".claude/*", ".claude", "src/a.txt"], "a link that leaves the project and unchanged entries are not returned");
    assert.deepEqual(namesSelfScoped(["c/**", ...realEntries(["c/**"], root)]), [".claude/settings.json", ".claude/settings.local.json"]);
    assert.deepEqual(realEntries("not an array", root), []);
    assert.deepEqual(realEntries(["c/**"], path.join(root, "missing")), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("self-protect: namesProtected reads a command's de-quoted words for craftsman state (24.1)", () => {
  for (const text of ["(echo x > .claude/settings.local.json)", "(cd .craftsman && touch off)", "(echo y > hooks/hooks.json)", "cp x .craft\"\"sman/off", "(tee commands.json)",
    "x > craftsman.config.json", "(touch .craftsman/sessions/s1/doc-write)", "(echo > .git/hooks/pre-commit)"]) assert.equal(namesProtected(text), true, text);
  for (const text of ["(cd src && ls)", "(echo off > notes.txt)", "(echo hi > src/a.txt)", "git status", "(cat README.md)", "echo hooks", "(cp a b)"]) assert.equal(namesProtected(text), false, text);
});

test("self-protect: path comparisons are case-folded, and the settings projection holds sandbox and the permission mode (29.1-29.2)", () => {
  for (const rel of [".CRAFTSMAN/Off", ".Craftsman/sessions/S1/Doc-Write", ".GIT/hooks/Pre-Commit", ".Craftsman"]) assert.equal(heldNever(rel), true, rel);
  assert.deepEqual(heldScoped("HOOKS"), ["hooks/hooks.json"]);
  assert.deepEqual(heldScoped(".Claude"), [".claude/settings.json", ".claude/settings.local.json"]);
  assert.deepEqual(namesSelfScoped(["HOOKS/Hooks.json"]), ["hooks/hooks.json"]);
  assert.deepEqual(namesSelfScoped([".CLAUDE/**"]), [".claude/settings.json", ".claude/settings.local.json"]);
  for (const text of [".Craftsman/OFF", "x > .CRAFTSMAN/Doc-Write-Pending", ".GIT/Config"]) assert.match(text, NEVER_TEXT, text);
  assert.equal(namesProtected("(echo x > .Claude/Settings.Local.json)"), true);
  assert.equal(namesProtected("(echo x > Docs/x.txt)"), false);
  const projection = safetyProjection(".Claude/settings.json", { sandbox: { enabled: true }, permissions: { defaultMode: "default", allow: ["Bash(ls)"] }, theme: "dark" });
  assert.deepEqual(projection.sandbox, { enabled: true });
  assert.equal(projection.defaultMode, "default");
  assert.equal(JSON.stringify(projection).includes("Bash(ls)"), false, "permissions.allow is not part of the projection");
});

test("self-protect: ordinary write entries name nothing", () => {
  for (const entry of ["src/a.ts", "scripts/pre-guard.mjs", "docs/plans/p.md", "scripts/*.mjs", "hooks/register.js", ".claudeignore"]) {
    assert.deepEqual(namesSelfScoped([entry]), [], entry);
  }
});

test("self-protect: every safety config key exists in the shipped config and the env pattern matches what it should", () => {
  const shipped = JSON.parse(fs.readFileSync(new URL("../../craftsman.config.json", import.meta.url), "utf8"));
  for (const key of SAFETY_CONFIG_KEYS) {
    const value = key.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), shipped);
    assert.notEqual(value, undefined, `${key} is a real key of craftsman.config.json`);
  }
  for (const name of ["NODE_OPTIONS", "NODE_PATH", "PATH", "CLAUDE_PLUGIN_ROOT", "CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID", "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "CRAFTSMAN", "CRAFTSMAN_SAFETY", "craftsman_x", "path"]) assert.match(name, SAFETY_ENV, name);
  for (const name of ["DEBUG", "MY_PATH", "NODE_ENV", "PATHEXT", "LD_DEBUG", "DYLD", "CLAUDE_MODEL"]) assert.doesNotMatch(name, SAFETY_ENV, name);
});

test("self-protect: safetyProjection reads dotted keys and the settings env", () => {
  const cfg = safetyProjection("craftsman.config.json", { execution: { agentMode: "root-only", maxSubagents: 2 }, enabled: true });
  assert.equal(cfg["execution.agentMode"], "root-only");
  assert.equal(cfg.enabled, true);
  assert.equal(cfg["execution.engine"], null);
  const st = safetyProjection(".claude/settings.json", { env: { NODE_OPTIONS: "x", DEBUG: "1" } });
  assert.deepEqual(st.env, { NODE_OPTIONS: "x" });
});

test("self-protect: the approval gate keys are safety keys, each resolves in the shipped config, and flipping either changes the projection", () => {
  const shipped = JSON.parse(fs.readFileSync(new URL("../../craftsman.config.json", import.meta.url), "utf8"));
  for (const key of ["repoExec.approval.required", "planning.featureBranches"]) {
    assert.ok(SAFETY_CONFIG_KEYS.includes(key), `${key} is listed`);
    const value = key.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), shipped);
    assert.equal(typeof value, "boolean", `${key} is a real boolean key of craftsman.config.json`);
  }
  const base = { repoExec: { approval: { required: true, prLines: 400 } }, planning: { featureBranches: true } };
  const proj = (c) => JSON.stringify(safetyProjection("craftsman.config.json", c));
  assert.notEqual(proj(base), proj({ ...base, repoExec: { approval: { required: false, prLines: 400 } } }));
  assert.notEqual(proj(base), proj({ ...base, planning: { featureBranches: false } }));
  assert.equal(proj(base), proj({ ...base, repoExec: { approval: { required: true, prLines: 10 } } }), "prLines stays editable");
});

test("self-protect: scope.mjs and pre-guard.mjs import the list; no second copy remains", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  for (const file of ["../scope.mjs", "../pre-guard.mjs"]) {
    const source = read(file);
    assert.match(source, /from "\.\/lib\/self-protect\.mjs"/, file);
    assert.doesNotMatch(source, /const SELF_SCOPED\s*=/, `${file} keeps no copy of the list`);
  }
  assert.doesNotMatch(read("../scope.mjs"), /"hooks\/hooks\.json",\s*"craftsman\.config\.json"/);
});

test("self-protect: SELF_NEVER holds the approval record directory", () => {
  assert.ok(SELF_NEVER.includes(".craftsman/approvals/**"));
  assert.ok(SELF_NEVER.some((p) => globToRe(p).test(".craftsman/approvals/x.json")));
});

test("self-protect: a submodule's network queue under the superproject's .git/modules is a never-written path (ARCH-SAFETY-13)", () => {
  assert.ok(SELF_NEVER.includes("**/.git/modules/**/.craftsman/network/**"));
  const hit = (rel) => SELF_NEVER.some((p) => globToRe(p).test(rel));
  for (const rel of [".git/.craftsman/network/queue.jsonl", ".git/modules/sub/.craftsman/network/queue.jsonl", "a/b/.git/modules/sub/.craftsman/network/fetched.json",
    ".git/modules/libs/foo/.craftsman/network/queue.jsonl", ".git/modules/sub/modules/inner/.craftsman/network/queue.jsonl"]) assert.ok(hit(rel), rel);
  for (const rel of [".git/modules/sub/HEAD", ".git/modules/sub/.craftsman/notes.md", ".git/modules/sub/config.bak", "src/modules/sub/.craftsman/network/queue.jsonl", ".git/modulesx/sub/.craftsman/network/q"]) assert.ok(!hit(rel), rel);
  for (const text of [".git/modules/sub/.craftsman/network/queue.jsonl", "../.git/modules/sub/.craftsman/network/queue.jsonl", "/r/super/.git/modules/a/b/.craftsman/network/fetched.json", ".GIT/Modules/sub/.Craftsman/Network/queue.jsonl"]) assert.match(text, NEVER_TEXT, text);
  for (const text of [".git/modules/sub/HEAD", ".git/modules/sub/.craftsman/notes.md", "src/modules/sub/.craftsman/network.md"]) assert.doesNotMatch(text, NEVER_TEXT, text);
});

test("self-protect: heldNever holds the queue's parent directories, so a forged one cannot take their place (ARCH-SAFETY-13)", () => {
  for (const rel of [".git/.craftsman", ".git/.craftsman/network", "./.git/.craftsman/", "vendor/.git/.craftsman", ".GIT/.Craftsman", ".git/modules", "a/b/.git/modules"]) assert.equal(heldNever(rel), true, rel);
  for (const rel of ["docs", "src", "src/.github", ".github", ".gitignore", ".gitmodules", "modules", "src/modules", ".git/modulesx", "src/.craftsman", "src/.craftsman/network", ".craftsman-notes", ".git/HEAD", ".git/refs", ".git/index.lock", "."]) assert.equal(heldNever(rel), false, rel);
});

test("self-protect: heldNever holds everything under .git/modules, where a submodule's name path may lead to a queue (ARCH-SAFETY-13)", () => {
  for (const rel of [".git/modules/sub", ".git/modules/sub/.craftsman", ".git/modules/sub/.craftsman/network", ".git/modules/libs/foo", ".git/modules/sub/modules/inner/.craftsman", "a/.git/modules/sub", ".Git/Modules/Sub"]) assert.equal(heldNever(rel), true, rel);
  for (const rel of [".git/modulesx/sub", "modules/sub", "src/modules/sub", ".git/refs/modules/x", ".git/objects", "sub", "sub/.craftsman"]) assert.equal(heldNever(rel), false, rel);
});

test("self-protect: commonRel spells a path under a git dir the way a session at the superproject would, and the patterns hold those names (ARCH-SAFETY-13)", () => {
  const sub = "/r/super/.git/modules/sub", queue = `${sub}/.craftsman/network/queue.jsonl`;
  assert.equal(commonRel(sub, queue), ".git/modules/sub/.craftsman/network/queue.jsonl");
  assert.equal(commonRel("/r/main/.git", "/r/main/.git/.craftsman/network/queue.jsonl"), ".git/.craftsman/network/queue.jsonl");
  assert.equal(commonRel("/r/super/.git/modules/sub/modules/inner", "/r/super/.git/modules/sub/modules/inner/.craftsman/network/queue.jsonl"), ".git/modules/sub/modules/inner/.craftsman/network/queue.jsonl");
  // the git dir, the store above it and the .git above that are all inside the .git that holds the git dir
  assert.deepEqual([sub, "/r/super/.git/modules", "/r/super/.git"].map((abs) => commonRel(sub, abs)), [".git/modules/sub", ".git/modules", ".git"]);
  // a git dir under no .git (a bare or a separate one) is named as if it were one
  assert.equal(commonRel("/srv/proj.git", "/srv/proj.git/.craftsman/network/queue.jsonl"), ".git/.craftsman/network/queue.jsonl");
  // compared case-folded, as the patterns are
  assert.equal(commonRel(sub, "/R/Super/.GIT/Modules/Sub/.Craftsman/Network/queue.jsonl"), ".git/modules/sub/.craftsman/network/queue.jsonl");
  // outside that .git, and nothing to compare with: no name
  for (const abs of ["/r/super", "/r/super/sub/a.txt", "/r/super/.gitx/x", "/r/super/.git-notes", "/r/sub-wt/b.txt", "/tmp/x"]) assert.equal(commonRel(sub, abs), null, abs);
  assert.equal(commonRel(null, queue), null);
  assert.equal(commonRel("", queue), null);
  // the names it gives are the ones the patterns hold: written is never, removed is held; the other files of the git dir are not never-written
  assert.ok(SELF_NEVER.some((p) => globToRe(p).test(commonRel(sub, queue))));
  for (const gone of [sub, "/r/super/.git/modules", "/r/super/.git", `${sub}/.craftsman`, `${sub}/.craftsman/network`, queue]) assert.equal(heldNever(commonRel(sub, gone)), true, gone);
  for (const ordinary of [`${sub}/info/exclude`, `${sub}/description`, `${sub}/HEAD`]) assert.ok(!SELF_NEVER.some((p) => globToRe(p).test(commonRel(sub, ordinary))), ordinary);
});

test("self-protect: gitCommonDir finds the common dir of a main checkout, a linked worktree and a submodule's linked worktree, and fails open outside a repository (ARCH-SAFETY-13)", () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-common-dir-")));
  try {
    const git = (dir, ...args) => spawnSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "protocol.file.allow=always", ...args], { encoding: "utf8" });
    const make = (dir) => { fs.mkdirSync(dir); git(dir, "init", "-q"); git(dir, "commit", "-q", "--allow-empty", "-m", "init"); };
    const main = path.join(base, "main"), origin = path.join(base, "origin"), sup = path.join(base, "super");
    for (const dir of [main, origin, sup]) make(dir);
    assert.equal(git(main, "worktree", "add", "-q", "-b", "feat/a", path.join(base, "main-wt")).status, 0);
    assert.equal(git(sup, "submodule", "add", "-q", origin, "sub").status, 0);
    const sub = path.join(sup, "sub");
    assert.equal(git(sub, "worktree", "add", "-q", "-b", "feat/in", path.join(sub, ".claude", "worktrees", "wt")).status, 0);
    assert.equal(git(sub, "worktree", "add", "-q", "-b", "feat/beside", path.join(base, "sub-wt")).status, 0);
    const mainGit = path.join(main, ".git"), subGit = path.join(sup, ".git", "modules", "sub");
    assert.equal(gitCommonDir(main), mainGit);
    assert.equal(gitCommonDir(path.join(base, "main-wt")), mainGit);
    for (const dir of [sub, path.join(sub, ".claude", "worktrees", "wt"), path.join(base, "sub-wt")]) assert.equal(gitCommonDir(dir), subGit, dir);
    assert.equal(gitCommonDir(main), mainGit, "asked again");
    const plain = path.join(base, "plain");
    fs.mkdirSync(plain);
    assert.equal(gitCommonDir(plain), null, "not a repository");
    assert.equal(gitCommonDir(path.join(base, "missing")), null, "no such directory");
    // a linked worktree of the submodule names the queue under the store the superproject would
    assert.equal(commonRel(gitCommonDir(path.join(base, "sub-wt")), path.join(subGit, ".craftsman", "network", "queue.jsonl")), ".git/modules/sub/.craftsman/network/queue.jsonl");
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test("self-protect: a submodule's config, config.worktree, hooks and linked worktrees' config under .git/modules are never-written paths (ARCH-SAFETY-13, ARCH-SAFETY-15)", () => {
  for (const p of ["**/.git/modules/**/config", "**/.git/modules/**/config.worktree", "**/.git/modules/**/hooks/**", "**/.git/modules/**/worktrees/*/config*"]) assert.ok(SELF_NEVER.includes(p), p);
  const hit = (rel) => SELF_NEVER.some((p) => globToRe(p).test(rel));
  for (const rel of [".git/modules/sub/config", ".git/modules/sub/config.worktree", ".git/modules/sub/hooks/pre-push", ".git/modules/sub/hooks/sub/dir/x", "a/b/.git/modules/sub/config",
    ".git/modules/libs/foo/config", ".git/modules/libs/foo/hooks/post-merge", ".git/modules/sub/modules/inner/config", ".git/modules/sub/modules/inner/hooks/pre-commit",
    ".git/modules/sub/worktrees/wt/config", ".git/modules/sub/worktrees/wt/config.worktree", ".git/modules/sub/worktrees/x y/config", ".git/modules/sub/modules/inner/worktrees/wt/config"]) assert.ok(hit(rel), rel);
  for (const rel of [".git/modules/sub/HEAD", ".git/modules/sub/config.bak", ".git/modules/sub/configx", ".git/modules/sub/hooksx/pre-push", ".git/modules/sub/info/exclude", ".git/modules/sub/worktrees/wt/HEAD",
    ".git/modules/sub/worktrees/wt/gitdir", ".git/modules/sub/worktrees/wt/configs/x", "src/modules/sub/config", "src/modules/sub/hooks/x", ".git/modulesx/sub/config", ".github/modules/sub/config"]) assert.ok(!hit(rel), rel);
  for (const text of [".git/modules/sub/config", "../.git/modules/sub/config.worktree", "/r/super/.git/modules/a/b/hooks/pre-push", ".git/modules/sub/worktrees/wt/config", ".GIT/Modules/Sub/Hooks/Pre-Push"]) assert.match(text, NEVER_TEXT, text);
  for (const text of [".git/modules/sub/HEAD", ".git/modules/sub/config.bak", "src/modules/sub/config", ".git/modules/sub/hooksx/a", ".git/modules/sub/worktrees/wt/HEAD"]) assert.doesNotMatch(text, NEVER_TEXT, text);
});

test("self-protect: a queue under a superproject's linked worktree, .git/worktrees/<wt>/modules/<name>, is a never-written path (ARCH-SAFETY-13)", () => {
  assert.ok(SELF_NEVER.includes("**/.git/worktrees/*/modules/**/.craftsman/network/**"));
  const hit = (rel) => SELF_NEVER.some((p) => globToRe(p).test(rel));
  for (const rel of [".git/worktrees/wt/modules/sub/.craftsman/network/queue.jsonl", "a/b/.git/worktrees/wt/modules/sub/.craftsman/network/fetched.json", ".git/worktrees/x y/modules/libs/foo/.craftsman/network/queue.jsonl",
    ".git/worktrees/wt/modules/sub/modules/inner/.craftsman/network/queue.jsonl"]) assert.ok(hit(rel), rel);
  for (const rel of [".git/worktrees/wt/modules/sub/HEAD", ".git/worktrees/wt/modules/sub/.craftsman/notes.md", ".git/worktrees/wt/HEAD", ".git/worktrees/wt/modules", "src/worktrees/wt/modules/sub/.craftsman/network/queue.jsonl",
    ".git/worktreesx/wt/modules/sub/.craftsman/network/queue.jsonl"]) assert.ok(!hit(rel), rel);
  for (const text of [".git/worktrees/wt/modules/sub/.craftsman/network/queue.jsonl", "/r/super/.git/worktrees/wt/modules/a/b/.craftsman/network/fetched.json", ".GIT/Worktrees/Wt/Modules/Sub/.Craftsman/Network/queue.jsonl"]) assert.match(text, NEVER_TEXT, text);
  for (const text of [".git/worktrees/wt/modules/sub/HEAD", ".git/worktrees/wt/modules/sub/.craftsman/notes.md", "src/worktrees/wt/modules/sub/.craftsman/network.md"]) assert.doesNotMatch(text, NEVER_TEXT, text);
  // the name a session gives it is the one the pattern holds: the git dir of a submodule in a superproject's linked worktree sits under the superproject's .git/worktrees
  const wtGitDir = "/r/super/.git/worktrees/wt/modules/sub", queue = `${wtGitDir}/.craftsman/network/queue.jsonl`;
  assert.equal(commonRel(wtGitDir, queue), ".git/worktrees/wt/modules/sub/.craftsman/network/queue.jsonl");
  assert.ok(SELF_NEVER.some((p) => globToRe(p).test(commonRel(wtGitDir, queue))));
});

test("self-protect: heldNever holds the parents of the submodule git surface, so a forged directory cannot take their place (ARCH-SAFETY-13)", () => {
  for (const rel of [".git/modules/sub/hooks", ".git/modules/sub/hooks/pre-push", ".git/modules/sub/worktrees", ".git/modules/sub/worktrees/wt", ".git/modules/sub/worktrees/wt/config", ".git/modules/sub/config", ".git/modules/sub/config.worktree",
    ".git/worktrees", ".git/worktrees/wt", ".git/worktrees/wt/modules", ".git/worktrees/wt/modules/sub", ".git/worktrees/wt/modules/sub/.craftsman", ".git/worktrees/wt/modules/sub/.craftsman/network",
    ".git/worktrees/wt/modules/sub/.craftsman/network/queue.jsonl", ".git/worktrees/wt/modules/libs/foo", "a/b/.git/worktrees/wt/modules/sub/.craftsman", ".Git/Worktrees/Wt/Modules/Sub/.Craftsman"]) assert.equal(heldNever(rel), true, rel);
  for (const rel of ["worktrees", "worktrees/wt", "src/worktrees/wt/modules", "src/worktrees/wt/modules/sub/.craftsman", ".git/worktreesx", ".git/worktreesx/wt/modules", ".claude/worktrees", ".claude/worktrees/wt", ".worktrees/wt"]) assert.equal(heldNever(rel), false, rel);
});
