# Changelog

All notable changes to craftsman are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

This file is kept under 8 KB (ARCH-SLIM-08). Earlier detail lives in git history
and `git log -- CHANGELOG.md`.

## [Unreleased]

### Added

- **Plan hierarchy: epic, story and feature levels.** Plans take `level`,
  `parent`, `children` and `priority`; `/orchestrate` and `/auto` accept
  `--level` and `--feature`. Epics and stories get generated rollup
  `TRACKER.md` files, and `tracker.publish` pushes progress to the base
  branch. New keys `planning.featureBranches` (off), `planning.featureUnitCap`,
  `execution.maxSubagents` (0) and `execution.maxSessions` (reserved) change
  nothing until set. See EXTENDING.md.
- **`/craftsman:account-switch`**: carry a session across an account or org
  switch via a handoff note.
- Many other additions from the 2.x line (condensed): mechanical hooks,
  engine/unit-runner split, slim-rules architecture checks, worktree-per-unit
  execution, and tracker/claim scripts.

### Changed

- Unreleased notes before plan-hierarchy were condensed to meet the size cap.

## [2.1.0] - 2026-09-09

Token-efficiency and mechanical-enforcement pass: rules moved from prose to
hooks that block or force them. Added `execution.agentMode` (default
`root-only`) enforced by `agent-mode-guard.mjs`, and capped fan-out in
scrutinise-style commands.

## [2.0.0] - 2026-09-07

Major restructure of commands, agents and config; see git history for the
full list of breaking changes.

## [1.2.0] - 2026-08-28

Added a design-review pass (advisory) and further idiom references.

## [1.0.0]

The generalized, stack-agnostic evolution of the craftsman v0.2 starter:
doc-first command loop, `/craftsman:init`, language-aware planning, and a
generic agent set.
