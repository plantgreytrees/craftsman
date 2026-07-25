# Changelog

All notable changes to craftsman are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

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
