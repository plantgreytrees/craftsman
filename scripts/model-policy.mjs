#!/usr/bin/env node
// Validate model frontmatter before a plugin release.
import fs from "node:fs";
import path from "node:path";

// Defaults to this plugin; an explicit root lets the test drive it over a
// fixture tree and prove the checks actually fail on drift.
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(import.meta.dirname, "..");
const allowed = new Set(["haiku", "sonnet", "opus", "fable", "inherit"]);
const targets = ["commands", "agents"];
const findings = [];

function markdownFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

for (const target of targets) {
  const dir = path.join(ROOT, target);
  for (const file of markdownFiles(dir)) {
    const text = fs.readFileSync(file, "utf8");
    const match = text.match(/^model:\s*([^\s]+)\s*$/m);
    if (!match) continue;
    if (!allowed.has(match[1])) findings.push(`${path.relative(ROOT, file)}: unsupported model ${match[1]}`);
  }
}

// Frontmatter being valid isn't enough: a command's *prose* also tells the
// model which model to run an agent on ("delegate `plan-reviewer` on `haiku`"),
// and nothing tied that sentence to the agent's own frontmatter — so plan.md
// sat on `fable` while plan-reviewer.md declared `haiku`, and only a human
// reading both files could notice. Any model word written close after an agent
// reference must now agree with that agent.
const PROSE_WINDOW = 60; // chars after the agent reference; a same-clause mention
const MODEL_WORD = /\b(haiku|sonnet|opus|fable)\b/i;

const agentModels = new Map();
for (const file of markdownFiles(path.join(ROOT, "agents"))) {
  const match = fs.readFileSync(file, "utf8").match(/^model:\s*([^\s]+)\s*$/m);
  if (match) agentModels.set(path.basename(file, ".md"), match[1]);
}

for (const file of markdownFiles(path.join(ROOT, "commands"))) {
  const text = fs.readFileSync(file, "utf8");
  for (const [agent, declared] of agentModels) {
    const reference = new RegExp("`" + agent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`", "g");
    for (const hit of text.matchAll(reference)) {
      const after = text.slice(hit.index + hit[0].length, hit.index + hit[0].length + PROSE_WINDOW);
      const mentioned = after.match(MODEL_WORD);
      if (mentioned && mentioned[1].toLowerCase() !== declared.toLowerCase()) {
        findings.push(
          `${path.relative(ROOT, file)}: prose runs \`${agent}\` on ${mentioned[1]}, ` +
          `but agents/${agent}.md declares ${declared}`,
        );
      }
    }
  }
}

if (findings.length) {
  process.stderr.write(findings.join("\n") + "\n");
  process.exit(1);
}

console.log("model policy: PASS");
