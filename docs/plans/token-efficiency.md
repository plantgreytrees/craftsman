---
slug: token-efficiency
classification: in-scope # self-review of the plugin's own engine; README.md:1-11
tracker_rows: [TRACKER#5, TRACKER#6, TRACKER#7, TRACKER#8]
guards:
  blast_radius: done # grep-only repo, no HTTP/event boundary; consumer-tracer not needed
  completeness_sweep: done
  blind_rederivation: skipped(trivial-per-unit; each unit is a self-contained doc/config edit with no shared code contract)
coverage:
  contract:      N/A(no shared code API/type/schema change — these are command-prompt and config-schema edits, not code)
  data:          N/A(no persistence/migration)
  config:        C.1 | N/A
  security:      N/A(no authn/authz/secret/input-boundary surface touched; new script only inspects git diff output, never executes diff content)
  tests:         B.1 (manual script verification; no LLM-in-the-loop behavior is unit-testable)
  observability: N/A(no new logEvent surface requested; out of scope per Risk & rollback)
  interface:     N/A(no UI/API/CLI flag surface beyond the new script's own CLI, covered under B.1)
  docs:          A.2 | B.3 | C.3 | D.1
  rollback:      see Risk & rollback
units:
  - id: A
    module: commands/orchestrate.md
    language: Markdown (Claude Code command prompt)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: B
    module: commands/scrutinise.md, commands/_scrutinise-deep.md (new), scripts/diff-triviality.mjs (new)
    language: Markdown + JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: C
    module: craftsman.config.json, commands/plan.md, EXTENDING.md
    language: JSON + Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: D
    module: CHANGELOG.md
    language: Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
---

# Plan: Token-efficiency improvements to the craftsman command loop

## Outcome
`/orchestrate --step` no longer pays to read the 1,780-word shared execution
protocol before a plan-preview the user might reject; `/orchestrate`'s resume
loop stops re-reading a growing plan doc's full task text every iteration once
earlier units are already merged; `/scrutinise` skips its exhaustive `--deep`
audit instructions entirely unless `--deep` is actually passed, and skips the
whole review panel (router + code-reviewer) outright for provably
whitespace-only diffs; and `/plan`'s expensive blind-rederivation
double-check becomes a config-tunable knob (`planning.blindRederivation`,
default `auto` = today's unchanged heuristic) instead of a hardcoded always-on
rule for non-trivial requests.

**Scope note (from scrutiny before this plan was written):** an earlier draft
of this work included routing `phase-tracker`/`docs-curator` to a cheaper
model. That was dropped — a model change alters cost-per-token and latency,
not the number of tokens processed, so it doesn't serve "use as few tokens as
possible" and both agents' jobs (reconciling evidence, writing doc updates)
involve real judgment unlike `review-router`'s fixed-rubric one-word output.
Also dropped: extracting Phase L (merge-locking) out of
`_shared-machinery.md` — its mechanics are exercised on every unit merge, not
just concurrent-session scenarios, so extracting it would not have reduced
what a real orchestrate run actually reads.

## Units (executable core)

### Unit A — commands/orchestrate.md (Markdown, normal)
Tooling: implementer implementer · gates none (prompt-doc edit, no code path) · skills none · guards none

- [ ] A.1 Restructure the top intro paragraph (currently: "Input `$ARGUMENTS`,
  resolved in Phase A. **First: `Read` [_shared-machinery.md]...**") so the
  `_shared-machinery.md` Read is described as happening **before Phase B, for
  every branch except `--step`'s pre-approval summary** — cross-reference
  Phase A.1's deferred-Read wording (task A.2) instead of asserting an
  unconditional "First" Read.
  → accept: the intro paragraph no longer says `_shared-machinery.md` is read
  unconditionally first; it points to Phase A.1 for the `--step` exception.
- [ ] A.2 Rewrite Phase A's `--step <tracker-id>` branch: build the plan
  summary from `docs/plans/TRACKER.md`'s row + the resolved plan doc **only**,
  explicitly instruct **not** to `Read` `_shared-machinery.md` yet, WAIT for
  user approval, and only **after** approval `Read` `_shared-machinery.md`
  before running Phases B–E. Preserve the existing "if the row is already
  done, say so and stop" behavior.
  → accept: the `--step` branch text contains an explicit "do not Read
  `_shared-machinery.md` yet" instruction before the wait, and an explicit
  "Read `_shared-machinery.md`" instruction after approval, in that order.
- [ ] A.3 Reword the "Resume rule" paragraph: re-reading
  `docs/plans/TRACKER.md`'s execution rows + lock files happens at the start
  of **every** loop iteration (unchanged — this is the cheap, authoritative
  status check); re-reading the **full plan doc's task text** happens only
  when first resolving the request, immediately after a compaction, or
  immediately before Phase C executes that specific unit's tasks — not on
  every iteration once a unit's row already reads MERGED. Keep the existing
  "Tracker state on disk is the source of truth, not conversation memory"
  sentence and the Background `file:line` re-verification sentence unchanged
  in substance.
  → accept: the Resume rule paragraph distinguishes "always re-read: tracker
  rows + lock files" from "re-read full plan doc only: at request-resolution
  time, post-compaction, or immediately before executing that unit" — it no
  longer reads as an unconditional full-doc re-read every iteration.

### Unit B — commands/scrutinise.md token-efficiency (Markdown + JS, normal)
Tooling: implementer implementer · gates none · skills none · guards none

- [ ] B.1 Create `scripts/diff-triviality.mjs`: a dependency-free Node ESM CLI
  (shebang `#!/usr/bin/env node`, style consistent with `scripts/toggle.mjs`/
  `scripts/log-router.mjs`). Usage: `node diff-triviality.mjs [<git-range>]`.
  Runs `git diff -w --ignore-blank-lines [<range>]` (whitespace- and
  blank-line-insensitive); if the output is empty, print `TRIVIAL` and exit 0;
  otherwise print `SUBSTANTIVE` and exit 1. **Fail safe:** if the `git`
  invocation itself errors for any reason, print `SUBSTANTIVE` and exit 1 —
  never silently report `TRIVIAL` on a tool failure.
  → accept: on a whitespace-only change (e.g. re-indent a file, no line
  content changes) the script prints `TRIVIAL` and exits 0; on a change that
  adds/removes a real line it prints `SUBSTANTIVE` and exits 1; run from a
  non-git directory it prints `SUBSTANTIVE` and exits 1 (does not throw
  uncaught).
- [ ] B.2 In `commands/scrutinise.md`'s Phase 0, add a new first step: resolve
  `<range>` the same way the existing target-resolution step does, run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/diff-triviality.mjs" <range>` via Bash;
  on `TRIVIAL`, skip Phase 1 entirely (no router call, no `code-reviewer`, no
  panel) and go straight to Phase 2's assemble/hand-off step with zero
  findings, recording "whitespace-only diff — review skipped" as the reason;
  on `SUBSTANTIVE` (including any script error), proceed through Phase 0/1
  exactly as today. Renumber the existing Phase 0 steps after this insertion.
  → accept: Phase 0 contains the triviality-check step before the existing
  mechanical-floor step, with an explicit `TRIVIAL` → skip-Phase-1 branch and
  an explicit `SUBSTANTIVE`/error → proceed-normally branch.
- [ ] B.3 Extract the entire `## Phase D — --deep: exhaustive whole-run audit`
  section out of `commands/scrutinise.md` into a new file
  `commands/_scrutinise-deep.md` (underscore-prefixed, matching
  `_shared-machinery.md`'s "not user-invocable on its own" convention — add
  the same one-line convention note at its top). In `scrutinise.md`, replace
  the extracted section with a one-line pointer inside the existing "Two
  depths" paragraph: on `--deep <run-slug>`, `Read`
  [_scrutinise-deep.md](_scrutinise-deep.md) and follow its Phase D there —
  do not inline the content back.
  → accept: `commands/scrutinise.md` no longer contains the Phase D step
  list; `commands/_scrutinise-deep.md` exists with that content verbatim (or
  trivially reformatted for standalone readability) plus the "not
  user-invocable" note; the "Two depths" paragraph in `scrutinise.md`
  instructs reading the new file on `--deep`.

### Unit C — config-tunable blind-rederivation gate (JSON + Markdown, normal)
Tooling: implementer implementer · gates none · skills none · guards none

- [ ] C.1 Add a `planning` block to `craftsman.config.json`'s top-level
  defaults: `{ "planning": { "blindRederivation": "auto" } }` (placed
  alongside the other top-level tunables, e.g. near `docWriteGuard`).
  → accept: `node -e "JSON.parse(require('fs').readFileSync('craftsman.config.json','utf8'))"`
  exits 0; `planning.blindRederivation` is `"auto"`.
- [ ] C.2 In `commands/plan.md` Phase 1 step 4, change the gate's condition
  from unconditional-heuristic to config-read-first: read
  `craftsman.config.json`'s `planning.blindRederivation` (default `"auto"`
  if absent/malformed). `"never"` → always skip, record
  `blind_rederivation: skipped(config:never)`. `"always"` → always run
  regardless of request size/shape. `"auto"` → apply the existing heuristic
  unchanged (multi-module OR shared-contract OR migration OR
  security-sensitive → run; else `skipped(trivial)`). Preserve the rest of
  step 4's "when run" instructions verbatim.
  → accept: step 4's text names all three `planning.blindRederivation`
  values and their effect, with `"auto"` producing byte-for-byte the same
  trigger condition as the current unconditional text.
- [ ] C.3 Add a short note + example to `EXTENDING.md` (a new small
  subsection or an addition to an existing relevant one) documenting
  `planning.blindRederivation`: what it controls, its three values, and that
  `"auto"` is the default matching prior behavior — so a repo that has
  measured (via `/craftsman:stats`, once router-decision data exists) that
  the gate isn't paying for itself can turn it off without hand-editing
  `commands/plan.md`.
  → accept: `EXTENDING.md` contains a `planning.blindRederivation` example
  with all three values named.

### Unit D — CHANGELOG (Markdown, normal)
Tooling: implementer implementer · gates none · skills none · guards none

- [ ] D.1 Append three new bullets to `CHANGELOG.md`'s existing
  `## [Unreleased]` → `### Added` section (do not create a second Unreleased
  header): (1) the `/orchestrate --step` deferred-Read + trimmed resume-loop
  re-read; (2) `/scrutinise`'s whitespace-only fast path
  (`scripts/diff-triviality.mjs`) and the `--deep` Phase D extraction into
  `_scrutinise-deep.md`; (3) `planning.blindRederivation` config knob for
  `/plan`'s blind-rederivation gate.
  → accept: `CHANGELOG.md`'s existing `## [Unreleased]` → `### Added` list has
  three new bullets appended, no new `## [Unreleased]` header created.

## Sequencing
Units A, B, C touch disjoint file sets (no overlap) — independent, any order.
Unit D depends on A/B/C's final wording to summarize accurately, so it runs
last, after A/B/C are merged.

## Verification background
- `_shared-machinery.md` Phase X.9d references "acquire the merge-only lock
  (Phase L)" as part of every unit's merge step — confirms Phase L is used
  unconditionally per merge, not just under concurrency, which is why it was
  dropped from scope rather than extracted (see Outcome's Scope note).
- `commands/orchestrate.md:14` — the unconditional "First: `Read`
  `_shared-machinery.md`" instruction, ahead of Phase A's branch resolution.
- `commands/orchestrate.md:18` — the `--step` branch's existing
  plan-approval-stop wording, which the deferred-Read change slots into.
- `commands/orchestrate.md:23` — the "Resume rule" paragraph's current
  unconditional "re-read the plan doc + the execution rows... at the start of
  every loop iteration" wording.
- `commands/scrutinise.md:16` — "Two depths" paragraph naming Phase D as the
  `--deep`-only path.
- `commands/scrutinise.md`'s "## Phase D" section (~400 words) is the
  extraction target — self-contained, no Phase 0–2 cross-references into it.
- `commands/scrutinise.md`'s Phase 0 step 2 ("Run the project's own
  deterministic checks...") is the existing mechanical-floor precedent the
  new triviality check slots in ahead of.
- `commands/plan.md`'s Phase 1 step 4 — the current unconditional heuristic
  text being made config-conditional.
- `craftsman.config.json`'s existing `docWriteGuard`/`stopGate` blocks are the
  style precedent for the new `planning` block.

## Risk & rollback
All four units are additive or prompt-rewording changes with no runtime code
path affected outside the one new script:
- Unit A changes only *when* an LLM-driven command Reads a file and *how much*
  it re-reads on each loop iteration — behaviorally, Tracker-state-as-truth is
  unchanged, and the plan doc is still read in full at request-resolution and
  before each unit's execution, so no information is permanently lost, only
  re-read timing shifts. Revert: restore the original unconditional wording.
- Unit B's script fails safe to `SUBSTANTIVE` on any error (task B.1), so a
  bug in it at worst costs the *skip* (falls back to today's always-run
  review), never a missed review. The Phase D extraction is a pure content
  move — revert by inlining `_scrutinise-deep.md`'s content back.
- Unit C's default (`"auto"`) is byte-for-byte the current behavior — a repo
  that never sets `planning.blindRederivation` sees zero change. Revert:
  remove the `planning` block and the config-read step in `plan.md`.
- Unit D is documentation only.

## Out of scope
- Routing `phase-tracker`/`docs-curator` to a cheaper model — dropped in
  scrutiny (see Outcome's Scope note): doesn't reduce token count, and both
  agents require judgment a fixed-rubric router doesn't.
- Extracting Phase L out of `_shared-machinery.md` — dropped in scrutiny: used
  unconditionally per merge, not conditionally on concurrency.
- Adding a `planning`-style config knob to `/scrutinise --deep` — `--deep` is
  already explicitly user-flag-gated; a silent config override there would
  undermine an explicit request rather than trim ambient/default behavior.
- New `logEvent` instrumentation for the triviality skip or the
  blind-rederivation knob — not requested, and `/craftsman:stats` already has
  no `ev` bucket for `/plan`-side decisions; adding one is a separate,
  larger change (its own observability plan) not bundled here.
