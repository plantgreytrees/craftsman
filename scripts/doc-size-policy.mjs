#!/usr/bin/env node
// Hard size budget for every shipped .md the plugin can read into context —
// commands, shared docs, agents, skills. Mirrors model-policy.mjs's pattern
// and purpose: a build/release gate, not a live runtime check, because
// command/agent/skill bodies are injected directly by the harness the instant
// they're invoked (not fetched via the Read tool), so there is no PreToolUse
// hook that could intercept "about to load an oversized doc" mid-turn. This
// is the mechanically-enforceable equivalent — wired into init.mjs's plugin
// health check, so an oversized doc fails `--update` the same way a missing
// or syntactically broken shipped file would.
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOT = path.resolve(import.meta.dirname, "..");

// Budgets are char counts with real headroom over current sizes (see the
// measurement this file's companion trimming pass used) — generous enough
// not to fight legitimate growth, tight enough to catch actual bloat before
// it ships. Read-unconditionally docs (agent mode, tooling manifest — paid
// on every execution-touching command) get the tightest budget of the set.
const BUDGETS = [
  { name: "shared machinery (read unconditionally)", glob: /^commands\/_shared-machinery\.md$/, max: 7500 },
  { name: "shared execution (per-unit loop)", glob: /^commands\/_shared-execution\.md$/, max: 13500 },
  { name: "shared analysis", glob: /^commands\/_shared-analysis\.md$/, max: 6500 },
  { name: "scrutinise --deep protocol", glob: /^commands\/_scrutinise-deep\.md$/, max: 6500 },
  { name: "command", glob: /^commands\/[^_].*\.md$/, max: 10000 },
  { name: "agent", glob: /^agents\/.*\.md$/, max: 3800 },
  { name: "skill", glob: /^skills\/.*\/SKILL\.md$/, max: 4200 },
];

function markdownFiles(dir) {
  const files = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

export function checkDocSizes(root = DEFAULT_ROOT) {
  const findings = [];
  for (const dir of ["commands", "agents", "skills"]) {
    for (const file of markdownFiles(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      const budget = BUDGETS.find((b) => b.glob.test(rel));
      if (!budget) continue; // no matching category (e.g. skill reference files) — not size-policed
      const size = fs.statSync(file).size;
      if (size > budget.max) {
        findings.push(`${rel}: ${size} chars exceeds the ${budget.max}-char budget for "${budget.name}" (over by ${size - budget.max}) — trim it before shipping.`);
      }
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = checkDocSizes();
  if (findings.length) {
    process.stderr.write(findings.join("\n") + "\n");
    process.exit(1);
  }
  console.log("doc size policy: PASS");
}
