import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SELF_SCOPED, SELF_NEVER, SAFETY_CONFIG_KEYS, SAFETY_ENV, WRITER_VERBS, NEVER_TEXT, heldNever, heldScoped, namesProtected, namesSelfScoped, realEntries, safetyProjection } from "./self-protect.mjs";
import os from "node:os";
import path from "node:path";
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
  assert.deepEqual([...WRITER_VERBS].sort(), ["cp", "dd", "install", "ln", "mkdir", "mv", "perl", "sed", "tee", "touch", "truncate"]);
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

test("self-protect: scope.mjs and pre-guard.mjs import the list; no second copy remains", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  for (const file of ["../scope.mjs", "../pre-guard.mjs"]) {
    const source = read(file);
    assert.match(source, /from "\.\/lib\/self-protect\.mjs"/, file);
    assert.doesNotMatch(source, /const SELF_SCOPED\s*=/, `${file} keeps no copy of the list`);
  }
  assert.doesNotMatch(read("../scope.mjs"), /"hooks\/hooks\.json",\s*"craftsman\.config\.json"/);
});
