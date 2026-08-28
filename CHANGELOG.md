# Changelog

All notable changes to craftsman are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
- **Stop-gate secrets scan skips a clean tree** — `git status --porcelain
  --ignored` (not the Write/Edit-only session `dirty` marker, which a
  Bash-created file never sets) now gates whether the mandatory secrets scan
  runs on a given Stop, instead of running unconditionally every time. A
  session-scoped guarantee still forces at least one real scan per session
  regardless of dirtiness, so an already-committed secret that predates the
  session can't go permanently unscanned, and the marker is keyed to a
  signature of `security.check` so a mid-session config change forces a fresh
  scan too. `.craftsman/`, the plugin's own always-present,
  constantly-changing runtime-state directory, is now excluded from the dirty
  check so it stops making every tree read as dirty.
- **Stop-gate commands run concurrently under one shared budget** — the
  secrets scan, every matched test runner, and every `extraChecks` entry now
  dispatch together under a single `stopGate.totalBudgetMs` (default
  280000ms) instead of three independent sequential loops each getting their
  own full timeout, fixing a real case where one test runner's
  `testTimeoutMs` (250000ms) plus the secrets scan (60000ms) could already
  exceed the Stop hook's 300s ceiling in `hooks/hooks.json` with only one
  configured test command.
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
