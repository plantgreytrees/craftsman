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

// Per-file byte caps (ARCH-SLIM-01/02): every loadable .md has its own cap, set
// to its size when added and only ever lowered. A file with no entry is a
// finding, not a skip. The ratchet test compares these with the merge-base copy.
export const FILE_CAPS = {
  "agents/api-reviewer.md": 1961,
  "agents/architect-analyst.md": 2808,
  "agents/build-doctor.md": 2022,
  "agents/code-reviewer.md": 2501,
  "agents/consumer-tracer.md": 2361,
  "agents/dependency-auditor.md": 2134,
  "agents/docs-curator.md": 1542,
  "agents/idea-critic.md": 2871,
  "agents/idiom-reviewer.md": 1948,
  "agents/implementer.md": 2224,
  "agents/migration-reviewer.md": 1993,
  "agents/observability-reviewer.md": 1863,
  "agents/performance-reviewer.md": 1869,
  "agents/phase-tracker.md": 1440,
  "agents/plan-reviewer.md": 2187,
  "agents/plan-strategist.md": 1753,
  "agents/review-router.md": 1139,
  "agents/scrutineer.md": 3590,
  "agents/security-auditor.md": 2093,
  "agents/standards-keeper.md": 2510,
  "agents/ui-ux-reviewer.md": 2667,
  "agents/unit-runner.md": 3544,
  "commands/_architect-backfill.md": 4582,
  "commands/_architect-maintain.md": 5810,
  "commands/_architecture.md": 3634,
  "commands/_features.md": 3496,
  "commands/_scrutinise-deep.md": 5466,
  "commands/_shared-analysis.md": 6314,
  "commands/_shared-execution.md": 12748,
  "commands/_shared-machinery.md": 6904,
  "commands/_sync-docs-prune.md": 1565,
  "commands/account-switch.md": 8257,
  "commands/architect.md": 7034,
  "commands/auto-go.md": 557,
  "commands/auto.md": 4483,
  "commands/baseline.md": 844,
  "commands/builtin-check.md": 6044,
  "commands/digest.md": 599,
  "commands/fix-tests.md": 5024,
  "commands/idea.md": 7122,
  "commands/init.md": 4890,
  "commands/instruction.md": 8547,
  "commands/investigate.md": 6119,
  "commands/merge.md": 6173,
  "commands/orchestrate.md": 9051,
  "commands/plan.md": 8988,
  "commands/scrutinise.md": 8169,
  "commands/stats.md": 348,
  "commands/sync-docs.md": 9196,
  "commands/toggle.md": 351,
  "commands/understand.md": 6707,
  "commands/upgrade.md": 2145,
  "commands/workspace-init.md": 2691,
  "skills/deep-research/SKILL.md": 519,
  "skills/design-review/SKILL.md": 2253,
  "skills/language-aware-planning/SKILL.md": 3075,
  "skills/language-aware-planning/references/architecture-template.md": 3053,
  "skills/language-aware-planning/references/cpp.md": 1922,
  "skills/language-aware-planning/references/csharp.md": 2004,
  "skills/language-aware-planning/references/data-science.md": 2079,
  "skills/language-aware-planning/references/dockerfile.md": 1647,
  "skills/language-aware-planning/references/generic.md": 2131,
  "skills/language-aware-planning/references/go.md": 1971,
  "skills/language-aware-planning/references/idea-template.md": 3266,
  "skills/language-aware-planning/references/java.md": 2116,
  "skills/language-aware-planning/references/javascript.md": 1934,
  "skills/language-aware-planning/references/kotlin.md": 1629,
  "skills/language-aware-planning/references/kubernetes.md": 1481,
  "skills/language-aware-planning/references/php.md": 1616,
  "skills/language-aware-planning/references/plan-template.md": 7293,
  "skills/language-aware-planning/references/python.md": 2059,
  "skills/language-aware-planning/references/react-native.md": 2349,
  "skills/language-aware-planning/references/ruby.md": 2053,
  "skills/language-aware-planning/references/rust.md": 2121,
  "skills/language-aware-planning/references/shell.md": 1627,
  "skills/language-aware-planning/references/swift.md": 1503,
  "skills/language-aware-planning/references/terraform.md": 1652,
  "skills/language-aware-planning/references/typescript.md": 1894,
};

// Shared docs a command reads unconditionally (ARCH-SLIM-03). Conditional reads
// (_architecture, _features, mode protocols) are not counted.
export const INVOCATION_DOCS = {
  "orchestrate": ["commands/_shared-machinery.md","commands/_shared-execution.md"],
  "architect": ["commands/_architecture.md","commands/_shared-analysis.md"],
  "idea": ["commands/_shared-analysis.md"],
  "investigate": ["commands/_shared-analysis.md"],
  "understand": ["commands/_shared-analysis.md"],
  "plan": ["commands/_shared-analysis.md"],
  "scrutinise": ["commands/_shared-machinery.md"],
  "sync-docs": ["commands/_shared-machinery.md"],
};

// Per-invocation cap: the command's bytes plus its unconditional shared docs.
export const INVOCATION_CAPS = {
  "account-switch": 8257,
  "architect": 16982,
  "auto-go": 557,
  "auto": 4483,
  "baseline": 844,
  "builtin-check": 6044,
  "digest": 599,
  "fix-tests": 5024,
  "idea": 13436,
  "init": 4890,
  "instruction": 8547,
  "investigate": 12433,
  "merge": 6173,
  "orchestrate": 28703,
  "plan": 15302,
  "scrutinise": 15073,
  "stats": 348,
  "sync-docs": 16100,
  "toggle": 351,
  "understand": 13021,
  "upgrade": 2145,
  "workspace-init": 2691,
};

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

export function listDocs(root = DEFAULT_ROOT) {
  const out = [];
  for (const dir of ["commands", "agents", "skills"]) {
    for (const file of markdownFiles(path.join(root, dir))) {
      out.push(path.relative(root, file).split(path.sep).join("/"));
    }
  }
  return out.sort();
}

export function invocationTotals(root = DEFAULT_ROOT, docs = INVOCATION_DOCS) {
  const size = (rel) => fs.statSync(path.join(root, rel)).size;
  const totals = {};
  for (const rel of listDocs(root)) {
    const m = /^commands\/([^_].*)\.md$/.exec(rel);
    if (!m) continue;
    totals[m[1]] = size(rel) + (docs[m[1]] || []).reduce((n, d) => n + size(d), 0);
  }
  return totals;
}

export function checkDocSizes(root = DEFAULT_ROOT, caps = FILE_CAPS, invCaps = INVOCATION_CAPS) {
  const findings = [];
  for (const rel of listDocs(root)) {
    const cap = caps[rel];
    if (cap === undefined) {
      findings.push(`${rel}: no per-file cap in doc-size-policy.mjs FILE_CAPS — add one at its current size.`);
      continue;
    }
    const size = fs.statSync(path.join(root, rel)).size;
    if (size > cap) {
      findings.push(`${rel}: ${size} bytes exceeds its ${cap}-byte cap (over by ${size - cap}) — trim it before shipping.`);
    }
  }
  for (const [cmd, total] of Object.entries(invocationTotals(root))) {
    const cap = invCaps[cmd];
    if (cap === undefined) findings.push(`command ${cmd}: no per-invocation cap in INVOCATION_CAPS.`);
    else if (total > cap) findings.push(`command ${cmd}: per-invocation total ${total} bytes exceeds its ${cap}-byte cap (over by ${total - cap}).`);
  }
  return findings;
}

// Ratchet helper: every cap present in both maps may only stay or fall.
export function raisedCaps(base, current) {
  return Object.keys(base).filter((k) => k in current && current[k] > base[k]).map((k) => `${k}: ${base[k]} -> ${current[k]}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = checkDocSizes();
  if (findings.length) {
    process.stderr.write(findings.join("\n") + "\n");
    process.exit(1);
  }
  console.log("doc size policy: PASS");
}
