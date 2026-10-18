---
slug: plugin-overhaul
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-18
updated: 2026-10-18
related: [docs/ideas/autonomous-e2e-loop.md, docs/ideas/feature-branch-plans.md (branch worktree-idea-feature-branch-plans), docs/plans/token-efficiency.md, docs/builtins.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
touches: [commands/merge.md, commands/idea.md, commands/architect.md, agents/idea-critic.md, scripts/chain.mjs (new), scripts/merge-tree.mjs (new), scripts/digest.mjs, scripts/repo-exec.mjs, scripts/lib/land.mjs, scripts/lib/plan-submodules.mjs, docs/architecture/landing.rules.md, hooks/hooks.json, scripts/lib/core.mjs, scripts/agent-mode-guard.mjs, scripts/session-context.mjs, scripts/pre-guard.mjs, scripts/orchestrate-scope-guard.mjs, scripts/builtin-skill-context.mjs, scripts/init.mjs, scripts/model-policy.mjs, craftsman.config.json, workflows/run.js, workflows/spike.js, commands/*.md, agents/*.md, skills/ (new design-system skill, skill registry), .claude-plugin/plugin.json, docs/builtins.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md, EXTENDING.md, README.md, CHANGELOG.md, scripts/*.test.mjs]
---

# Idea: Scope craftsman to opted-in projects, add a per-session agent cap, and tighten skills and tokens

## Proposal (neutral restatement)
**Problem.** Craftsman is a mature plugin (28 commands, 22 agents, 3 skills, 77
scripts, 6 hook events). Its owner runs several concurrent sessions across
different repos and wants: lower token cost; hooks that act only in projects
that opted in; a per-session numeric cap on parallel sub-agents (default
root-only; with N > 0 the root and up to N sub-agents cooperate, results are
consolidated in root, and new sub-agents start as slots free); skills that load
only when relevant plus a per-project way to add skills; a plugin-owned UI/UX
design system; better use of proven external skills; enforced code-creation
best practice and consistency.
**Claimed benefit.** Fewer tokens per session, no cross-project interference,
parallelism on demand, better UI output, more consistent code.
**Who benefits.** The solo maintainer; anyone who installs it at user scope.
**Done.** Opt-in-scoped hooks, a `maxAgents` control with slot accounting,
trimmed always-on context, project skill discovery, design-system skills, a
refreshed built-in wrapper ledger.

## Verdict
**PURSUE-WITH-CHANGES** (medium). The scoping defect is real, proven and cheap
to fix, so do it first, together with a cleanup bundle. The agent cap is worth
building but in two layers and in two phases. Plugin-owned design-system
*generation* skills should shrink to one thin, path-gated skill that points at
proven external skills. The token goal is mostly already met at the hook and
listing level, so the remaining token work is narrower than the pitch.
**Deciding fact:** in a git repo that never ran `/craftsman:init`, craftsman
reports "active", blocks every `Task` call (including other plugins' agents) and
every inline `Workflow` script, and creates `.craftsman/` (probe, below).
**Most likely to flip it:** if the ARCH-STATE-03 spike cannot show two units
running concurrently in separate worktrees without cross-writes, parallel
*write* units are dropped and only the read-only analysis fan-out cap survives.

| criterion | whole pitch | recommended slice | evidence |
|---|---|---|---|
| value | 3 | 4 | scoping is proven and frequent (`core.mjs:491-497`); 34 `agent_mode_blocked` events across 3 repos (Gleam 31 of 990 sessions, Loost 2, Podling 1); token and design goals are weak |
| system fit | 2 | 3 | strains ARCH-ENGINE-09 (`engine.rules.md:19`) and ARCH-STATE-07 (`state.rules.md:17`) |
| cost (5 = cheap) | 2 | 4 | pitch spans 7 parts and ~30 files; slice is 2 small units plus one bundle |
| risk (5 = low) | 2 | 3 | opt-in can silently disarm guards; fail-open guards; slot leaks |
| reversibility | 4 | 4 | config-gated; marker is reversible |
| evidence | 2 | 3 | demand for parallelism and listing-token savings unmeasured; design-skill popularity figures conflict |

## Overlap & prior work
- **Extends** `docs/ideas/autonomous-e2e-loop.md` (architected): its engines, `/auto`
  and mod stay; this idea changes activation scope and the agent cap.
- **Conflicts** with decided rules: ARCH-ENGINE-09 (units sequential until
  ARCH-STATE-03 spike-proven, `engine.rules.md:19`) and ARCH-STATE-07 (no
  `SubagentStop` hook, `state.rules.md:17`). Both need `/architect` to amend.
- **Already shipped, do not redo:** `docs/plans/token-efficiency.md` (rows 5-8
  MERGED); `execution.agentMode` root-only default with a mechanical guard.
- **In flight, unmerged:** branch `worktree-grant-project-dir` (1 commit,
  `de87973`, keys isolated-agent grants on `CLAUDE_PROJECT_DIR`; fixes a bug on
  main where `/scrutinise`, `/idea`, `/architect --deep` grants are keyed by cwd
  and a `cd` into a nested repo blocks the dispatch). Branch
  `worktree-idea-feature-branch-plans` (idea doc only, ~60 touched files).
- **Searched:** `docs/ideas/*`, `docs/plans/TRACKER.md`, `docs/architecture/*.rules.md`
  (`arch-check.mjs governs`), `CHANGELOG.md`, README, `docs/builtins.md`,
  plan-memory (the recall action needs a real query; nothing stored for this area).

## System fit (whole project)
| dimension | impact |
|---|---|
| contract ripple | `execution.agentMode` -> `maxAgents`: consumers `core.mjs`, `agent-mode-guard.mjs`, `session-context.mjs`, `model-policy.mjs`, four command docs (`_shared-analysis.md:17`, `_shared-machinery.md`, `plan.md`, `_scrutinise-deep.md`) |
| data layer | N/A(no DB). New per-session file `.craftsman/sessions/<sid>/max-agents` and optional lease files |
| config & flags | new `execution.maxAgents`, `CRAFTSMAN_MAX_AGENTS` env, opt-in marker; migration for existing installs (all four of the owner's repos already hold `craftsman.config.json` or `.craftsman/`, so marker-compat needs no migration for them) |
| security | guards fail open on crash (`agent-mode-guard.mjs:57-58`, `projectContext()` outside try/catch); `onFailure:"block"` needs Claude Code v2.1.295+ (installed: 2.1.302); opt-in must never disarm the secrets scan in an initialised repo |
| tests | 341/342 node tests pass in a clean copy (the 1 miss is the `.ts` mod test, which needs `claude plugin test`, and CI runs that, `ci.yml:101-110`); new tests needed for never-initialised repo, cap, lease expiry |
| observability | `telemetry.mjs`, `stats.mjs` exist; add `agent_cap_blocked`, `agent_slot_released` |
| UI | one new design-system skill + command; `ui-ux-reviewer` and `design-review` stay |
| docs | README, EXTENDING (model routing drift), builtins ledger, ARCH rules, CHANGELOG |

**Second-order effects.** Opt-in changes behaviour for every existing install
until it has a marker. A cap without `SubagentStop` can leak slots for
background agents. Two caps (craftsman's and Claude Code's
`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`) can give confusing block messages.
Every new model-invocable skill adds always-on description tokens.

## Research
Primary sources are official Claude Code docs, fetched 2026-10-18 on Claude Code 2.1.302.
- **Manifest** (https://code.claude.com/docs/en/plugins/manifest-reference): `dependencies`
  (name | name@marketplace | {name, marketplace, semver version}); `defaultEnabled`;
  `userConfig` (number/boolean/string with `options`, exported to hooks as
  `CLAUDE_PLUGIN_OPTION_<KEY>`); `settings.json` at plugin root applies only `agent` and
  `subagentStatusLine`; `skills` ADDS to the default scan while `commands` REPLACES it;
  "Commands: flat Markdown files. Prefer `skills/` for new plugins"; `bin/` is on the Bash
  PATH; `workflows` key; `experimental.monitors` (`when: on-skill-invoke:<skill>`); a
  root `CLAUDE.md` is not loaded; setting `version` pins users to it.
- **Hooks** (https://code.claude.com/docs/en/hooks): handler `if` field holds one
  permission rule (e.g. `Bash(git push *)`), works only on Pre/PostToolUse,
  PostToolUseFailure, PermissionRequest, PermissionDenied, and is best-effort; exec form
  (`command` + `args`) avoids spawning a shell; non-0/non-2 exits, spawn failures and
  timeouts are non-blocking; `onFailure:"block"` on command/http hooks (v2.1.295+);
  SubagentStart/SubagentStop exist with an agent-type matcher; `additionalContext` is
  capped at 10,000 characters per string.
- **Skills** (https://code.claude.com/docs/en/skills): `paths` globs limit automatic
  loading; `disable-model-invocation: true` removes the description from context;
  description plus `when_to_use` truncate at 1,536 characters in the listing; keep
  `SKILL.md` under 500 lines with reference files; `context: fork` + `agent`; plugin
  skills are namespaced `plugin:skill`; `!`command`` injects dynamic context.
- **Sub-agents** (https://code.claude.com/docs/en/sub-agents): default 20 concurrent
  subagents, changeable only through env `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
  (v2.1.217+), which is a per-launch setting and cannot be set from inside a session;
  `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` default 3; only the final report returns to the
  parent; a non-fork subagent re-gathers context; plugin agents ignore `hooks`,
  `mcpServers`, `permissionMode`; frontmatter has `maxTurns`, `background`, `isolation`,
  `effort`, `skills`, `model`.
- **Workflows** (https://code.claude.com/docs/en/workflows): a script holds the plan so
  intermediate results stay out of the root context; up to 16 concurrent agents by default
  (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`, 1-256, v2.1.269+), 1,000 agents per run;
  `args` global passes configuration in; sibling agents with identical model, effort,
  agent type, tools, schema and working directory share a prompt-cache prefix
  (`subagentPromptCacheTtl`, `CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS`).
- **Dependencies** (https://code.claude.com/docs/en/plugins/dependencies): a plugin with
  only `name` + `dependencies` is a valid bundle; cross-marketplace dependencies need
  `allowCrossMarketplaceDependenciesOn`; releases are tagged `<name>--v<version>`.
- **Disagreement flagged.** A secondary source claims a per-session total of 200
  subagents (`CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`); the official page says there is no
  total limit. Official wins; the 200 figure is UNPROVEN.
- **Popular open-source design skills** (star and install counts conflict across sources,
  all magnitudes UNPROVEN): `anthropics/skills` `frontend-design`, `nextlevelbuilder`
  `ui-ux-pro-max` (design-system generator), Taste Skill, Interface Design,
  `vercel-labs/agent-skills` (`web-design-guidelines`, `react-best-practices`),
  `obra/superpowers` (brainstorming, writing-plans, systematic-debugging, TDD).
  https://skillselion.com/design , https://pasqualepillitteri.it/en/news/576/claude-code-skills-design-uiux-guide ,
  https://skillselion.com/skills/vercel-labs/agent-skills , https://github.com/obra/superpowers .
  Licence and quality must be checked before any is recommended by name.

### Probe (reproducible)
In a throwaway repo containing only `package.json`, with `CLAUDE_PLUGIN_ROOT` and
`CLAUDE_PROJECT_DIR` set: `session-context.mjs` printed "craftsman active" (1,075 bytes);
`agent-mode-guard.mjs` exited 2 for `Task` with `general-purpose` and for an inline
`Workflow`; `.craftsman/` was created. Hook cost measured ~30 ms per call (Node startup
~14 ms): hooks cost latency, not tokens.

## Findings: logical faults and bugs (most severe first)
| # | sev | finding | evidence | status |
|---|---|---|---|---|
| F1 | high | **Activation is opt-out.** Any git repo is "enabled" unless `CRAFTSMAN=off`, `.craftsman/off`, or `enabled:false`. No hook requires an init marker. | `core.mjs:491-497`; 12 callers; probe | proven |
| F2 | high | **The agent guard blocks everyone's agents.** Under the default root-only mode every `subagent_type` outside plan-strategist, granted agents, runner grants and `builtinAgents` exits 2, including other plugins' agents and `general-purpose`; inline `Workflow` scripts (the user's own Claude Code dynamic workflows) are blocked too. Combined with F1 this hits repos that never opted in. | `agent-mode-guard.mjs:60-130`; probe | proven |
| F3 | high | **Isolated-agent grants are keyed by cwd on main.** `cd` into a nested repo between `/scrutinise`, `/idea` or `/architect --deep` and the dispatch loses the grant ("no unspent grant"). A fix exists but is unmerged. | branch `worktree-grant-project-dir` @ `de87973`; ARCH-STATE-02 | proven (fix pending) |
| F4 | med | **Guards fail open.** `projectContext()` runs outside try/catch, a throw (for example a malformed `craftsman.workspace.json`) exits non-zero, which Claude Code treats as non-blocking. Fixing this before F1 would make a crash block every repo. | `agent-mode-guard.mjs:57-58`, `core.mjs:103-130`; hooks docs | proven in code, not reproduced |
| F5 | med | **Docs contradict frontmatter on model routing.** EXTENDING says implementation and specialist review run on sonnet; 15 of 22 agents run on haiku, including `code-reviewer`, which the README says "still owns the verdict". `model-policy.mjs` checks names and command-prose agreement, not this claim. | `EXTENDING.md` "Model routing"; `agents/*.md` | proven |
| F6 | med | **Built-ins ledger is 13 releases stale.** Verified on 2.1.289; installed is 2.1.302. `security-review`, `run`, project `verify` wraps are still "deferred". | `docs/builtins.md:7,26,28` | proven |
| F7 | med | **Possible gate friction in the busiest repo.** Gleam logged 1,270 `scope_blocked` against 1,212 `scope_activated`, 2,013 `stop-tests-skipped` of 3,090 stops, and 1,638 `stop-acceptance-deferred`. Each block is a retry turn, which costs tokens. Cause not investigated. | `Gleam/.craftsman/events.jsonl` | UNPROVEN cause |
| F8 | low | **Finished spike ships.** `workflows/spike.js` (`craftsman-spike`, "ENGINE-02 spike") appears in the live skill list. | `workflows/spike.js:1-3` | proven |
| F9 | low | **Manifest hygiene.** No `version` (the validator warns; `release` sits under `metadata`, which Claude Code does not read), no `homepage`/`repository`. The validator also flags `register.js` "gating hook without .catch: command.run". | `plugin.json:17`; `claude plugin validate .` output | proven |
| F10 | low | **Model-invocable user-only commands.** Only the 7 `_`-prefixed shared docs set `disable-model-invocation`. `init`, `upgrade`, `toggle`, `baseline`, `workspace-init`, `builtin-check`, `stats`, `digest`, `auto-go` can be auto-invoked by the model and their descriptions sit in context (~1.5k chars). Keep `merge` model-invocable (global instruction: when the user says "merge", do it). | `commands/*.md`, measurement | proven |
| F11 | low | **No runaway bound on agents.** 0 of 22 agents set `maxTurns`. | `agents/*.md` | proven |
| F12 | low | **Event log unbounded.** `logEvent` appends with no rotation; Gleam's `events.jsonl` is 5.2 MB / 31k events. | `core.mjs:813-817` | proven |
| F13 | low | **Shell-form hooks and no `if` filter.** Every hook spawns `sh -c node ...`; `tracker-sync` runs after every Bash/Write/Edit. Docs offer exec form and `if`. Latency only (~30 ms). | `hooks/hooks.json` | proven |
| F14 | low | **Unsafe-for-others defaults.** `repoExec.land: "direct"`, `autoMerge: true` ship as defaults (direct push to base). Fine for the owner's repos, aggressive for a published plugin. | `craftsman.config.json:96-100` | proven |
| F15 | med | **Standalone `/craftsman:merge` is single-repo.** It lands one branch through `repo-exec.mjs`. A submodule pointer bump exists only as an explicit plan unit under `/auto` (ARCH-LAND-03), so saying "merge" in a repo with changed submodules still leaves submodule commits, pushes and the parent gitlink bump to the user. | `commands/merge.md:63-71,98-102`; `landing.rules.md:13` | proven |
| F16 | med | **The idea -> architect -> plan -> memory chain is prose convention, not checked.** Plans carry `idea:` (`plan-template.md:16`) and architecture docs a "Source idea" line (`architecture-template.md:16`), but ideas hold only a free-form `related:` list, no script resolves the chain (`scripts/` references `docs/ideas` only in `doc-write.mjs`), `digest.mjs` reads tracker rows only (`digest.mjs:5,43`), and memory is recorded per stage with no slug link guarantee. A broken or missing link is never reported, and nothing prints "the next step for slug X". | grep of `scripts/`; templates | proven |

**Checked and cleared (not bugs).** The stop gate judges test regressions against a
session-start snapshot, so a repo whose test command already fails is not blocked
(`stop-gate.mjs` header). SessionStart context is only ~1 KB. The whole model-visible
listing is ~8,000 characters (~2k tokens). `hooks/register.test.ts` "fails" only outside
`claude plugin test`.

## How well is "use proven skills" implemented?
**Works, but narrow and unmaintained.** `builtin-skill-context.mjs` injects craftsman's
standards, ARCH rules and open acceptance criteria into Claude Code's own `code-review`,
`simplify` and `security-review` skills via `PreToolUse` on `Skill`. Their output is
candidate findings only; `code-reviewer` keeps the verdict. Gaps: (1) a hard-coded
step-to-skill map, no selection logic; (2) nothing discovers project, user or
other-plugin skills; (3) `ui-ux-reviewer` loads only craftsman's own `design-review`;
(4) the manifest declares no `dependencies`; (5) the ledger that guards these wraps is
stale (F6). To pick the best skill per task: build a **skill registry** (below).

## Critique
- **Steelman.** Cross-repo interference is a genuine defect for a user-scope plugin used
  across many repos, the fix is one predicate at one choke point, and the cleanup items
  are low-risk.
- **Strongest case against.** The token, design-skill and parallelism goals have the
  weakest evidence, pull against each other (more sub-agents spend more tokens; more
  skills add listing tokens), collide with ~60 files of in-flight feature-branch work,
  and require amending two decided rules.
- **Hidden assumptions.** (1) Existing installs tolerate opt-in: tested, all four of
  the owner's repos already carry a marker. (2) Parallelism is wanted: modest evidence,
  34 blocks in ~1,300 logged session starts. (3) Listing tokens matter: they are ~2k,
  so small. (4) Slots can be released reliably for background agents: UNPROVEN.
  (5) Path-gated skills omit their description from the always-on listing: UNPROVEN
  (primary doc says `paths` "limits automatic loading"); measure with `/context`.
- **Failure modes.** Opt-in goes silent and disarms secrets scanning in a repo that
  relied on implicit activation; a crashed background agent never frees its slot and the
  session deadlocks at the cap; two caps disagree; vendored design skills go stale.
- **Kill criteria.** Cap: abandon parallel write units if the ARCH-STATE-03 spike cannot
  show two worktree-keyed scopes running concurrently without cross-writes, or if slot
  release is unreliable without `SubagentStop`. Design skill: abandon if it adds more
  than ~300 listing tokens or is not invoked in 30 days of telemetry. Opt-in: roll back
  if any opted-in repo loses a guard through marker detection.
- **Cheaper alternatives.** Do nothing (leaves F1/F2 live; not acceptable at user
  scope). Smallest slice (Slice A below). Use native `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
  plus a numeric allow/deny instead of a slot ledger (Slice C).

## Disputed
Critic claims root softened, with counter-evidence:
1. **"The slot cap is at the wrong layer."** Softened to "two layers". Workflows have their
   own limit and take configuration through the documented `args` global, so the cap can
   be enforced deterministically in `workflows/run.js` with no hook at all; only the
   subagent-engine path needs a guard-side counter.
2. **"Cut plugin-owned design-system skills."** Softened. The critic's staleness and
   duplication point stands, so ship one thin skill that defers to installed external
   skills rather than vendoring them. The 300-token listing worry is testable because
   `paths`-gated skills load only for matching files (primary skills doc); measure it.
3. **"Defer maxAgents entirely."** Softened. The blocker (ARCH-ENGINE-09 / ARCH-STATE-03)
   applies to parallel *write* units that need worktree isolation. Read-only analysis
   fan-out (`/scrutinise --deep` modules, specialist reviewers, `Explore`-style tracing)
   needs no write isolation, so a cap on that can ship earlier.
4. **"Token claim mostly unfounded."** Accepted for hooks (latency only) and the listing
   (~2k tokens). Root stays unconvinced the remaining levers are nil: gate friction (F7),
   command-prose size (~98 KB for the idea-to-merge chain, per `autonomous-e2e-loop.md`),
   and prompt-cache sharing across fan-out agents are real, if unmeasured.

## Recommendations
1. **Slice A, do first (about 2 units).** Make `enabled()` opt-in: a project counts as
   opted in when `craftsman.config.json` or `.craftsman/` exists (this covers all existing
   installs with no migration), and `/craftsman:init` writes one. When not opted in:
   no context injection, no `.craftsman/` creation, no agent or Workflow blocking, no
   Stop-gate. Add a test for a never-initialised git repo. Wrap `projectContext()` in
   try/catch; only after that consider `onFailure:"block"` on `pre-guard` and
   `agent-mode-guard` (v2.1.295+). Merge `worktree-grant-project-dir` first.
2. **Slice B, cleanup bundle (about 1 unit).** `disable-model-invocation: true` on the
   nine user-only commands (not `merge`); delete `workflows/spike.js`; reconcile
   reviewer models with EXTENDING (decision needed, below); add `maxTurns` to reviewers
   and the reviewer-class agents; run `/craftsman:builtin-check` on 2.1.302 and decide
   the deferred `security-review`/`run`/`verify` wraps; add `version` (and
   `homepage`/`repository`) to `plugin.json` and fix the `register.js` `.catch`;
   switch hooks to exec form and add `if` where a hook only cares about a subset (for
   example `tracker-sync` on `Bash(git *)`); rotate `events.jsonl`.
3. **Per-session agent cap (Slice C, after A+B; needs `/architect --deep`).**
   - Resolve the cap per session: env `CRAFTSMAN_MAX_AGENTS` (launch) < `/craftsman:agents N`
     writing `.craftsman/sessions/<sid>/max-agents` < a config ceiling
     `execution.maxAgents`. Unset means `0` = root-only (today's default). Map the old
     `agentMode` values for compatibility. Each session reads only its own file, so
     other sessions are unaffected.
   - Honour Claude Code's own cap: effective cap = min(craftsman N, native
     `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).
   - Layer 1, workflow engine: `args.maxAgents` drives a worker pool in `run.js` and in
     the read-only fan-outs (`parallel()` in waves of at most N; each agent returns
     schema JSON of at most ~2k tokens, ARCH-ENGINE-06; root merges into one findings
     ledger, then starts the next wave). Deterministic, no hook, no `SubagentStop`.
   - Layer 2, subagent engine: the guard keeps a lease per dispatch, released on
     `PostToolUse(Agent)` for foreground agents and by lease expiry for background ones;
     no `SubagentStop` hook, so ARCH-STATE-07 stays intact. Prove expiry in the spike.
   - Phase 1 applies the cap to read-only analysis fan-out only. Parallel *write* units
     stay sequential (ARCH-ENGINE-09) until the spike passes.
   - Keep fan-out agents uniform (same model, effort, tools, schema, cwd) so siblings
     share a prompt-cache prefix; do not randomise per-agent config.
4. **Skill registry and project packs (Slice D).** `/craftsman:init` (or a small
   `/craftsman:skills`) scans `.claude/skills/*`, `~/.claude/skills/*` and enabled-plugin
   skills once and writes `.craftsman/skills.json`: name, one-line purpose, `paths`,
   task class, source, token cost. `/plan` fills each unit's existing `tooling.skills`
   from that registry (1-3 per unit, EXTENDING.md:184-196), so only relevant skills load
   and unrelated ones are ignored. Project packs get `paths:` frontmatter so Claude Code
   itself loads them only for matching files. No hook is needed. A starter `skills-allow`
   / `skills-deny` list lets the owner pin or exclude skills. The registry also records
   which external skill is preferred per task class (UI -> `frontend-design`, review ->
   built-in `code-review`), so the "best skill per task" choice is explicit and
   auditable instead of buried in prose.
5. **Design system (Slice E, thin).** One skill `craftsman:design-system` gated by `paths`
   to UI file globs, plus one command `/craftsman:design` (`init | audit`,
   `disable-model-invocation: true`). `init` derives the project's tokens, type scale,
   spacing and component rules from existing code into `docs/design/DESIGN.md` (the
   "how, where, why" record, governed by a `design.rules.md` from `/architect`). Code
   creation reads that file; `ui-ux-reviewer` plus `design-review` verify it. If
   `frontend-design` or `web-design-guidelines` is installed, load it first and layer
   the project tokens on top; never vendor their text. Verify licences before naming
   anything as recommended.
6. **Code best practice at creation.** Mostly present already (`quality-gate.mjs` on every
   edit, `standards-keeper`, ARCH rules, scope guard). The real gap is F5: the reviewers
   that decide are on haiku. Fix that before adding mechanisms.
7. **Sequence against in-flight work.** Land A+B before `feature-branch-plans` (it touches
   `core.mjs`, `session-context.mjs`, `pre-guard.mjs`, `hooks/register.js` too); then C.

## Second brief: one linked chain, strong entrypoints, scoped sessions, specialised merge
Added after the first pass. The owner wants everything routed through craftsman, with
docs, ideas, plans and memory linked so the path forward is always clear; `/idea` and
`/architect` as thorough, better-model entrypoints; planning kept feature-based; sessions
scopable by feature, story or epic; and `merge` made a specialist that runs all git itself.

1. **One linked chain, mechanically checked (answers F16).** Define the chain as
   `idea -> architecture rules -> plan -> tracker rows -> memory`, joined by one slug.
   Add `scripts/chain.mjs <slug>` that resolves every link in both directions and prints:
   the stage the slug is at, any broken or missing link, and the single next command
   (`/architect <slug>`, `/plan <slug>`, `/orchestrate <slug>`, ...). Require both
   directions: ideas gain `architect:` and `plan:` back-links written by the command that
   creates the next stage; plans keep `idea:`; architecture docs keep "Source idea". Each
   stage records one memory line tagged with the slug (plan-memory already enforces tags).
   `digest.mjs` and the SessionStart line read `chain.mjs`, so the "path forward" is
   computed, not remembered. No new hook: it runs on demand and inside `digest`, and
   `sync-docs` flags a broken link as drift.
2. **Strong entrypoints.** `/idea` and `/architect` are the low-frequency, high-leverage
   steps, so spend tokens there. Both commands are `model: opus` today
   (`commands/idea.md`, `commands/architect.md`); `idea-critic` is `opus`;
   `architect-analyst` is `fable`. Recommend `fable` for both commands and for
   `idea-critic` by default, with `--deep` adding rounds rather than being the only way
   to a stronger model. Cost is bounded because each runs once per feature. Make
   `/architect` open with its own scrutiny of the idea doc: re-verify every cited
   `file:line` and URL, re-run the overlap scan, and record what it disputes, rather than
   inheriting the verdict. Keep `/plan` on `sonnet` (execution-shaped, many runs).
3. **Plans stay feature-based.** This idea does not touch the plan format, the tracker or
   `scope_id` rules, because another session is changing them (`feature-branch-plans`).
   Everything here keys on a `slug` and treats the plan as an opaque feature doc.
4. **Session focus (feature now; story and epic later).** Add a per-session `focus`
   record `{kind, slug}` at `.craftsman/sessions/<sid>/focus.json` (named to avoid the
   existing per-unit `scope*.json` files). `kind` is an enum that today contains only
   `feature`; `story` and `epic` are accepted by the schema but rejected with "not yet
   supported" until the other session defines their plan types. Set it with
   `/craftsman:focus <slug>` (or `--kind`). Focus then scopes: the SessionStart context
   (only that slug's next step and rules), `digest`, `chain`, tracker filtering and the
   agent cap, so a session on one feature never loads another's material and parallel
   sessions stay cheap. `focus` for an epic would resolve to its child stories and
   features through the same chain resolver, which is why the resolver must treat
   parent/child links generically.
5. **Specialised merge (answers F15).** Make `/craftsman:merge` a self-contained
   specialist that never hands back a git command:
   - Frontmatter `allowed-tools` limited to the git surface it needs
     (`Bash(git *)`, `Bash(gh *)`, `Bash(az repos *)`, the `repo-exec.mjs` call), so it
     runs without permission prompts. Keep `model: sonnet`: it is mechanical, with
     conflict resolution as the only judgement.
   - A deterministic `scripts/merge-tree.mjs` that enumerates the registered project and
     its submodules from index gitlinks (ARCH-LAND-07, never by scanning), orders
     submodules leaf-first, and for each repo commits leftovers, pushes the submodule's
     branch, lands it through its own `repo-exec merge`, then makes the parent's gitlink
     bump commit and lands the parent. Failures park with a decision (ARCH-LAND-06).
   - Keep the guard rails that already exist: no `--force`/`+refspec`/`--mirror`, no
     `reset --hard`, no `worktree remove --force`, no `--no-verify` (`pre-guard.mjs:200-210`,
     `force-block.mjs`), fast-forward check before pushing base, tests re-run first.
   - Amend ARCH-LAND-03 and ARCH-LAND-02 through `/architect`: standalone merge may make
     the bump itself; `/auto` keeps the explicit bump unit. The owner's global
     instruction already authorises merging to main in their own repos
     (`~/.claude/CLAUDE.md` "Merging"); the specialist stays inside that scope and
     refuses any repo outside the registered projects.
6. **"Everything runs through craftsman."** Today the loop is advisory outside commands:
   a one-file edit may skip it (`session-context.mjs` LOOP line). To honour the request
   without a heavy-handed hook, add the focus and chain line to SessionStart so every
   session starts from the computed next step, and let `chain.mjs` name the entry command
   for any unscoped request (`/idea` for new work, `/understand` for existing code,
   `/investigate` for bugs). Do not block edits for lack of a slug: that would be the same
   class of fault as F1/F2.

## Open questions
1. **Reviewer models (F5).** Move the specialist reviewers and `code-reviewer` to
   `sonnet` (matches the docs, costs more per review) or correct the docs to say haiku?
2. **Opt-in rule.** Is "has `craftsman.config.json` or `.craftsman/`" the right marker, or
   do you want an explicit file written only by `/craftsman:init`?
3. **Cap semantics.** Should the cap count the root, or only sub-agents (N = 0 root only,
   N = 3 root + 3)? Recommended: only sub-agents.
4. **Models for the entrypoints.** Move `/idea`, `/architect` and `idea-critic` to `fable` by
   default (recommended), or keep `opus` and use `fable` only under `--deep`?
5. **Focus naming and storage.** Is `/craftsman:focus <slug>` with a per-session
   `focus.json` right, or do you want focus set from an env var at launch
   (`CRAFTSMAN_FOCUS=<kind>:<slug>`) so a session starts already scoped?
6. **Merge reach.** Should `merge` also be allowed to create and push a missing remote
   branch for a submodule, or only land branches that already exist?

## Next step
`/architect plugin-overhaul --deep`. It must amend ARCH-ENGINE-09 (read-only fan-out
exempt; write units still sequential), keep ARCH-STATE-07, and add rules for the opt-in
marker, the agent cap and the design area. Slices A and B are small enough to go
straight to `/plan` once the marker decision (question 2) is answered.
