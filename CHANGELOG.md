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
- **`/scrutinise` skips review entirely on whitespace-only diffs** — a new
  `scripts/diff-triviality.mjs` fast path (fails safe to "review as normal" on
  any error) short-circuits the router + `code-reviewer` + panel for a
  provably whitespace-only change; the `--deep` exhaustive-audit protocol
  (Phase D) moved out of the always-loaded command body into
  `commands/_scrutinise-deep.md`, read only when `--deep` is passed.
- **`planning.blindRederivation` config knob** — `/plan`'s independent
  second-derivation double-check can now be forced `"always"` or turned
  `"never"` off per repo instead of only following the built-in size
  heuristic (`"auto"`, the unchanged default).

## [1.0.0]

The generalized, stack-agnostic evolution of the craftsman v0.2 starter.

### Added
- **Doc-first command loop** — `understand`, `plan`, `orchestrate`, `investigate`,
  `scrutinise`, `sync-docs`, `run-fix-tests`, `ultra-think`, plus `_shared-machinery`.
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
