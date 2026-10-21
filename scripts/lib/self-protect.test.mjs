import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SELF_SCOPED, namesSelfScoped } from "./self-protect.mjs";

test("self-protect: the self-scoped list is the hooks, the config and both settings files", () => {
  assert.deepEqual([...SELF_SCOPED], ["hooks/hooks.json", "craftsman.config.json", ".claude/settings.json", ".claude/settings.local.json"]);
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
  assert.deepEqual(hits(["*.json"]), ["craftsman.config.json"]);
  assert.deepEqual(hits(["hooks"]), ["hooks/hooks.json"]);
  assert.deepEqual(hits(["."]), [...SELF_SCOPED]);
});

test("self-protect: ordinary write entries name nothing", () => {
  for (const entry of ["src/a.ts", "scripts/pre-guard.mjs", "docs/plans/p.md", "scripts/*.mjs", "hooks/register.js", ".claudeignore"]) {
    assert.deepEqual(namesSelfScoped([entry]), [], entry);
  }
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
