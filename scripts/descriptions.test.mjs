// Every command, agent and skill `description:` is listed in every session's
// context whether or not it is ever used, so its length is a standing cost.
// This caps each one and the combined total (below the 9,156 chars measured
// before the trim, docs/plans/autonomous-e2e-loop-evidence.md), and keeps the
// underscore-prefixed shared docs out of model invocation altogether.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_EACH = 200;
const MAX_SHARED = 80;
const BEFORE_TOTAL = 9156;
const MAX_TOTAL = 8500;

function frontmatter(file) {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, file), "utf8");
  const block = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!block) return null;
  const field = (name) => block[1].match(new RegExp(`^${name}:\\s*(.*)$`, "m"))?.[1].trim();
  return { description: field("description"), disableModelInvocation: field("disable-model-invocation") };
}

const listed = (dir) => fs.readdirSync(path.join(PLUGIN_ROOT, dir)).filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f}`);
const files = [
  ...listed("commands"),
  ...listed("agents"),
  ...fs.readdirSync(path.join(PLUGIN_ROOT, "skills"))
    .map((s) => `skills/${s}/SKILL.md`)
    .filter((f) => fs.existsSync(path.join(PLUGIN_ROOT, f))),
];
const shared = files.filter((f) => path.basename(f).startsWith("_"));

test("every command, agent and skill has a description of at most 200 chars", () => {
  const over = files.flatMap((f) => {
    const d = frontmatter(f)?.description;
    if (!d) return [`${f}: no description`];
    return d.length > MAX_EACH ? [`${f}: ${d.length} chars`] : [];
  });
  assert.deepEqual(over, []);
});

test("underscore shared docs are not model-invocable and carry a short description", () => {
  assert.ok(shared.length > 0, "expected underscore-prefixed shared docs under commands/");
  const bad = shared.flatMap((f) => {
    const fm = frontmatter(f);
    const problems = [];
    if (fm?.disableModelInvocation !== "true") problems.push(`${f}: missing disable-model-invocation: true`);
    if (!fm?.description || fm.description.length > MAX_SHARED) problems.push(`${f}: description over ${MAX_SHARED} chars`);
    return problems;
  });
  assert.deepEqual(bad, []);
});

test("combined description length stays below the pre-trim total", () => {
  assert.ok(MAX_TOTAL < BEFORE_TOTAL);
  const total = files.reduce((sum, f) => sum + (frontmatter(f)?.description?.length ?? 0), 0);
  assert.ok(total <= MAX_TOTAL, `combined descriptions ${total} chars exceed the ${MAX_TOTAL}-char cap`);
});
