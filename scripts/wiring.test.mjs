// Cheap wiring check for the prompt-driven half of the plugin: commands and
// agents reference other files by literal path
// ("${CLAUDE_PLUGIN_ROOT}/skills/.../SKILL.md") and by name (`agent-name`).
// Nothing enforces those references stay correct as the file set grows —
// this test is the deterministic backstop instead of relying on getting it
// right by eye every time an agent/skill is added, renamed, or removed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

const promptFiles = [
  ...walk(path.join(PLUGIN_ROOT, "commands")),
  ...walk(path.join(PLUGIN_ROOT, "agents")),
].filter((f) => f.endsWith(".md"));

test("wiring: every ${CLAUDE_PLUGIN_ROOT}/... path referenced in commands/agents resolves to a real file", () => {
  const missing = [];
  for (const file of promptFiles) {
    const text = fs.readFileSync(file, "utf8");
    const re = /\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_\-./]+\.md)/g;
    for (const match of text.matchAll(re)) {
      const target = path.join(PLUGIN_ROOT, match[1]);
      if (!fs.existsSync(target)) missing.push(`${path.relative(PLUGIN_ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("wiring: every scripts/*.mjs referenced from commands/agents exists", () => {
  const missing = [];
  for (const file of promptFiles) {
    const text = fs.readFileSync(file, "utf8");
    const re = /\$\{CLAUDE_PLUGIN_ROOT\}\/(scripts\/[A-Za-z0-9_\-./]+\.mjs)/g;
    for (const match of text.matchAll(re)) {
      const target = path.join(PLUGIN_ROOT, match[1]);
      if (!fs.existsSync(target)) missing.push(`${path.relative(PLUGIN_ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(missing, []);
});

const hooksConfig = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "hooks", "hooks.json"), "utf8"));

function hookScripts() {
  const found = [];
  for (const [event, entries] of Object.entries(hooksConfig.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        const match = hook.command.match(/scripts\/([A-Za-z0-9_\-.]+\.mjs)/);
        if (match) found.push({ event, script: match[1] });
      }
    }
  }
  return found;
}

test("wiring: every script referenced from hooks.json exists", () => {
  const missing = hookScripts()
    .filter(({ script }) => !fs.existsSync(path.join(PLUGIN_ROOT, "scripts", script)))
    .map(({ event, script }) => `${event}: ${script}`);
  assert.deepEqual(missing, []);
});

// /compact and /clear are built-in CLI commands: the model cannot invoke them
// (SlashCommand/Skill only reach custom commands) and no hook can trigger a
// compaction. A gate that blocks tool use "until /compact runs" therefore always
// ends with the session stopped, waiting for the user to type it — which the
// old compact-gate.mjs did after every unit. Context resets are left to Claude
// Code's own auto-compact; SessionStart restores the hand-off afterwards.
test("wiring: no script blocks tool use pending a /compact the model cannot run", () => {
  const offenders = fs.readdirSync(path.join(PLUGIN_ROOT, "scripts"))
    .filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"))
    .filter((f) => /compact-required|requireCompact\s*\(/.test(
      fs.readFileSync(path.join(PLUGIN_ROOT, "scripts", f), "utf8")));
  assert.deepEqual(offenders, []);
});

test("wiring: every agent file is referenced by name from at least one command", () => {
  const agentDir = path.join(PLUGIN_ROOT, "agents");
  const agentNames = fs.readdirSync(agentDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  const commandText = walk(path.join(PLUGIN_ROOT, "commands")).filter((f) => f.endsWith(".md"))
    .map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const unreferenced = agentNames.filter((name) => !commandText.includes(`\`${name}\``));
  assert.deepEqual(unreferenced, []);
});
