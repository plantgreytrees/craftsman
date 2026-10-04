# Changelog

All notable changes to craftsman are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Built-in skills and agents under craftsman's rules (pilot).**
  - *`/orchestrate` step 6 runs Claude Code's built-in `simplify`.* Its edits
    fall under the same scope guard and quality gate as the implementer's.
    Anything outside the manifest, or anything that changes behaviour, is
    reverted.
  - *Step 8 (ESCALATE) runs the built-in `code-review` at `high` first.* Its
    findings go into `code-reviewer`'s brief as unverified candidates.
    `code-reviewer` still owns the verdict.
  - *New `builtin-skill-context.mjs` (`PreToolUse` on `Skill`).* When
    `code-review`, `simplify` or `security-review` runs, the hook adds the
    governing standards, the `*.rules.md` ARCH files and the open acceptance
    criteria as context. It is advisory only and never blocks.
  - *`agent-mode-guard.mjs` lets read-only built-in agents through under
    root-only.* These are the agents in the new `execution.builtinAgents`
    (default `["Explore"]`). Before this, the guard silently blocked the
    `Explore` dispatches that `/understand`, `/investigate` and `/plan`
    already call for. `general-purpose` can write, so it stays blocked; set
    `[]` to turn the allowance off.
  - *New `/craftsman:builtin-check`, to run after `claude update`.* It reads
    the Claude Code changelog since the last verified version. It checks
    each wrapped built-in's name, args, read-only status and hook payload
    fields, and gives each one a verdict: OK, CHANGED, BROKEN or GONE. It
    also proposes new built-ins to wrap. It changes nothing without
    approval; approved changes go through `/plan` → `/orchestrate`. It
    keeps a ledger in `docs/builtins.md` (`--report-only` stops after the
    report).

- **`/idea`, `/architect` and `/instruction`: a front end for the loop that
  vets an idea, decides its architecture, and drives it to completion.**
  - *`/idea` (opus) scrutinises an idea before anything is designed.* It
    restates the idea neutrally, then:
    - scans for overlap with past ideas (rejected ones included), plans,
      tracker rows and architecture rules;
    - maps the impact across all eight completeness dimensions;
    - researches prior art and pitfalls on the web.

    One isolated `idea-critic` then judges it without having heard the pitch.
    It must steelman the idea, attack it, and weigh *do nothing* and the
    smallest useful slice. The result is a scored verdict (pursue / pursue with
    changes / defer / reject) saved to `docs/ideas/<slug>.md`. `--deep` runs
    the critic on Fable with a second adversarial round.
  - *`/architect` (opus) turns a vetted idea into confirmed decisions.* It
    checks the idea's claims against the code (`CONFIRMED` / `WRONG` /
    `UNPROVEN`). It inventories decisions across code structure, software
    design, data, systems, security, observability, testing, compatibility and
    rollout. Existing rules are inherited, not re-asked. The user confirms every
    open decision and every amendment through questions. `--deep` hands
    validation and the decision analysis to one isolated `architect-analyst` on
    Fable. `--init` builds a baseline from the code, where unconfirmed patterns
    stay advisory `[observed]` rules. `--update` re-verifies rules and refuses
    to rewrite a violated decision to match the code.
  - *Architecture docs are split by reader.* `<area>.md` is plain English plus
    mermaid, for people, and the loop never loads it. `<area>.rules.md` holds
    numbered `ARCH-…` rules plus the paths they `govern`, and is what the loop
    enforces. `/sync-docs` no longer edits `docs/architecture/**`; `/sync-docs
    --all` hands that to `/architect --update`.
  - *The loop must obey the rules, mechanically.* `/plan` cites rule ids per
    unit, `plan-reviewer` checks them, and the scrutineer reports violations
    under a new **Architecture** finding class. `scope.mjs` refuses to activate
    a unit that writes a governed path without loading its rules doc and citing
    a live rule, so `/orchestrate` cannot edit there. The new
    `scripts/arch-check.mjs` provides `lint`, `governs` and `scope` modes.
    Disable the gate with `architecture.enforce: false`.
  - *`/instruction` (sonnet) writes one paste-ready `/goal` prompt.* The prompt
    runs plan → orchestrate → scrutinise (looping until there are no Critical
    or Warning findings) → sync-docs → `/architect --update`. It ends on
    printed completion evidence, because the `/goal` evaluator only sees the
    transcript. It is checked against `/goal`'s 4,000-character cap. Shown
    separately, outside the prompt, is an implementation weight
    (quick / medium / long / extra long) derived from countable drivers.
  - *Isolated-agent grants are generalized.* `/idea` grants one `idea-critic`
    and `/architect --deep` grants one `architect-analyst`, alongside
    `/scrutinise`'s scrutineer. Each grant is spent on use, and every other
    Task call stays blocked under root-only mode. `docs/ideas/**` and
    `docs/architecture/**` join the doc-write guard.
- **`/craftsman:upgrade`: one command to take a plugin update everywhere.**
  `scripts/self-update.mjs` refreshes the marketplace, then runs
  `claude plugin update` for every Craftsman install (user scope and each
  project scope, from that project's directory). It prints one row per install
  (`updated` / `current` / `skipped` / `failed`) and the projects that need
  `/craftsman:init`. `--dry-run` only lists them. INSTALL.md gains an
  **Updating** section, including the auto-update toggle.
- **`/architect --backfill [area]`: architecture rules for a project that
  predates `/architect`.** It inventories legacy architecture prose and plans,
  confirms the areas with the user, and mines candidate rules from the prose,
  the plans (newest first), plan memory and the code. Each candidate is
  verified against the code (`HOLDS` / `CONTRADICTED` / `UNPROVEN`), and only
  the ones the user confirms are written, with `source: backfill` and
  provenance. A legacy `<area>.md` that covers exactly the area is adopted as
  its human doc. It then lists in-flight plan units the new rules would block,
  without editing any plan.
- **`/craftsman:init` audits architecture.** The update report's
  `architecture` section counts rules docs and unmanaged legacy docs and names
  the next step, normally `/architect --backfill`.

### Changed

- **Installs track commits instead of a pinned version.** `plugin.json` and
  the marketplace entry no longer carry `version`, so each install is versioned
  by git commit and every merge to `main` is an update. Previously an update
  shipped only when someone remembered to bump the version, which left the cache
  stale. The release number moved to `metadata.release`; `/craftsman:init`
  reports `release+commit` and stamps plans with the release alone, so updating
  the plugin doesn't rewrite every plan.
- **Architecture ownership is by pair, not by directory.** `/architect` owns an
  area's `<area>.rules.md` and its human `<area>.md`. Other prose under
  `docs/architecture/` is unmanaged: `/sync-docs` keeps maintaining it until
  `/architect --backfill` pairs it. `arch-check.mjs lint` now reports unmanaged
  docs instead of failing on them (it fails only for a human doc marked
  `> **Human reference.**` whose rules file is missing), and
  `arch-check.mjs unmanaged` lists them.

- **One tracker, in the main checkout, kept current by hooks.** The ledger
  and `TRACKER.md` used to be written inside whichever worktree a session ran
  in. Other sessions couldn't see a change until it merged, and every
  worktree's copy drifted apart.
  - *Where it lives.* The ledger (`.craftsman/tracker/events.jsonl`) and
    `docs/plans/TRACKER.md` now resolve to the main checkout from any linked
    worktree (`mainCheckoutRoot` in `lib/core.mjs`).
  - *Automatic updates.* Every `tracker.mjs` write re-renders a fenced,
    generated `craftsman:ledger` block in the root `TRACKER.md`. A new
    `tracker-sync.mjs` hook (SessionStart, PostToolUse, Stop) re-renders it
    as a backstop. Hand-written sections outside the fence are untouched.
    Commands no longer "mirror chips" by hand, and `/plan` registers rows
    through the ledger.
  - *Hard guard.* `pre-guard` blocks Write/Edit to a worktree's copy of
    `TRACKER.md` and any edit that changes the generated block.

- **The commands now hand off to each other as one loop, idea to sync-docs.**
  - One slug carries through. `/plan` reuses the idea's slug and links it with
    `idea:`, so `/instruction`, `/orchestrate`, `/scrutinise` and
    `/sync-docs` all address the same name. A second `/scrutinise` round
    extends `scrutinise-<slug>` instead of overwriting it.
  - `/sync-docs` accepts a plan slug, and `/sync-docs --all <slug>` is the
    closing step everywhere. It reconciles docs and tracker, then runs
    `/architect --update`. A pre-approval such as an `/instruction` `/goal`
    covers doc-stale fixes only. Divergences, violations and decision changes
    still stop.
  - Architecture rules are checked at every stage. The per-unit merge gate
    (and `code-reviewer`) checks each cited ARCH rule, so a broken `decided`
    rule blocks before merge rather than surfacing in `/scrutinise`.
    `/understand`, `/investigate`, `/fix-tests` and `/scrutinise --deep`
    read only the governing `.rules.md`.
  - `/sync-docs` no longer registers tracker rows. Like every other command,
    it routes regressions to `/investigate` → `/plan`.
  - The idea template's `verdict:` only takes real verdicts, and both pursue
    verdicts hand off to `/architect`.

- **`/scrutinise` now reviews through one isolated, fresh-context reviewer.**
  The session that wrote the code was also the one judging it, so under
  root-only mode the review had no independence at all. The review now runs in
  a new `scrutineer` agent (`opus`, read-only, no Task tool). Its brief carries
  facts only (ranges, floor hits, governing docs, open criteria), never the
  implementation rationale. This is the second named exception to root-only
  mode, and it is enforced: invoking `/scrutinise` writes a one-use grant for
  the session, and `agent-mode-guard.mjs` spends it on dispatch. Spending is
  an atomic rename, so a second or parallel scrutineer is blocked. If the
  dispatch is blocked or fails, root runs the same brief and labels the
  report `NOT ISOLATED`.
  - *Root can no longer silently discard findings.* It checks each one
    against its `file:line`. Any finding it drops or downgrades is listed
    under **Disputed** together with the counter-evidence.
  - *`--deep` works under root-only mode.* It used to refuse. It now runs the
    whole audit sequentially inside the one scrutineer. Under `subagents`
    mode, the parallel fan-out is unchanged.

### Fixed

- **`/craftsman:init --write`/`--update` overwrote a project's stop-gate
  commands.** It re-detected a command for every marker and replaced what the
  project had set, including a deliberately empty `{}`. The detected command
  could also be wrong, such as a CI `dotnet test … --logger` fragment used as
  the Python test gate. Declared `stopGate.commands` are now kept verbatim, and
  init detects commands only when the project declares none.

- **`/scrutinise` could not write its tracker chips.** It updates
  `docs/plans/TRACKER.md`, a guarded doc path, but never ran
  `doc-write.mjs on`, so the guard blocked the write. Also, `SKIPPED(locked)`
  was not a tracker status. A merge that never gets the lock is now
  `PARKED(locked)`, which the tracker can record and resume.

- **Logic gaps in `/scrutinise`.**
  - The write policy said "nothing under docs/" while a later step updated
    `docs/plans/TRACKER.md`. The policy now names the two writes it
    sanctions: acceptance ticks and the reviewed plan's own tracker chips.
  - A router `SKIP` said "stop", which skipped verification, the acceptance
    verdict and the hand-off. It now only narrows the review.
  - A whitespace-only (`TRIVIAL`) diff could leave open acceptance criteria
    unjudged. The scrutineer still issues verdicts on them.
  - The code-reviewer lens was skipped when `/orchestrate` had just
    cross-reviewed the same set. That pass ran in the author's context, so
    the skip is gone.
  - `<slug>` was undefined for module and range targets. It now has a
    definition.
  - Severity labels were mixed (Major/Minor vs Critical/Warning). They are
    now `Critical`/`Warning`/`Suggestion` throughout.
  - `--deep` diffed against a hardcoded `main`. It now uses the run's base
    branch.
- **The agent-mode guard is also registered on the `Agent` tool name.**
  Claude Code now calls the delegation tool `Agent`, and the hook matched
  only `Task`. The matcher is now `Task|Agent`, and the compact gate's
  matcher is widened the same way. `hooks.json` changes take effect after a
  session restart.
- **Worktree removal is enforced by the hooks, not left to memory.** Every Stop
  and every SessionStart now runs the `worktree-sweep.mjs` `all_merged` sweep
  over the whole repository. Any worktree that is merged into the base
  branch, clean, not the session's cwd and not locked by a live session is
  removed, along with its branch, whoever created it. Previously SessionStart
  only *reported* such worktrees (`LINGERING WORKTREES`), and Stop only
  blocked on worktrees this session made through `repo-exec`. Those blocks
  told the model to run cleanup, so leftovers from a hand-run `git merge`,
  `EnterWorktree` or a background job depended on it remembering. The Stop
  block now fires only for a merged worktree from this session that the sweep
  couldn't safely remove, and it names the reason (e.g. uncommitted changes).
  Dirty or live-locked worktrees are never forced.
- **Merged worktrees no longer linger, and a unit can't be closed out with its
  acceptance criteria still open.**
  - *Cleanup is no longer a step the model has to remember.* `repo-exec.mjs
    merge` now removes its own worktree after a successful merge (opt out with
    `cleanup: false`). `cleanup` used to run `git branch -d`, which judges
    "merged" against the primary checkout's HEAD. `merge` restores whatever
    branch was checked out, so `-d` failed *after* the worktree was already
    gone, stranding the branch and the session ledger entry. It now checks
    against the base branch, and a parked (unmerged) branch is kept. The Stop
    sweep had the same HEAD-vs-base blind spot and now checks the base too.
  - *New `scripts/worktree-sweep.mjs` handles leftovers from other sources.*
    The Stop sweep only sees worktrees this session prepared, so leftovers
    from earlier sessions, crashed runs and Claude Code's own
    `.claude/worktrees/` were invisible to everything. The new script lists
    every worktree and removes only the ones that are provably safe to remove:
    merged into the base branch, with no uncommitted or untracked changes, not
    the caller's cwd, and either unlocked or locked by a `claude session`
    whose process is gone (pid and start time are both checked). SessionStart
    reports such worktrees as `LINGERING WORKTREES` and never removes them.
  - *Acceptance enforcement is now held by the session actually doing the
    work.* `/plan` writes `acceptance.md`, so only the planning session owned
    it, and the executing session's Stop gate never enforced a criterion.
    Invoking `/orchestrate` or `/scrutinise` now takes over ownership, and
    `/scrutinise` verifies and ticks the criteria (an unmet one becomes a
    finding). The guard hook now also matches the `Skill` tool, the model's
    usual route to a plugin command, not just `SlashCommand`. It also matches
    command names exactly, so `scrutinise-deep` no longer counts as
    `scrutinise`. Ownership also used to be a hash of the raw file, so ticking
    a box with anything but Edit/Write silently disowned it. It now ignores
    tick state.
  - *The tracker updates itself when the criteria are met.*
    `reconcileAcceptance()` in `tracker.mjs` runs when `acceptance.md` is
    edited, when a unit lands on MERGED, and at Stop (which catches ticks made
    through Bash):
    - A MERGED unit whose tagged criteria are all ticked, with every untagged
      whole-plan criterion also ticked, moves to COMPLETE. The model is told to
      update the matching `TRACKER.md` chip, since that file is hand-formatted.
      This bookkeeping transition never arms the compact gate.
    - An IN_PROGRESS unit whose criteria are all ticked is reported as ready to
      merge.
  - *Each unit now has a mechanical definition of done.* Criteria can be
    tagged `- [ ] [unit:<id>]`. `tracker.mjs` refuses MERGED/COMPLETE while the
    unit's tagged criteria are unticked and lists what is left. The Stop gate
    enforces tagged lines only for units the session worked, so a `--step`
    session isn't held to the rest of the plan.

- **`/plan`'s decomposition step no longer fails with "Agent type
  'plan-strategist' not found".** Plugin agents register under the plugin
  namespace (`craftsman:plan-strategist`), but `/plan` told the model to
  dispatch the bare `plan-strategist`, and `agent-mode-guard.mjs` only
  whitelisted the bare name — so even a correctly namespaced call would have
  been blocked under root-only mode. `/plan` and `_shared-analysis.md` now name
  `craftsman:plan-strategist` (and state the `craftsman:<agent>` rule for
  `subagents` mode); the guard accepts the namespaced type (bare name still
  tolerated), with regression tests for both.

- **The hand-off → `/compact` gate no longer bricks sessions that merely
  mention the close-out scripts.** `compact-nudge.mjs` was a `PostToolUse`
  (`Bash`) hook that decided a unit had been closed out by regex-matching the
  *text* of the command — so `cat handoff.mjs`, `grep -n tracker.mjs`, or
  running their tests armed a gate that blocks every subsequent tool call and
  that nothing inside a session can lift. It hard-locked three consecutive
  sessions, each one trying to fix it. The marker is now written by the scripts
  that own the event: `handoff.mjs` once the hand-off is actually on disk, and
  `tracker.mjs` on a real transition *into* a terminal status (which still
  covers the PARKED/BLOCKED exits that never reach a hand-off). `compact-nudge.mjs`
  and its hook entry are deleted. `wiring.test.mjs` now asserts that no hook
  script can arm the gate and that only those two scripts do, so no future hook
  can reintroduce the failure mode. `handoff.mjs` also warns when a payload
  carries no `session_id`, which previously armed the gate under `"shared"`
  while `compact-gate.mjs` looked under the real session and silently failed
  open.
- **Three command docs invoked stdin-only scripts as if they took argv.**
  `orchestrate.md`'s `scope.mjs {"action":"require",…}` and
  `_shared-execution.md`'s `scope.mjs {"action":"release",…}` /
  `plan-memory.mjs {"action":"compact",…}` would have hung on an empty stdin
  and then failed. All three now use the `printf '%s' '<JSON>' | node …` form
  the rest of the docs already use. (`log-router.mjs`, `log-specialist.mjs`
  and `doc-write.mjs` genuinely take argv and are unchanged.)
- **`learnedRules.enabled` is now honoured.** The flag ships in
  `craftsman.config.json` and is documented in `EXTENDING.md`, but neither
  `recordFailure` nor `topRules` read it — setting it `false` still collected
  failures and still narrated them at session start. Absent still means on, so
  existing configs are unaffected.
- **`plan.md` ran `plan-reviewer` on a model it doesn't declare.** The prose
  said `fable`; `agents/plan-reviewer.md` declares `haiku`. Both files were
  individually valid, so only a human reading the pair could catch it —
  `model-policy.mjs` now fails when a model named beside an agent reference in
  a command disagrees with that agent's own frontmatter.
- **Worktree sweep is now session-local.** `stop-gate.mjs`'s sweep blocked
  completion for *any* merged-but-surviving worktree in the repository,
  including ones created by concurrent or earlier sessions that it had no
  authority to clean up. `repo-exec.mjs` now records each worktree it
  prepares in a per-session ledger (`<git-common-dir>/.craftsman/sessions/<sid>/worktrees.json`)
  and retracts it on `cleanup`; the sweep considers only that set. Sessions
  that prepared no worktree — and pre-ledger sessions — are never blocked by
  it. The active-binding check above it was already session-scoped and is
  unchanged.
- **The secrets gate no longer blocks on its own test fixtures.**
  `scripts/secrets-scan.test.mjs` must contain a plausible AWS key to assert
  that the scanner flags and redacts it, so every Stop in this repo was blocked
  by a false positive. The built-in fallback scanner now honours gitleaks's
  inline `gitleaks:allow` marker (one convention, both scanners), and the two
  fixture lines carry it. Deliberately line-scoped, not path-scoped: a real
  credential landing in that same file is still caught by both scanners.

### Added

- **`/orchestrate` typed by the user now arms the scope guard too.**
  `orchestrate-scope-guard.mjs` was wired only to `PostToolUse` (`SlashCommand`),
  which the model's own invocations reach but a user typing `/orchestrate`
  into the prompt does not — so the session it mattered most for was the one
  that stayed unguarded. It is now also a `UserPromptSubmit` hook and reads
  either payload shape. The match stays anchored to the start of the prompt,
  so a message that merely mentions `/orchestrate` arms nothing.
- **Tests for `session-context.mjs`'s marker clearing.** SessionStart is the
  only path in the plugin that releases the compact gate; nothing covered it.

## [2.1.0] - 2026-09-09

Token-efficiency and mechanical-enforcement pass — every rule below moved from
prose ("the model should…") to something a hook actually blocks or forces.

- **Root-only agent mode, mechanically enforced.** New `execution.agentMode`
  config (default `root-only`). `agent-mode-guard.mjs` (`PreToolUse` on
  `Task`) hard-blocks subagent delegation/fan-out except `/plan`'s single
  decomposition step (`plan-strategist`, kept on `opus`; everything else in
  `/plan` runs on `sonnet`). Set `agentMode: "subagents"` to restore fan-out.
- **Model cost redistribution** — most agents downgraded to `haiku`;
  `implementer` and `security-auditor` stay on `sonnet`.
- **Mechanical auto-compact.** A hand-off (`handoff.mjs`) or a terminal
  tracker transition (`MERGED`/`BLOCKED`/`PARKED`/`COMPLETE`/`CANCELLED`) now
  marks the session compact-required; `compact-gate.mjs` hard-blocks every
  other tool call until a real `/compact` or `/clear` fires. Fires at the end
  of every plan "step"/unit, success or park — not just at final hand-off.
- **Mechanical worktree sweep.** `stop-gate.mjs` now hard-blocks completion if
  any non-primary worktree's branch is already fully merged but still present.
- **Mechanical scope activation for `/orchestrate`.** `orchestrate-scope-guard.mjs`
  (`PostToolUse` on `SlashCommand`) sets the scope-required flag the instant
  `/orchestrate` is invoked, so every Read/Write/Edit/Bash call is blocked
  until a scope is actually activated — no longer dependent on the command
  remembering to say so.
- **Gate-before-merge.** `repo-exec.mjs`'s `merge()` independently re-runs the
  project's own detected test command inside the worktree before allowing a
  merge (`repoExec.verifyTestsBeforeMerge`, on by default) — closes the gap
  where git-mechanics passed but nothing had actually re-checked tests.
- **`--no-verify`/`--no-gpg-sign` commit/push bypass is now a hard block**
  (`pre-guard.mjs`), not just a convention.
- **Plan memory is strictly relevance-gated.** `tags` (≥1) are now required on
  every record, summaries are capped at 220 chars, and `recallMemory` never
  blanket-dumps — an empty/no-match query returns nothing. Records are
  auto-pruned (`pruneAllMemory`, rate-limited from `SessionStart`).
- **Tracker ledger auto-compaction** (`compactLedger`) and a `TRACKER.md`
  size nudge, both rate-limited from `SessionStart`.
- **Doc size policy** (`scripts/doc-size-policy.mjs`) — a build-time char
  budget per file category (shared machinery, per-unit execution loop,
  commands, agents, skills), wired into `/craftsman:init`'s health check and
  CI, so an oversized shipped doc fails the same way a broken one would.
  `_shared-machinery.md`, `_shared-execution.md`, and `orchestrate.md`
  trimmed under their new budgets.
- **`SessionStart` injection trimmed** for token efficiency (measured ~327 →
  ~142 tokens on a test project); CLAUDE.md generation template reduced to a
  near-empty placeholder.
- **`docs/errors/KNOWN_ISSUES.md`** (machine-generated, write-only debt log)
  added to the generated `.claudeignore` — no command ever reads it back.
- **New regression tests** for the mechanical-enforcement hooks added this
  pass: `agent-mode-guard.test.mjs`, `orchestrate-scope-guard.test.mjs`,
  `compact-gate.test.mjs` (covers both `compact-nudge.mjs`/`compact-gate.mjs`).

## [2.0.0] - 2026-09-07

- **Fixed a self-inflicted cost regression** — `performance-reviewer` and
  `observability-reviewer` had been added as unconditional members of every
  ESCALATE-routed review panel, re-growing `_shared-execution.md` past the
  exact word count `docs/plans/token-efficiency.md` had trimmed it from.
  They're now gated the same way as the other four specialists: dispatched
  only when `scripts/gate-select.mjs` (or a reviewer's own judgment) actually
  flags the concern.
- **`scripts/gate-select.mjs`** — a deterministic backstop for step 5's
  mandatory specialist gates (`ui`/`migration`/`api`/`dependency`/
  `performance`/`observability`). Previously these were prose rules the
  orchestrating turn had to apply correctly, diff by diff, with nothing to
  catch a missed one; the script reads the actual diff (added-lines DDL/route/
  loop/outbound-call heuristics plus file-path/manifest matching) and is a
  floor under the prose rules, not a replacement for them.
- **Specialist-reviewer telemetry** — `scripts/log-specialist.mjs` + a new
  `/craftsman:stats` section report dispatch count and finding-rate per
  specialist agent, closing the gap where the six agents added over the last
  few rounds were invisible to the plugin's own "delete what doesn't earn its
  keep" philosophy.
- **Wiring tests** (`scripts/wiring.test.mjs`) — every
  `${CLAUDE_PLUGIN_ROOT}/...` path and every agent name referenced across
  `commands/`/`agents/` is now checked against the real file set, so a typo'd
  or orphaned reference fails CI instead of silently doing nothing.
- **React Native coverage** — new `react-native.md` checklist (supplements
  `javascript.md`/`typescript.md`: platform split files, re-render/list-perf,
  native-module/bridge safety, `StyleSheet.create` vs. inline styles,
  RN-flavored accessibility). Detected via a `react-native`/`expo` dependency
  in `package.json`; native build dirs (`ios/Pods/`, `android/build/`,
  `.expo/`, etc.) are added to the generated `.claudeignore`. `ui-ux-reviewer`
  now loads this checklist and treats RN's accessibility/responsive
  vocabulary (no DOM) as first-class rather than flagging non-issues.
- **Path-scoped language detection** — `languages.*` blocks can now match by
  project-relative path glob (`paths`), not just extension/filename, so a
  directory-scoped stack like Kubernetes manifests (`k8s/`, `manifests/`,
  Helm `templates/`) can be linted without colliding with unrelated YAML.
  `detectLang` takes an optional `context` so the glob resolves against the
  right project root.
- **Mobile and data/ML idiom checklists** — new `swift.md` and `kotlin.md`
  references (plus `craftsman.config.json` format/check wiring and stack
  detection for both), a `kubernetes.md` checklist for the new path-scoped
  language, and a `data-science.md` checklist for notebooks/pipelines
  (data leakage, reproducibility, notebook hygiene) that any Python-heavy
  ML repo can load alongside `python.md`.
- **Migration/API/dependency triggers now content-aware, not just file-pattern**
  — `review-router` escalates on raw schema-altering SQL or an
  unconventionally-located route/handler even without a migration file or
  routes-directory match, and `_shared-execution.md` states explicitly that
  the file-pattern gates are a floor, not a ceiling.
- **Built-in secrets-scan fallback** — if the configured scanner (`gitleaks` by
  default) isn't on `PATH`, the Stop gate now falls back to a dependency-free
  built-in scanner (`scripts/secrets-scan.mjs`, common key/token/private-key
  patterns) instead of just blocking on a missing tool. Opt out per-repo with
  `security.builtinFallback: false`.
- **Five new specialist agents** closing domain gaps beyond code
  correctness/security/UI: `migration-reviewer` (schema/migration safety —
  reversibility, data loss, lock risk), `api-reviewer` (REST/GraphQL/gRPC
  contract design and versioning), `dependency-auditor` (license/vulnerability/
  maintenance risk on a new or upgraded package), `performance-reviewer`
  (N+1 queries, unbounded work, missing pagination), and
  `observability-reviewer` (silent failure paths, missing instrumentation).
  Migration/API/dependency gates are mandatory-on-trigger like `security-auditor`;
  performance/observability join the advisory ESCALATE panel alongside
  `idiom-reviewer`. All five are wired into `/orchestrate` and
  `/scrutinise --deep`, and `review-router` now escalates on a manifest/lockfile
  change too.
- **Wider language coverage** — idiom-aware checklists added for PHP, Shell, and
  C/C++ (previously linted but falling through to the generic checklist), plus
  new Terraform and Dockerfile checklists. `craftsman.config.json` now ships
  format/check commands for Elixir, Dart, Terraform, and Dockerfile (the last
  via a new filename-based `languages.*.filenames` match, not just extensions).
- **`/craftsman:digest`** — an ADHD-friendly progress digest (`scripts/digest.mjs`)
  that reads the existing tracker ledger and reports only what shipped, what
  needs a human decision (BLOCKED/PARKED rows), what's next, and % complete per
  plan. No new state file; it's a read-only projection of `scripts/tracker.mjs`.
- **`ui-ux-reviewer` agent + `design-review` skill** — closes the UI/UX review
  gap: a diff touching component/view/template files or styles now gets a
  mandatory, advisory-only design pass (hierarchy, spacing, accessibility,
  generic-AI-slop patterns, responsive breakage) alongside the existing
  `security-auditor` gate in `/orchestrate`, and in `/scrutinise --deep`.
- **Repeatable `/craftsman:init` upgrades** — init now runs a deterministic audit,
  detects repository-specific test commands and package managers, reports missing
  quality tools, migrates older full-default configs to compact project overrides,
  and repairs missing `.claude/CLAUDE.md`/`.gitignore` structure without overwriting
  user-owned context. The migration is covered by an idempotence test.
- **Project-aware `.claudeignore` generation** — init now maintains a clearly
  delimited managed block covering dependencies, secrets, caches, build outputs,
  generated artifacts, and language-specific noise without overwriting custom
  ignore rules.
- **Transactional init modes** — init now supports `--check`, `--diff`, and
  `--write`; writes use temporary files, back up existing managed files, and roll
  back the in-memory originals if a write fails.
- **Full `/craftsman:init --update` pass** — update refreshes every project-owned
  Craftsman surface, reports the active plugin version, and inventories shipped
  commands, agents, hooks, scripts, skills, and defaults so an overhaul cannot
  silently leave an incomplete installation; every shipped `.mjs` is syntax
  checked and every shipped `.json` is parsed before changes are applied.
  - **Plan-aware updates** — `--update` now orders `docs/plans/` from active and
    unfinished work toward historical plans, audits every plan, and stamps
    canonical frontmatter with the current Craftsman version without rewriting
    task prose or tracker state.
- **Scoped multi-phase execution hardening** — plans now carry per-unit read/docs/write
  manifests enforced by `PreToolUse`; missing dependencies require explicit re-analysis
  and scope activation. Hand-offs and claims are session-scoped and atomic, and resumed
  sessions must activate a fresh unit scope before reading implementation context.
- **Model and fan-out efficiency** — scrutiny now uses a supported model, deterministic
  bookkeeping runs on `haiku`, deep review uses one comprehensive reviewer per module
  with a 12-call round cap, and `scripts/model-policy.mjs` rejects unknown model names.
- **Repository-local workspace execution** — selected projects now get their own
  base-branch discovery, worktree, merge lock, merge/push, and cleanup lifecycle;
  cross-repository steps cannot operate on the controller checkout.

## [1.2.0] - 2026-08-28

Self-review of the craftsman engine: closes five gaps found by reviewing the
plugin against its own standards.

### Added
- **C#/Java/C++ tooling wired up** — `csharp` now runs `dotnet format`, `java`
  now runs `google-java-format`/`checkstyle`, and a new `cpp` language block
  runs `clang-format`/`clang-tidy` (`clang-format` was already probed for but
  unused).
- **Review-router visibility in `/craftsman:stats`** — `review-router`'s
  ESCALATE/SKIP decisions and the learned-rules store are now surfaced as new
  "Review router" and "Learned rules" sections instead of being invisible.
- **`scripts/lib/core.mjs` unit tests** — a new `scripts/lib/core.test.mjs`
  suite (Node's built-in `node:test`) covering `globToRe`, `deepMerge`, and
  `normLine`, the engine's previously untested hand-rolled logic.
- **Multi-runner `stopGate.commands`** — a monorepo can list more than one
  test-runner marker (e.g. `package.json` and `go.mod`) and every matched
  command now runs at session start and is re-checked at Stop, instead of only
  the first match.
- **`/orchestrate` reads less per run** — `--step`'s pre-approval plan summary
  no longer reads the 1,780-word `_shared-machinery.md` protocol before the
  user has even approved the step; the resume loop now re-reads a plan doc's
  full task text only at request-resolution, post-compaction, or immediately
  before executing a unit, instead of on every loop iteration.
- **`/scrutinise` skips the LLM review panel on whitespace-only diffs** — a
  new `scripts/diff-triviality.mjs` fast path short-circuits the router +
  `code-reviewer` + panel for a provably whitespace-only change; it always
  still runs the mechanical floor (format/lint/typecheck/test), excludes
  Python/YAML/Makefiles (where `git diff -w` can't be trusted — indentation is
  semantic there), and fails safe to "review as normal" on any error or an
  option-like argument. The `--deep` exhaustive-audit protocol (Phase D) moved
  out of the always-loaded command body into `commands/_scrutinise-deep.md`,
  read only when `--deep` is passed.
- **`planning.blindRederivation` config knob** — `/plan`'s independent
  second-derivation double-check can now be forced `"always"` or turned
  `"never"` off per repo instead of only following the built-in size
  heuristic (`"auto"`, the unchanged default).
- **All craftsman state anchors to the actual project root, not `cwd`** —
  `scripts/lib/core.mjs` now resolves `PROJECT_ROOT` via `git rev-parse
  --show-toplevel` (falling back to `$CLAUDE_PROJECT_DIR`, then `cwd`) once,
  and every script, check invocation, and config/marker lookup uses it
  instead of `process.cwd()`. Fixes a real split where a session opened one
  directory above a repo wrote hook state to the wrong `.craftsman/`, so the
  acceptance-criteria gate silently never enforced anything and stack
  detection reported "unknown" for a fully-recognized repo. Marker detection
  (`markerPresent`) is also now git-tracked-file based, so a `*.csproj` two
  directories down or a monorepo's `go.mod` in a service folder is found —
  previously only the literal repo root was checked.
- **`plan-reviewer` (renamed from `design-reviewer`) is now actually
  dispatched** — from `/plan` Phase 1, once per unit (or once for a small
  plan), where its `ACCEPTANCE CRITERIA:` output is merged into
  `.craftsman/acceptance.md` instead of being hand-authored a second time.
  Previously the agent that reviews *plans* was being invoked for *rendered
  UI conformance* (`/orchestrate`, `/scrutinise`, the `--deep` audit), work
  its own definition never covered, while the one caller it was built for
  never called it. All UI-conformance dispatch and the `/design` planner it
  depended on (referenced in three places but never implemented) are removed
  rather than half-wired further; a UI-surface request now routes to `/plan`
  like everything else.
- **`standards-keeper` is wired into `/scrutinise`'s review panel** (both the
  default pass and `--deep`), audit mode, scoped to the touched
  module/family — previously defined but dispatched from nowhere. It now
  derives a standard inline for one pass when none is persisted, instead of
  only bouncing back "run derive mode" with no caller for that either.
- **`protectedPaths` no longer hard-blocks real source** — `**/bin/**` and
  `**/obj/**` matched `src/bin/main.rs`, `bin/cli.js`, and `bin/rails` and
  refused edits to them outright. Both stay in `ignore` (skip linting only,
  no edit block) and are dropped from the hard-block list, which now covers
  only genuinely unambiguous generated/vendored/lock/secret paths.
- **Secrets scan targets the working tree, not the index** —
  `gitleaks protect --staged` scanned whatever was staged, which is normally
  nothing mid-turn (the implementer never runs `git add`), so the "secrets
  scanning runs before your turn ends" promise in the session-start prompt
  was checking an empty set. Now `gitleaks dir .`.
- **A slow check no longer reports as a finding you wrote** —
  `runChecks` separates `timedOut` from `failures`; a tool that hits the
  per-check timeout (e.g. whole-crate `clippy` on a big file) is logged and
  silently skipped instead of being fed back as "1 new issue introduced."
  Project/package-scoped checks (`go vet ./{dir}`, `staticcheck`, `cargo
  clippy --all-targets` — new `languages.*.projectScoped: true` flag) now
  keep only output lines attributable to the file that was actually edited,
  so a sibling file's pre-existing issue can't be misattributed as new.
- **Command frontmatter no longer overrides your chosen model** by default —
  `/understand`, `/investigate`, and `/fix-tests` dropped their `model: opus`
  pin (all mechanical fan-out/triage, not reasoning-bound); `/plan` keeps
  `opus` as the one command where the case is strongest.
- **Stop gate skips the test suite when nothing changed** — the PostToolUse
  gate drops a per-session "dirty" marker on every real edit; Stop only
  re-runs the session-start-green test commands when that marker is present,
  and clears it once it has (a question-only turn, or a second Stop right
  after a passing one, no longer re-runs a multi-minute suite for nothing).
  `stopGate.testTimeoutMs` default lowered 300000→250000ms so a full-length
  run has headroom inside the Stop hook's own 300s ceiling instead of being
  killed by it.
- **Blast-radius tracing runs once, not three times per feature** —
  `/plan` now persists `consumer-tracer`'s findings into the plan doc's
  Verification background as a `CONSUMERS:` block; `/orchestrate` Phase B
  reads that instead of re-deriving the same contract's consumers before a
  line of code has changed. The post-merge drift check (Phase D, over the
  *merged* set, genuinely new information) is unchanged.
- **`/orchestrate`'s per-unit review is routed** — Phase X step 8 now runs
  `review-router` before `code-reviewer`, the same SKIP/ESCALATE pattern
  `/scrutinise` already used; a small, low-risk unit that already passed the
  deterministic gate skips the LLM review pass instead of paying for it on
  every unit regardless of size. This is the highest-volume review path in
  the plugin, so it's where routing pays for itself the most.
- **`_shared-machinery.md` split** — the per-unit execution protocol (Phase
  L locking, Phase X's 11-step loop, Finalization — the expensive ~1,500
  words) moved to a new `_shared-execution.md`, read only once `/orchestrate`
  Phase C is actually about to run it. `_shared-machinery.md` keeps just the
  Standing constraints, MCP conventions, and the tooling-manifest contract —
  needed by every execution-adjacent command, cheap enough to read
  unconditionally. `/scrutinise` and `/sync-docs`, which only ever needed
  the light half, get smaller for free.
- **`--deep` audit fan-out is capped** — the defect-class × module matrix
  now caps at the top 12 modules by changed-line count (logged if any are
  dropped), and the loop-until-dry re-fan only continues on Warning/Major+
  findings, with a hard 4-round ceiling regardless of dryness.
- **C# per-file check dropped** — `dotnet format --verify-no-changes` run
  immediately after `dotnet format` on the same file can never fail (the
  format step already fixed it), so it was pure MSBuild latency for a gate
  that couldn't gate anything. `csharp` now formats only; regression
  detection is the Stop-gate's `dotnet test`.
- **Doc-write guard narrowed to `docs/plans/**`** (from all of `docs/`) —
  that's the surface with real concurrency stakes (the tracker, plan docs);
  the rest of `docs/` (architecture, README, standards) is now freely
  editable rather than hard-blocked behind a session grant for routine prose
  fixes. Widen it back to `["docs/**"]` in config if your project wants the
  stricter default.
- **Learned-rules signature extraction is tool-aware, and rules decay by
  age** — `recordFailure`'s signature regex previously matched only
  uppercase-code-style identifiers, so every ESLint finding (kebab-case rule
  ids) collapsed onto one generic signature; it now also recognizes ESLint's
  trailing `[Error/rule-id]`/`[Warning/rule-id]` (its `--format unix`, this
  plugin's default), a bare trailing `(rule-id)` some other formatters use,
  and ruff/mypy-style leading codes. `topRules` now
  also requires a hit within `learnedRules.maxAgeMs` (default 30 days) —
  previously a mistake seen 3 times, ever, was narrated in every future
  session forever.
- **Session-start tool probing is scoped to the detected stack** — the
  "not installed" line probed a fixed 22-tool list regardless of what the
  repo actually uses; it now probes only the tools relevant to the languages
  actually detected (plus `gitleaks`/`shellcheck`, which apply regardless),
  fewer subprocess spawns and a line that means something for this repo. The
  weekly tooling cache is now keyed to the scoped tool list, so it can't
  serve a stale probe set after langs change.
- **Path handling fixes** — `tokenize()` substitutes `{file}`/`{dir}` into
  each already-split argument instead of splitting the filled template
  afterward, so a path containing a space no longer becomes two arguments.
  `PLUGIN_ROOT` resolves via `fileURLToPath` instead of a raw `.pathname`
  read, fixing a leading-slash bug on Windows.
- **Unused `userConfig` removed** — `PLANS_DIR`/`DOCS_DIR` were prompted for
  at install but never read anywhere; removed rather than wired to a
  substitution mechanism speculative enough to risk silently breaking `docs/`
  resolution if the assumption were wrong.
- **Cross-file `Read` instructions use `${CLAUDE_PLUGIN_ROOT}`** — several
  commands pointed at sibling files with a bare relative Markdown link
  (`[_shared-machinery.md](_shared-machinery.md)`), resolvable by a human
  reading the repo but not by the model, which doesn't know the command
  file's own location; the Bash lines in the same files already used
  `${CLAUDE_PLUGIN_ROOT}` correctly. Now consistent throughout.
- **`scripts/lib/core.test.mjs` extended** — new coverage for `tokenize`
  (via `filterAttributed`), `filterAttributed`, `extractSig`, and
  `markerPresent`, the additions from this pass most likely to regress
  silently. **`.github/workflows/ci.yml` added** — runs `node --test` and
  `node --check` on every script, plus a config JSON-parse check, on push/PR.
- **`/craftsman:baseline` now records what it skips** — pre-existing
  findings were always excluded from the quality gate, but previously only
  survived in the gitignored `.craftsman/baseline/` snapshot (opaque,
  per-file, local-only). It now also writes `docs/errors/KNOWN_ISSUES.md`: a
  single worst-first table (file, language, tool, finding count, a truncated
  sample), regenerated wholesale on every baseline run, tracked in git so
  the whole team — and future sessions — can see and prioritize the debt
  instead of it silently disappearing. New `baseline.errorsDoc` config key
  (default `"docs/errors/KNOWN_ISSUES.md"`; set to `false` to disable).
  `/sync-docs --arch` excludes it from reconciliation — it's machine-managed
  by `/craftsman:baseline`, not hand-authored architecture prose.
- **Stop-gate secrets scan skips a clean tree, never silently on an
  incomplete one** — `git status --porcelain --ignored` (not the
  Write/Edit-only session `dirty` marker, which a Bash-created file never
  sets) now gates whether the mandatory secrets scan runs on a given Stop,
  instead of running unconditionally every time. A session-scoped guarantee
  still forces at least one real scan per session regardless of dirtiness,
  so an already-committed secret that predates the session can't go
  permanently unscanned, and the marker is keyed to a signature of
  `security.check` so a mid-session config change forces a fresh scan too —
  and the marker only ever reflects a scan that actually finished (tracked
  batch-wide across every configured `security.check` command), never one
  that was cut short. A scan that gets killed for any reason — the shared
  time budget, its own configured timeout, or never even starting because
  the budget was already exhausted — hard-blocks with a `SECRETS SCAN
  INCOMPLETE` message instead of either being silently treated as clean or
  misreported as a confirmed hit; "secrets are always a hard block, never
  baselined" now holds for an unfinished scan too, not just a finished one
  that found something. `.craftsman/`, the plugin's own always-present,
  constantly-changing runtime-state directory, is excluded from the dirty
  check so it stops making every tree read as dirty.
- **Stop-gate commands run concurrently under one shared budget** — the
  secrets scan, every matched test runner, and every `extraChecks` entry now
  dispatch together under a single `stopGate.totalBudgetMs` (default
  280000ms) instead of three independent sequential loops each getting their
  own full timeout, fixing a real case where one test runner's
  `testTimeoutMs` (250000ms) plus the secrets scan (60000ms) could already
  exceed the Stop hook's 300s ceiling in `hooks/hooks.json` with only one
  configured test command. A test/guard command cut short by the shared
  budget (rather than genuinely failing) is now correctly logged and
  skipped instead of being misreported as a test regression or guard
  failure.
- **Quote-safe command splitting in `stop-gate.mjs`/`snapshot.mjs`** — both
  now use a new `splitCmd` export (`scripts/lib/core.mjs`), sharing the
  quote-aware logic `tokenize()` already had, instead of a naive
  `cmd.split(" ")` that broke on any quoted or spaced argument.
  `snapshot.mjs`'s `testTimeoutMs` fallback default also now matches
  `stop-gate.mjs`'s (`250000`, was `180000`).
- **Marker detection sees untracked-but-not-ignored files** —
  `gitTrackedFiles()` (used by stack detection, Stop-gate runner selection,
  and `/craftsman:baseline`, which now shares this helper instead of its own
  duplicate implementation) reports a freshly scaffolded `package.json`/
  `go.mod` immediately instead of only after it's committed.
- **Tool-presence probing distinguishes "not installed" from "can't
  check"** — `which()` and `session-context.mjs`'s tool probe no longer
  silently treat a missing `which`/`where` binary the same as a missing
  target tool; they now warn once when it's the probe itself that's absent.
  `session-context.mjs`'s probe also gained the Windows (`win32` →
  `"where"`) branch it previously lacked entirely, where every tool
  unconditionally read as absent.
- **`cacheKey()` covers `format`/`projectScoped`** — a changed formatter
  config or `projectScoped` setting now busts the check cache the same way a
  changed `check` config already did, instead of silently leaving
  already-cached files unformatted under the new rules.
- **`/understand`, `/investigate`, and `/sync-docs --tracker` fan-out is
  capped** — bounded to ~15 modules/segments/rows with explicit logging of
  what's excluded, matching the discipline `/scrutinise --deep` already had,
  instead of an unbounded fan-out that risked runaway cost on a
  densely-coupled or monorepo-wide target.

## [1.0.0]

The generalized, stack-agnostic evolution of the craftsman v0.2 starter.

### Added
- **Doc-first command loop** — `understand`, `plan`, `orchestrate`, `investigate`,
  `scrutinise`, `sync-docs`, `fix-tests`, plus `_shared-machinery`.
- **`/craftsman:init`** — fingerprints a repo's stack (languages, real test command,
  package manager, CI, installed vs missing tools) and scaffolds a project config +
  starter `CLAUDE.md`.
- **Language-aware planning** skill with idiom references for Python, TypeScript,
  JavaScript, Go, Rust, Java, C#, Ruby, and a generic fallback, plus a canonical
  plan template.
- **Generic agent set** — implementer, code-reviewer, security-auditor, build-doctor,
  consumer-tracer, docs-curator, phase-tracker, standards-keeper, review-router,
  design-reviewer, idiom-reviewer.
- **Doc-write authority guard** — only `/plan`, `/orchestrate`, `/sync-docs` may edit
  `docs/`, enforced deterministically per session.
- **Concurrency safety** — per-session state under `.craftsman/sessions/<id>/`; a
  session's Stop clears only its own authority; separate worktrees isolate automatically.
- **Non-blocking session start** — the test-green snapshot runs in the background;
  tool detection cached weekly; the two PreToolUse checks share one Node spawn.

### Carried over from craftsman v0.2
- Regression-only reporting with a per-file baseline and content-hash cache.
- Feedback loop via `exit 2`; secrets + test-regression + acceptance-criteria Stop gate.
- Escape hatches (`CRAFTSMAN=off`, `/craftsman:toggle`, per-project config deep-merge)
  and `/craftsman:stats` cost/benefit reporting.

### Notes
- Supersedes the craftsman v0.2 starter — do not run both (shared `.craftsman/`
  state and `craftsman` plugin name).
