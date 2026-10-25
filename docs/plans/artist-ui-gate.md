---
slug: artist-ui-gate
goal: The advisory ui gate uses the Artist plugin when it is installed and set up, and a reduced built-in accessibility check otherwise
level: feature
priority: P2
idea: docs/ideas/artist-ui-gate.md
classification: in-scope (docs/ideas/artist-ui-gate.md verdict; docs/architecture/gates.rules.md)
tracker_rows: [TRACKER#ui-gate-script, TRACKER#ui-surface]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: Explore (isolated, raw request only; added README.md:446, gate-select.mjs:3 comment, namespaced guard test)
coverage:
  contract:      1.1 (ui-gate JSON route), 2.5-2.7 (every ui-ux-reviewer/design-review consumer)
  data:          N/A(no persistence; reuse-check run dir is gitignored session state)
  config:        1.6 (execution.builtinAgents documented; guard unchanged, ARCH-GATES-06)
  security:      1.2 (installPath confined under ~/.claude/plugins/, exact plugin id, execFile without shell)
  tests:         1.1-1.4, 2.4
  observability: 1.5 (route + reason in JSON), 2.6 (log-specialist names)
  interface:     1.1 (CLI: node scripts/ui-gate.mjs <worktree> <merge-base>; corrected by scrutinise-artist-ui-gate)
  docs:          1.6, 2.8, 2.9
  rollback:      git revert of the two unit merges restores ui-ux-reviewer, design-review and their caps
units:
  - id: ui-gate-script
    scope_id: ui-gate-script
    project: .
    depends_on: []
    module: scripts/ui-gate.mjs
    language: javascript (node ESM, node:test)
    security: high
    scope:
      read: [scripts/gate-select.mjs, scripts/gate-select.test.mjs, scripts/lib/core.mjs, scripts/agent-mode-guard.mjs, scripts/agent-mode-guard.test.mjs]
      docs: [docs/architecture/gates.rules.md, docs/architecture/slim.rules.md, docs/ideas/artist-ui-gate.md]
      write: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs, scripts/agent-mode-guard.test.mjs, EXTENDING.md]
    arch: [ARCH-GATES-01, ARCH-GATES-02, ARCH-GATES-03, ARCH-GATES-04, ARCH-GATES-05, ARCH-GATES-06, ARCH-SLIM-15]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: ui-surface
    scope_id: ui-surface
    project: .
    depends_on: [ui-gate-script]
    module: agents/ui-ux-reviewer.md + consumers
    language: markdown + javascript (node ESM)
    security: normal
    scope:
      read: [agents/ui-ux-reviewer.md, skills/design-review/SKILL.md, scripts/doc-size-policy.mjs, commands/_shared-execution.md, commands/_shared-machinery.md, commands/_scrutinise-deep.md, scripts/log-specialist.mjs, skills/language-aware-planning/references/react-native.md, scripts/entry-surface.test.mjs, docs/builtins.md, scripts/ui-gate.mjs, scripts/gate-select.mjs]
      docs: [docs/architecture/gates.rules.md, docs/architecture/slim.rules.md, docs/architecture/engine.rules.md, docs/architecture/docs.rules.md]
      write: [agents/ui-ux-reviewer.md, skills/design-review/SKILL.md, scripts/doc-size-policy.mjs, commands/_shared-execution.md, commands/_shared-machinery.md, commands/_scrutinise-deep.md, scripts/log-specialist.mjs, skills/language-aware-planning/references/react-native.md, scripts/entry-surface.test.mjs, docs/builtins.md, scripts/gate-select.mjs, README.md, CHANGELOG.md]
    arch: [ARCH-GATES-01, ARCH-GATES-05, ARCH-SLIM-01, ARCH-SLIM-02, ARCH-SLIM-08, ARCH-SLIM-09, ARCH-SLIM-15, ARCH-ENGINE-04, ARCH-DOCS-09]
    tooling: { implementer: implementer, gates: [], skills: [verification-before-completion], guards: [arch-check, doc-size-policy], mcp: [] }
---

# Plan: route the advisory ui gate to Artist, with a reduced built-in fallback

## Outcome
When a unit's diff touches UI files, the advisory `ui` gate runs Artist's reuse-check (and its design critic when a verify report exists) if Artist is installed, enabled and set up for the project; otherwise, and whenever no verify report exists, a reduced `ui-ux-reviewer` checks accessibility basics.

## Scope Steps (executable core)

### Step 1 — ui-gate-script (., javascript, high)
Tooling: implementer implementer · gates security-auditor · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 1.1 Write `scripts/ui-gate.test.mjs` first (fixtures in `fs.mkdtempSync`, `HOME` pointed at a temp dir, a git repo with a merge-base): the route JSON is `{route, reason, reuse?, critic?, a11y, steps}`, `route` is `"artist"` or `"fallback"`, exit code is always 0 → accept: the tests fail before 1.2-1.4 exist (record the failing run).
- [ ] 1.2 Detection in `scripts/ui-gate.mjs` (ARCH-GATES-02): read `~/.claude/plugins/installed_plugins.json` (`{version, plugins: {"<name>@<mkt>": [{scope, installPath, projectPath?}]}}`); only the exact key `artist@artist-marketplace`; take an entry whose `scope` is `"user"` or whose `projectPath` is the main checkout root, and whose realpath'd `installPath` is inside `~/.claude/plugins/` and contains `scripts/reuse-check.mjs`. Enabled = `enabledPlugins["artist@artist-marketplace"]` resolved with Claude Code precedence local (`<main>/.claude/settings.local.json`) > project (`<main>/.claude/settings.json`) > user (`~/.claude/settings.json`), true only if the winning value is `true`. DESIGN.md = `<worktree>/docs/design/DESIGN.md` else `<worktree>/DESIGN.md`, format 2 = frontmatter line `format: 2`. Each failed condition → `{route:"fallback", reason:"<condition>", a11y:true}` → accept: one test per condition (missing file, other marketplace, installPath outside plugins dir, disabled at local over enabled at user, no DESIGN.md, format 1) yields fallback with that reason.
- [ ] 1.3 Reuse-check (ARCH-GATES-03): `execFile(process.execPath, [<installPath>/scripts/reuse-check.mjs, "--project", worktree, "--run", runDir, "--base", mergeBase])` with no shell and a 60 s timeout; `runDir` = `fs.mkdtempSync(<main checkout>/.craftsman/ui-gate/run-)` (outside the worktree, unique per call). Exit 0 or 1 → `reuse: {exit, json: <runDir>/reuse.json}`; exit 2, a throw, a timeout, or an unresolvable merge-base → fallback with the error as reason → accept: tests with a stub `reuse-check.mjs` in the fixture installPath cover exit 0, 1, 2 and a bad merge-base (no crash).
- [ ] 1.4 Critic and a11y (ARCH-GATES-04/05): list untracked files in the worktree (`git ls-files --others --exclude-standard` plus ignored via `--ignored --exclude-standard`) matching `.artist/runs/*/report.json`; newest wins → `critic: {report, design, rubric: <installPath>/skills/create/references/rubric.md}`; a tracked report is ignored. `a11y` is true when route is fallback or no report was found → accept: tests for tracked-ignored, untracked-picked, and a11y true/false.
- [ ] 1.5 `steps` array in the JSON (keeps capped command docs byte-neutral): one-line instructions root applies — `dispatch ui-ux-reviewer with the diff` when a11y; `report reuse.json findings (advisory)` on artist; `dispatch artist:design-critic once with only <report screenshots, report.json, DESIGN.md, rubric>; if blocked (not in execution.builtinAgents) apply its brief yourself, labelled NOT ISOLATED; never retry` when critic → accept: test asserts each step appears exactly under its condition; usage error prints the usage line and exits 0 with route fallback.
- [ ] 1.6 EXTENDING.md: a short subsection under the `execution` config section documenting `{ "execution": { "builtinAgents": ["Explore", "artist:design-critic"] } }` — a read-only Artist agent; the guard code is unchanged; without it the critic brief runs in-session NOT ISOLATED; Artist is optional (ARCH-SLIM-15); add one `scripts/agent-mode-guard.test.mjs` case that `artist:design-critic` passes when listed in `execution.builtinAgents` and is blocked when not → accept: `grep -n 'artist:design-critic' EXTENDING.md` hits; `node --test scripts/ui-gate.test.mjs` passes; `node --test scripts/*.test.mjs` green.

### Step 2 — ui-surface (., markdown + javascript, normal)
Tooling: implementer implementer · gates none · skills verification-before-completion · guards arch-check, doc-size-policy
Depends on: ui-gate-script
- [ ] 2.1 Reduce `agents/ui-ux-reviewer.md` to the accessibility floor (ARCH-GATES-05): keep frontmatter (name, `maxTurns`, `model: haiku`), description ≤ 90 chars naming accessibility; body = contrast (WCAG AA 4.5:1 / 3:1), visible focus and keyboard operability, semantic markup over div soup, accessible names/alt text, React Native equivalents (load `references/react-native.md` as today), max 5 findings, "No accessibility findings." when sound; remove the design-review load, hierarchy, AI-slop, token-grep and responsive sections (Artist owns them) → accept: file smaller than 2680 bytes; no `design-review` string in it.
- [ ] 2.2 Delete `skills/design-review/SKILL.md` (and its directory) → accept: path absent.
- [ ] 2.3 `scripts/doc-size-policy.mjs`: remove the `skills/design-review/SKILL.md` entry; lower the `agents/ui-ux-reviewer.md` cap to the new file size (ARCH-SLIM-01/02); lower any other edited doc's cap to its new size if it shrank → accept: `node scripts/doc-size-policy.mjs` PASS.
- [ ] 2.4 `scripts/entry-surface.test.mjs`: keep `ui-ux-reviewer` in the maxTurns list; add a test that `skills/design-review` does not exist and `agents/ui-ux-reviewer.md` names no skill → accept: new test fails before 2.1/2.2, passes after.
- [ ] 2.5 `commands/_shared-execution.md:33`: `ui`→ run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-gate.mjs" <worktree> <merge-base>` and apply its `steps`, still advisory; byte-neutral or smaller (cap 12769, size 12764) → accept: line names `ui-gate.mjs`; doc-size PASS.
- [ ] 2.6 `commands/_shared-machinery.md:51`, `commands/_scrutinise-deep.md:20`, `scripts/log-specialist.mjs:3` (comment), `scripts/gate-select.mjs:3` (comment only, behaviour unchanged), `skills/language-aware-planning/references/react-native.md:28`: replace the stale `ui-ux-reviewer`/`design-review` wording (the lens is now "ui-gate (Artist or ui-ux-reviewer a11y)"; react-native.md drops the design-review reference); each capped doc byte-neutral or smaller → accept: `grep -rn design-review commands agents skills scripts` returns nothing; doc-size PASS.
- [ ] 2.7 `docs/builtins.md`: add a row/line for `artist:design-critic` as an optional read-only builtin via `execution.builtinAgents` → accept: grep hit.
- [ ] 2.8 `README.md:143`, `:446` and `:531`: describe the ui gate (Artist when present, a11y reviewer fallback); mention the optional `artist:design-critic` beside the `builtinAgents` default; remove the `skills/design-review/` tree line → accept: `grep -n design-review README.md` empty.
- [ ] 2.9 LAST: `CHANGELOG.md` `[Unreleased]`: one `### Changed` bullet — ui gate routed through `scripts/ui-gate.mjs` to the optional Artist plugin (ARCH-SLIM-15, ARCH-GATES-01..06); `ui-ux-reviewer` reduced to an accessibility floor; `design-review` skill removed → accept: `[Unreleased]` < 8 KB (ARCH-SLIM-08); `node --test scripts/*.test.mjs` and `node scripts/doc-size-policy.mjs` green.

## Sequencing
Step 1 only adds files, so main stays green; Step 2 deletes the skill, lowers caps and fixes every reference in one commit, so main never names a deleted file.

## Verification background
- gate-select emits `ui` for UI_EXT — `scripts/gate-select.mjs:37,80`
- all specialists advisory — `commands/_shared-execution.md:33`
- builtinAgents exact match, namespaced id works unchanged — `scripts/agent-mode-guard.mjs:101-102`
- reuse-check CLI `--project --run [--files|--all] [--base]`, throws without format-2 DESIGN.md, defaults base to HEAD — `Artist/scripts/reuse-check.mjs:244-258`; `formatOf` reads frontmatter `format:` — `Artist/scripts/inventory.mjs:28-32`
- critic inputs: screenshots, report.json, DESIGN.md, rubric — `Artist/agents/design-critic.md:3,7`; `Artist/skills/create/SKILL.md:52-54`
- caps with no headroom: `_shared-machinery.md` 6904/6904, `_scrutinise-deep.md` 5466/5466, `react-native.md` 2349/2349, `_shared-execution.md` 12764/12769 — `scripts/doc-size-policy.mjs`
- `.craftsman/` is gitignored (git check-ignore)

CONSUMERS:
- `ui-ux-reviewer` (agent name) → `commands/_shared-execution.md:33`, `commands/_shared-machinery.md:51`, `commands/_scrutinise-deep.md:20`, `scripts/entry-surface.test.mjs:56`, `scripts/log-specialist.mjs:3`, `scripts/gate-select.mjs:3` (comment, unchanged meaning), `scripts/doc-size-policy.mjs:41`, `README.md:143`
- `design-review` (skill) → `agents/ui-ux-reviewer.md:13`, `skills/language-aware-planning/references/react-native.md:28`, `scripts/doc-size-policy.mjs:77`, `README.md:531`
- Historical mentions in `docs/plans/*.md`, `docs/ideas/*.md`, `CHANGELOG.md` released sections stay (history).

## Risk & rollback
Artist's CLI or DESIGN.md format can change; every failure falls back to the a11y reviewer with a reason, never an error. Hierarchy/taste review is lost for projects without Artist (accepted, docs/architecture/gates.md). Revert the two merge commits to restore.

## Out of scope
Running Artist's verify.mjs or a dev server from the gate; a plugin.json `dependencies` entry; changes to agent-mode-guard.mjs; Artist repo changes.
