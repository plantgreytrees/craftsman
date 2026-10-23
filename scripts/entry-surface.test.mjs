// ARCH-SLIM-12: a command flagged disable-model-invocation is a user-only
// entry. If any other command, shared doc, agent, workflow or hook still
// invokes it, flagging it would break that call - so this fails instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["commands", "agents", "workflows", "hooks"];

const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .filter((d) => d.isFile() && !/\.test\.[mc]?[jt]s$/.test(d.name))
  .map((d) => `${dir}/${d.name}`);

export function flaggedCommands(root = ROOT) {
  const dir = path.join(root, "commands");
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .filter((f) => /^disable-model-invocation:\s*true\s*$/m.test(fs.readFileSync(path.join(dir, f), "utf8").split("\n---")[0]))
    .map((f) => f.slice(0, -3));
}

// Files (other than the command's own) that invoke `name`: `/craftsman:name`,
// a quoted "craftsman:name" command, or `/name` on a Skill line.
export function invokers(name, files, read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")) {
  const re = new RegExp(`craftsman:${name}\\b|Skill[^\\n]*/${name}\\b`);
  return files.filter((f) => f !== `commands/${name}.md` && re.test(read(f)));
}

const files = DIRS.flatMap(walk);

test("flagged set includes the known user-only commands", () => {
  const flagged = flaggedCommands();
  for (const n of ["account-switch", "builtin-check", "toggle"]) assert.ok(flagged.includes(n), n);
});

test("no flagged command is invoked by another command, agent, workflow or hook", () => {
  const bad = flaggedCommands().flatMap((n) => invokers(n, files).map((f) => `${n} <- ${f}`));
  assert.deepEqual(bad, []);
});

test("the check fails when a flagged command is invoked elsewhere", () => {
  const fake = { "commands/x.md": "run /craftsman:toggle now", "agents/y.md": "nothing" };
  assert.deepEqual(invokers("toggle", Object.keys(fake), (f) => fake[f]), ["commands/x.md"]);
});

test("unflagged commands that others invoke stay model-invocable", () => {
  const flagged = flaggedCommands();
  for (const n of ["auto-go", "baseline", "fix-tests"]) assert.ok(!flagged.includes(n), n);
});

test("every reviewer agent carries maxTurns", () => {
  const names = ["api-reviewer", "code-reviewer", "consumer-tracer", "dependency-auditor", "idiom-reviewer", "migration-reviewer",
    "observability-reviewer", "performance-reviewer", "security-auditor", "standards-keeper", "ui-ux-reviewer", "review-router"];
  const missing = names.filter((n) => !/^maxTurns:\s*\d+$/m.test(fs.readFileSync(path.join(ROOT, `agents/${n}.md`), "utf8").split("\n---")[0]));
  assert.deepEqual(missing, []);
});
