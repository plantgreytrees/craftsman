---
slug: scrutinise-feature-branch-plans
goal: The CI script-size warning never fails a PR, and doc-retire refuses whenever it cannot prove a plan is safe to remove.
parent: feature-branch-plans
priority: P2
classification: "in-scope (/scrutinise feature-branch-plans, isolated scrutineer, 2026-10-18; round 1: 1 Critical, 5 Warning; round 2 on 7fc96bb: 1 Warning; round 3 on ce993dd: 2 Architecture Warnings, deferred by the user)"
tracker_rows: [TRACKER#scrutinise-feature-branch-plans]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      N/A(doc-retire.mjs has no consumers yet; script-size-delta.mjs is called only by ci.yml)
  data:          N/A(no persistence change)
  config:        2.3 | reads docWriteGuard.pendingTtlMs/ttlMs/enabled, same defaults as pre-guard
  security:      2.1, 2.3 | referrer scan fails closed; grant matches pre-guard's TTLs and root STATE_DIR
  tests:         1.1, 2.1, 2.2, 2.3, 3.1 each carry their test
  observability: 1.1 | ::notice:: / ::warning:: annotations
  interface:     N/A(no CLI flags change)
  docs:          N/A(no user-facing behaviour change beyond the fix)
  rollback:      revert the unit's merge commit; 3.1 makes retire's own rollback leave the index clean
units:
  - id: ci-size-delta
    scope_id: ci-size-delta
    project: .
    depends_on: []
    module: scripts/script-size-delta.mjs
    language: javascript
    security: normal
    scope:
      read: [.github/workflows/ci.yml, scripts/stats.test.mjs]
      docs: [docs/architecture/slim.rules.md]
      write: [.github/workflows/ci.yml, scripts/script-size-delta.mjs, scripts/script-size-delta.test.mjs]
    arch: [ARCH-SLIM-07]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: retire-hardening
    scope_id: retire-hardening
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/pre-guard.mjs, scripts/tracker.mjs, scripts/lib/core.mjs, scripts/doc-write.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/state.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-02, ARCH-DOCS-07, ARCH-DOCS-08, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: retire-rollback-index
    scope_id: retire-rollback-index
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/docs.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-02, ARCH-DOCS-08]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: retire-goalless
    scope_id: retire-goalless
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-09, ARCH-DOCS-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: retire-epic
    scope_id: retire-epic
    project: .
    depends_on: [retire-goalless]
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/tracker.mjs, scripts/tracker.test.mjs, scripts/lib/plan-index.mjs, scripts/lib/tracker-rollup.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/plan.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/tracker.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-DOCS-09, ARCH-DOCS-02, ARCH-TRACKER-09, ARCH-TRACKER-01, ARCH-TRACKER-10]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: prune-archive-input
    scope_id: prune-archive-input
    project: .
    depends_on: []
    module: commands/_sync-docs-prune.md
    language: markdown
    security: normal
    scope:
      read: [commands/_sync-docs-prune.md, scripts/wiring.test.mjs, scripts/doc-retire.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [commands/_sync-docs-prune.md, scripts/wiring.test.mjs]
    arch: [ARCH-DOCS-04, ARCH-SLIM-01, ARCH-ENGINE-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: lint-sentinels
    scope_id: lint-sentinels
    project: .
    depends_on: []
    module: scripts/arch-check.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/arch-check.mjs, scripts/arch-check.test.mjs]
      docs: [docs/architecture/docs.rules.md]
      write: [scripts/arch-check.mjs, scripts/arch-check.test.mjs]
    arch: [ARCH-DOCS-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: preguard-event
    scope_id: preguard-event
    project: .
    depends_on: []
    module: scripts/stats.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/stats.mjs, scripts/stats.test.mjs, scripts/pre-guard.mjs]
      docs: [docs/architecture/mod.rules.md, docs/architecture/state.rules.md]
      write: [scripts/stats.mjs, scripts/stats.test.mjs]
    arch: [ARCH-SLIM-06, ARCH-SLIM-07, ARCH-MOD-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: rm-guard
    scope_id: rm-guard
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: retire-index-heal
    scope_id: retire-index-heal
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/lib/plan-index.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/plan.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-09, ARCH-DOCS-02, ARCH-TRACKER-10, ARCH-TRACKER-09]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-overblock
    scope_id: guard-overblock
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-bypass
    scope_id: guard-bypass
    project: .
    depends_on: [guard-overblock]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: retire-rollup-parent
    scope_id: retire-rollup-parent
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/lib/plan-index.mjs, scripts/lib/plan-index.test.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/plan.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/lib/plan-index.mjs, scripts/lib/plan-index.test.mjs]
    arch: [ARCH-DOCS-09, ARCH-DOCS-02, ARCH-TRACKER-10, ARCH-PLAN-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-regress
    scope_id: guard-regress
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-vars
    scope_id: guard-vars
    project: .
    depends_on: [guard-regress]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: retire-single-parser
    scope_id: retire-single-parser
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/plan.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-09, ARCH-DOCS-02, ARCH-TRACKER-10, ARCH-PLAN-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-quotes
    scope_id: guard-quotes
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-env
    scope_id: guard-env
    project: .
    depends_on: [guard-quotes]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-subshell
    scope_id: guard-subshell
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-pathspec
    scope_id: guard-pathspec
    project: .
    depends_on: [guard-subshell]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-find-icase
    scope_id: guard-find-icase
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-icase-env
    scope_id: guard-icase-env
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-git-env
    scope_id: guard-git-env
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-failclosed
    scope_id: guard-failclosed
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
---

# Plan: scrutinise-feature-branch-plans — fix pass 1 findings

## Outcome
The CI script-size warning never fails a PR, and doc-retire refuses whenever it cannot prove a plan is safe to remove. Same meaning as `goal`.

## Scope Steps (executable core)

### Step 1 — ci-size-delta (., javascript, normal)
Depends on: none
- [ ] 1.1 New `scripts/script-size-delta.mjs <base-sha>`: sum `scripts/**/*.mjs` bytes at base (`git ls-tree -r -l`) and HEAD; try `git fetch --depth=1 origin <base>` (with a `timeout`) when the base object is absent; still absent or any git error → `::notice::` and exit 0; growth → `::warning::` with the delta; the whole main is wrapped in try/catch → `::notice::`, exit 0 → accept: script-size-delta.test on temp git repos (a local bare repo as `origin` for the fetch path, no network) covers growth (warning), shrink (no warning), missing base (notice) and a thrown error (notice), each exit 0
- [ ] 1.2 `ci.yml` step (`ci.yml:97-107`) becomes `run: node scripts/script-size-delta.mjs "$BASE_SHA"` with `env: BASE_SHA`, following the `env:` pattern at `ci.yml:58-65` → accept: the step's `run` has no `${{ }}`; `node --check` on the script passes

### Step 2 — retire-hardening (., javascript, high)
Depends on: none
- [ ] 2.1 Referrer scan (`doc-retire.mjs:68-69`) unions `git grep` over HEAD, `--cached` and the working-tree copies of tracked files (untracked files are not scanned — stated in a comment); git runs through an injectable runner (`context.git ?? defaultGit`) calling `execFileSync` directly: status 1 with empty output = no hits; any other failure refuses `referrer scan failed` → accept: tests cover an uncommitted referrer and a staged referrer refusing, and an injected non-1 failure refusing with no change
- [ ] 2.2 Refuse up front when `fs.realpathSync(trackerRoot(context)) !== fs.realpathSync(context.root)` (`tracker.mjs:119-120`): "run doc-retire from the main checkout" → accept: a linked-worktree test refuses with no change; a main checkout under a symlinked tmp path is not refused; suite passes on the ubuntu/macOS/windows CI matrix
- [ ] 2.3 Grant check (`doc-retire.mjs:13,22-29`) becomes a pure `grantValid({pendingMtime, sessionMtime, now, pendingTtlMs, ttlMs})`; its inputs come from the root `STATE_DIR` and `sessionDir(sid)` (`pre-guard.mjs:330-331`, ARCH-STATE-06) and `loadConfig().docWriteGuard` with `pendingTtlMs ?? 1800000` / `ttlMs ?? 3600000` (`pre-guard.mjs:332-333`); a malformed TTL refuses; the grant is required even when `docWriteGuard.enabled` is false → accept: tests cover a 45-minute-old pending marker refused, a fresh one accepted, a shorter configured `pendingTtlMs` honoured, and a malformed TTL refused

### Step 3 — retire-rollback-index (., javascript, high) — round 2
Depends on: none (Steps 1–2 merged at 0816ee8, 7fc96bb)
- [ ] 3.1 Retire's rollback restores the whole index, not a hand-kept path list (`doc-retire.mjs:124-145`): before `git rm`, snapshot it with `git write-tree` (a failure there, e.g. unmerged entries, refuses before any change); move `git rm` inside the `try`; in the catch, `git read-tree <snapshot>` with the throwing `git()` (not `tryGit`) — if the restore itself fails, append that to the refusal reason — then `git checkout HEAD -- ...removing` and restore the ledger/archive/tracker backups. Unrelated staged content survives a refused retire → accept: a test sets the fixture's `core.hooksPath` to a dir holding a `#!/bin/sh` pre-commit that writes a marker and exits 1 (no win32 skip); retire refuses, the marker exists, `snapshot()` is unchanged, `git diff --cached --quiet` and an empty `git status --porcelain` hold; an archivePlan failure before anything is staged leaves the index tree equal to its pre-retire `write-tree`; existing rollback tests (`doc-retire.test.mjs:134,146`) and referrer tests still pass

### Step 4 — retire-goalless (., javascript, high) — round 4
Depends on: none
- [ ] 4.1 `retire` (tracker.mjs unchanged: the heading is produced from the fields doc-retire passes) takes the goal from the tracker row, else the plan doc's front-matter `goal:`, else its H1, else the slug (a stand-in for the goal slot of the DOCS-09 heading), so the full `## <plan> (<date>) — <goal> · doc <sha> · landed <sha>` heading is written for a goal-less plan too (`doc-retire.mjs:112`, `tracker.mjs:429`) → accept: doc-retire.test retires a row with no goal and asserts the archive heading carries `doc <sha>`; it fails on the old code

### Step 5 — retire-epic (., javascript, high) — round 4
Depends on: retire-goalless
- [ ] 5.1 Only a descendant with an open (not COMPLETE/CANCELLED) row is live (`doc-retire.mjs:84-88`); closed descendants retire in the same commit with their rollups, as closed siblings do → accept: doc-retire.test: epic with a COMPLETE child retires both docs and both rollups in one commit; epic with an open child is refused naming it
- [ ] 5.2 The parent's own generated rollup `docs/plans/<parent>/TRACKER.md` and its `children:` list are not referrers (`doc-retire.mjs:100-106`); an epic or story with zero rows archives (vacuously every row closed) with the full DOCS-09 heading instead of `no tracker rows` (`tracker.mjs:471`) → accept: doc-retire.test and tracker.test: the child is not refused for the parent's rollup; a rows-less hierarchy parent writes the full heading with doc sha, and `tracker.mjs lookup` round-trips it (ARCH-TRACKER-09); the retired parent's rollup is gone (ARCH-TRACKER-10)

### Step 6 — prune-archive-input (., markdown, normal) — round 4
Depends on: none
- [ ] 6.1 `_sync-docs-prune.md` `--archive` passes `{"plan":"docs/plans/<slug>.md","sid":"<session>"}` to doc-retire and confirms COMPLETE with `tracker.mjs` action `status`, not `lookup` (which reads only the archive); the file stays at or under its 1575-byte cap by trimming equal prose → accept: wiring.test asserts the repo-relative path form and the `status` check, and fails on the old text; `node scripts/doc-size-policy.mjs` PASS

### Step 7 — lint-sentinels (., javascript, normal) — round 4
Depends on: none
- [ ] 7.1 `lintRules` skips the file check only for the explicit sentinels `init` and `backfill`; any other `source:` value, path or bare name, must exist and fails naming it when missing (`arch-check.mjs:217`) → accept: arch-check.test: `source: init` and `source: backfill` pass; a missing path and a missing bare non-sentinel name fail; `node scripts/arch-check.mjs lint` PASS on the repo

### Step 8 — preguard-event (., javascript, normal) — round 4
Depends on: none
- [ ] 8.1 `stats.mjs` counts a `preguard` event as a protected-path block only when `result` is `blocked`; allowed events still feed the p50/p95 `ms` report (`stats.mjs:88,110`) → accept: stats.test: an `allowed` preguard event is not a block and is in the ms percentiles; the old code counted it as a block

### Step 9 — rm-guard (., javascript, high) — round 4
Depends on: none
- [ ] 9.1 Removing an ancestor of a guarded path is blocked without the grant: `rm -rf docs`, `rm -rf ./docs/`, `git rm -r docs`, and a removal of `.` (`pre-guard.mjs:57-79`) → accept: pre-guard.test: each form blocked without the grant and allowed with it; `rm -rf build` stays allowed
- [ ] 9.2 Arguments resolve against `git -C <dir>` and a leading `cd <dir> &&`; a leading `\`, `command`, `env`, `sudo` (with options) is stripped and the verb matches by basename `rm|unlink`; `find … -delete`, `xargs rm`, `mv`/`git mv` of a guarded path and `bash -c`/`sh -c` bodies are treated as removals; an unparseable chain that names a guarded path fails closed; paths resolve against the hook input's cwd inside the one project, so ARCH-STATE-06 (no workspace project addressed by cwd) is unaffected → accept: pre-guard.test: one blocked and one granted case per form (`git -C docs rm plans/x.md`, `cd docs/plans && rm x.md`, `/bin/rm`, `command rm`, `\rm`, `env rm`, `sudo -u x rm`, `xargs rm`, `find … -delete`, `unlink`, `bash -c 'rm …'`, `git mv`); an unrelated `rm` is still allowed

### Step 10 — retire-index-heal (., javascript, high) — round 5
Depends on: none
- [ ] 10.1 Retiring a child of a still-open parent removes the child's slug from the parent's `children:` list in the same commit and refuses (with rollback) unless `loadIndex` loads afterwards; today the parent keeps `children: [beta]` and every `loadIndex` consumer throws `children [beta] disagree with children's parent` (`doc-retire.mjs:148-150`, `plan-index.mjs:150-153`) → accept: doc-retire.test: after retiring a child, `loadIndex(root)` succeeds, the parent's `children:` no longer lists it, and a following retire of an unrelated plan is not refused; fails on the old code
- [ ] 10.2 A rows-less `scrutinise-`/`investigate-` sibling gets the full DOCS-09 heading with doc sha (vacuously closed) when it is removed with its plan, and a rows-less derived descendant is judged by the same rule instead of being refused as live (`doc-retire.mjs:179` vs `:84-88`) → accept: doc-retire.test: retiring a plan with a tracked rows-less `scrutinise-` sibling writes a heading for both docs in the same commit; the descendant path and the sibling path agree

### Step 11 — guard-overblock (., javascript, high) — round 5
Depends on: none
- [ ] 11.1 A glob in the last path segment is matched against the guarded bases instead of collapsing to the parent directory: `rm -f *.log`, `rm -f ./*.tgz`, `unlink *.pid`, `mv *.log logs/`, `find . -name '*.log' -delete` and `find . -type f -name '*.o' -exec rm {} +` are allowed without the grant; `rm -rf d*`, `rm -rf docs/*`, `rm docs/plans/*.md` and a `find` whose predicates can match a guarded path stay blocked (`pre-guard.mjs:95-96,149-155`) → accept: pre-guard.test: each allowed form exits 0 without the grant, each blocked form is blocked without it and allowed with it
- [ ] 11.2 Heredoc bodies are skipped before quote tracking, so `git commit -F - <<'EOF'` messages naming guarded paths or containing an apostrophe, `git commit -m "$(cat <<'EOF' … EOF)"` and `cat > s.sh <<'EOF'` with an `rm` line in the body are not parsed as shell (`pre-guard.mjs:59-78,173`) → accept: pre-guard.test: those three commands are allowed without the grant; a real `rm docs/plans/x.md` after the heredoc terminator is still blocked

### Step 12 — guard-bypass (., javascript, high) — round 5
Depends on: guard-overblock
- [ ] 12.1 `stripPrefixes` also strips shell keywords `then`, `do`, `else`, `elif` and `!`, and the wrappers `nice`, `timeout <n>`, `busybox`, `stdbuf`, `ionice`; a `find` with no start path is treated as `.` (`pre-guard.mjs:118-131,149-163`) → accept: pre-guard.test: `if true; then rm docs/plans/x.md; fi`, `! rm docs/plans/x.md`, `for x in a; do rm docs/plans/x.md; done`, `nice rm …`, `timeout 5 rm …`, `busybox rm …`, `find -name x.md -delete` each blocked without the grant and allowed with it
- [ ] 12.2 Removal with an argument the parser cannot see fails closed: `xargs rm`/`xargs unlink` whose input is not a visible non-guarded producer (a pipe from an unknown command, `< file`, `-a file`), an `rm`/`unlink`/`mv` argument containing command substitution, a backtick, a leading `~`, `$PWD` or `$HOME`, and an `rm` with a `$name` argument in a chain that also names a guarded path → accept: pre-guard.test: `git ls-files | xargs rm`, `xargs rm < list`, `rm -rf ~`, `rm -rf "$PWD/docs"`, `rm -rf $(git rev-parse --show-toplevel)/docs`, `for f in docs/plans/*.md; do rm "$f"; done` blocked without the grant and allowed with it; `rm -rf "$TMPDIR/x"` and `echo a | xargs echo` stay allowed

### Step 13 — retire-rollup-parent (., javascript, high) — round 6
Depends on: none
- [ ] 13.1 Retiring a child commits the parent's regenerated rollup `docs/plans/<parent>/TRACKER.md` in the same commit and restores it on rollback; the parent doc is pushed onto the rollback set before it is written (`doc-retire.mjs:209-223`) → accept: doc-retire.test: after retiring a child of an open epic `git status --porcelain` is empty and a later retire of the parent is not refused; a forced `git add` failure leaves the parent doc and rollup unchanged
- [ ] 13.2 `plan-index.mjs` exports the `children:` edit (`removeChild(text, slug)`, built on its own parser and accepting every form `loadIndex` accepts: trailing comment, scalar, block items with comments); `doc-retire` calls it and keeps no `children:` parser of its own (`doc-retire.mjs:61-78`, ARCH-PLAN-02) → accept: plan-index.test covers each form; doc-retire.test retires a child whose parent has `children: [beta, gamma] # kids`, and one whose `loadIndex` fails after the edit is refused with an unchanged snapshot
- [ ] 13.3 A rows-less sibling's heading takes the sibling's own front-matter or H1 goal, as a rows-less descendant does (`doc-retire.mjs:219` vs `:129`) → accept: doc-retire.test: both headings carry their own doc's goal

### Step 14 — guard-regress (., javascript, high) — round 6
Depends on: none
- [ ] 14.1 `<<` is a heredoc only when it is not part of `<<<` and not inside `$((`/`((` or a `#` comment (`pre-guard.mjs:95-97`) → accept: pre-guard.test: `cat <<< hi\nrm docs/plans/x.md`, `echo $((1<<2))\nrm docs/plans/x.md` and `# see <<EOF\nrm docs/plans/x.md` blocked without the grant and allowed with it; the 11.2 heredoc cases still pass
- [ ] 14.2 `find` is passed over only for the single form `[-type x] -name P … -delete|-exec rm` whose patterns cannot match a guarded path; any `-o`/`-or`/`,`, a `-delete`/`-exec` before the last `-name`, and a start path beginning `..` fail closed (`pre-guard.mjs:224-254`) → accept: pre-guard.test: `find . -name "*.log" -o -type f -delete`, `find . -name "*.log" -or -type f -delete`, `find . -delete -name nothing`, `find . -type f -exec rm {} + -name zz`, `find .. -name x.md -delete` blocked without the grant and allowed with it; the 11.1 allowed `find` forms stay allowed
- [ ] 14.3 For `git rm`/`git mv` a glob argument keeps pathspec semantics (matches across `/`), so `git rm "*.md"` and `git rm -r "*.md"` are blocked; for a `docPaths` entry without `**`, a glob argument is tested against the real directory entries instead of an `x` sample (`pre-guard.mjs:184-201`) → accept: pre-guard.test: `git rm "*.md"`, `git rm -r "*.md"` blocked; with `docPaths: ["docs/plans/*.md"]`, `rm docs/plans/*` and `rm -f docs/plans/*.m?` blocked, `rm docs/other/*` allowed

### Step 15 — guard-vars (., javascript, high) — round 6
Depends on: guard-regress
- [ ] 15.1 A `NAME=value` word (plain assignment, or after `export`/`local`/`declare`/`readonly`) adds its value to the seen words before it is stripped, so `rm "$f"` or `rm -rf $D` in a chain that assigned a guarded path fails closed (`pre-guard.mjs:270,285`) → accept: pre-guard.test: `f=docs/plans/x.md; rm "$f"` and `export D=docs; rm -rf $D` blocked without the grant and allowed with it; `f=build/x; rm "$f"` stays allowed
- [ ] 15.2 `if`, `while`, `until`, `time` and `coproc` are stripped like `then`, and `mv` with a `$name` argument in a loop over a guarded glob fails closed like `rm` (`pre-guard.mjs:156,291`) → accept: pre-guard.test: `if rm docs/plans/x.md; then :; fi`, `while rm docs/plans/x.md; do :; done`, `time rm docs/plans/x.md`, `for f in docs/plans/*.md; do mv "$f" /x; done` blocked without the grant and allowed with it

### Step 16 — retire-single-parser (., javascript, high) — round 7
Depends on: none
- [ ] 16.1 `onlyChildrenList` (`doc-retire.mjs:146`) asks plan-index through `removeChild(text, slug)` whether the parent still names the child, and keeps no `children:` regex of its own (ARCH-PLAN-02) → accept: doc-retire.test: a parent whose `children:` block has `- gamma`, a column-0 `# note`, then `- beta` retires beta without being refused as a referrer; `grep -c "children:" scripts/doc-retire.mjs` shows no parsing regex
- [ ] 16.2 A sibling that has rows takes its own goal for the archive heading, as a descendant with rows does (`doc-retire.mjs:207` vs `:109`); only the ancestors' rollups are synced and committed, so an unrelated stale rollup is never left dirty (`doc-retire.mjs:185,208`) → accept: doc-retire.test: a sibling with rows writes its own goal; an unrelated stale rollup stays untouched and the status is clean after a child retire

### Step 17 — guard-quotes (., javascript, high) — round 7
Depends on: none
- [ ] 17.1 A `$((…))` inside double quotes is copied verbatim as arithmetic, and legacy `$[…]` is treated like `$((`; comment text is dropped before quote tracking, so an apostrophe in a `#` comment cannot hide a later removal (`pre-guard.mjs:88,93-104,152-153`) → accept: pre-guard.test: `echo "$((1<<2))"\nrm docs/plans/x.md`, `x="$(( 4 << 1 ))"\nrm -rf docs/plans`, `echo $[1<<2]\nrm docs/plans/x.md`, `# don't\nrm -rf docs` and `ls # it's\ngit rm -rq .` blocked without the grant and allowed with it
- [ ] 17.2 A git argument starting with `:` (pathspec magic `:/`, `:(top)`, `:(icase)`, `:(glob)`) is decoded or fails closed when it can name a guarded base (`pre-guard.mjs:222-246,355`) → accept: pre-guard.test: `git rm -r :/docs`, `git rm -r ':(top)docs'`, `git rm -r ':(icase)DOCS/PLANS'` blocked without the grant and allowed with it; `git rm src/x.md` stays allowed
- [ ] 17.3 `find … -exec rm|unlink` checks every literal word before its `;`/`+` other than `{}` against the guarded paths (`pre-guard.mjs:362-365`) → accept: pre-guard.test: `find . -name '*.log' -exec rm -rf docs \;` and `find . -name '*.log' -exec rm {} docs/plans/x.md +` blocked without the grant and allowed with it; `find . -name '*.log' -exec rm {} +` stays allowed

### Step 18 — guard-env (., javascript, high) — round 7
Depends on: guard-quotes
- [ ] 18.1 `assigned()` records the nested walk's cwd (`sh -c 'cd build && f=../docs/plans && rm -rf "$f"'`), `env NAME=value …` records its assignments, and `NAME+=value` and `NAME=(…)` count as assignments (`pre-guard.mjs:314,320,324,336`) → accept: pre-guard.test: that `sh -c` form, `env D=docs sh -c 'rm -rf $D'`, `env D=docs/plans/x.md bash -c 'rm "$D"'`, `f+=docs/plans/x.md; rm "$f"` and `f=(docs); rm -rf $f` blocked without the grant and allowed with it; `f=build/x; rm "$f"` stays allowed
- [ ] 18.2 `coproc NAME {`, `function NAME {` and `exec -a NAME` are stripped to the command they run (`pre-guard.mjs:167,321-322`) → accept: pre-guard.test: `coproc foo { rm docs/plans/x.md; }`, `function f { rm docs/plans/x.md; }; f`, `exec -a name rm docs/plans/x.md` and `coproc rm docs/plans/x.md` blocked without the grant and allowed with it; the 12.2 `unlink` and `mv` forms with `~`, `$PWD` and command substitution each have a blocked case

### Step 19 — guard-subshell (., javascript, high) — round 8
Depends on: none
- [ ] 19.1 `NAME=(` array assignment is recognised inside `shellSegments` only when `(` follows a word ending in `=` with nothing between; an empty segment never makes the next `(` an array start (`pre-guard.mjs:163-166,450-453`) → accept: pre-guard.test: `f=; (rm -rf docs)`, `f=\n(rm -rf docs)` and `x= && (rm -rf docs/plans)` blocked without the grant and allowed with it; `f=(docs); rm -rf $f` stays blocked
- [ ] 19.2 A `#` starts a comment only at position 0 or after whitespace, newline, `;`, `&`, `|` or `(`, never after `)` or a closing backtick, the same rule as `stripHeredocs` (`pre-guard.mjs:159` vs `:108`) → accept: pre-guard.test: `echo $(true)#; rm -rf docs`, ``echo `true`#; rm -rf docs`` and `echo $((1))#; rm -rf docs` blocked without the grant and allowed with it; `# note; rm -rf docs` stays allowed

### Step 20 — guard-pathspec (., javascript, high) — round 8
Depends on: guard-subshell
- [ ] 20.1 Exclude pathspec magic (`:!`, `:^`, `:(exclude)`) is never reduced to a bare path: an argument list with only exclusions fails closed (treated as `.`), and an `:(icase)` argument builds its matchers case-insensitively (`pre-guard.mjs:214,237-239,268-284`) → accept: pre-guard.test: `git rm -r ':!src'`, `git rm -r ':(exclude)src'`, `git rm -r ':(icase)D*'`, `git rm -r ':(icase)DOCS/P*'` blocked without the grant and allowed with it; `git rm src/x.md` stays allowed
- [ ] 20.2 `find … -exec` runs its words through the wrapper stripping, and `mv` joins `rm`/`unlink` (`pre-guard.mjs:410-414`) → accept: pre-guard.test: `find . -name '*.log' -exec env rm -rf docs \;` and `find . -name '*.log' -exec mv docs /x \;` blocked without the grant and allowed with it; `find . -name '*.log' -exec rm {} +` stays allowed

### Step 21 — guard-find-icase (., javascript, high) — round 9
Depends on: none
- [ ] 21.1 A `find` whose start path lies inside or above a guarded base is a removal when any `-exec`/`-execdir` runs `rm`, `unlink` or `mv` with `{}` (the `deletes` test no longer excludes `mv`), and a lone `+` ends the `-exec` list only when the word before it is `{}` (`pre-guard.mjs:421-428`) → accept: pre-guard.test: `find docs -name '*.md' -exec mv {} /x \;`, `find docs -execdir mv {} /x \;`, `find docs/plans -exec sudo mv {} /x +`, `find docs -exec mv -t /x {} +`, `find build -exec mv + docs /y \;` blocked without the grant and allowed with it; `find build -name x -exec mv {} /y \;` stays allowed
- [ ] 21.2 git's global `--icase-pathspecs` option and a `GIT_ICASE_PATHSPECS` assignment in the segment apply `:(icase)` to every pathspec of that command (`pre-guard.mjs:396-398`) → accept: pre-guard.test: `git --icase-pathspecs rm -r DOCS`, `git --icase-pathspecs rm -r 'DOC*'`, `GIT_ICASE_PATHSPECS=1 git rm -r DOCS` blocked without the grant and allowed with it; `git rm src/x.md` stays allowed

### Step 22 — guard-icase-env (., javascript, high) — round 10
Depends on: none
- [ ] 22.1 The `GIT_ICASE_PATHSPECS` flag lives on the walk state and is carried into the tail of a pipeline (`xargs git …`), into nested `sh -c`/`bash -c` bodies and into later segments after `export`/`declare -x`/`typeset -x NAME=1`; a false value (`0`, empty) leaves it off (`pre-guard.mjs:379,384,452,458`) → accept: pre-guard.test: `echo x | GIT_ICASE_PATHSPECS=1 xargs git rm -r DOCS`, `GIT_ICASE_PATHSPECS=1 sh -c 'git rm -r DOCS'`, `export GIT_ICASE_PATHSPECS=1; git rm -r DOCS`, `declare -x GIT_ICASE_PATHSPECS=1; git rm -r DOCS` blocked without the grant and allowed with it; `GIT_ICASE_PATHSPECS=0 git rm -r DOCS` stays allowed
- [ ] 22.2 A pathspec decoded as icase is compared with the guarded globs case-insensitively in full, so a `docPaths` entry without `**` also matches the file-name part; `find … -exec git rm|git mv` counts as a removal verb (`pre-guard.mjs:279-287,303,429`) → accept: pre-guard.test: with `docPaths: ["docs/plans/*.md"]`, `git --icase-pathspecs rm docs/plans/X.MD` and `git rm -r ':(icase)docs/plans/X.MD'` blocked without the grant and allowed with it; `find docs -exec git rm {} +` and `find docs -exec git mv {} /x \;` blocked without the grant and allowed with it

### Step 23 — guard-git-env (., javascript, high) — round 11
Depends on: none
- [ ] 23.1 `find … -exec git rm|mv` hands its words (minus `{}`) to the same git branch as a direct `git rm`, so pathspec magic, `--icase-pathspecs`, exclude-only lists and the icase env flag apply; the `{}` start-path check stays (`pre-guard.mjs:437-445`) → accept: pre-guard.test: `find build -exec git rm -r ':!src' \;`, `find build -exec git --icase-pathspecs rm -r DOCS \;`, `find build -exec git rm -r ':(icase)DOCS' \;`, `GIT_ICASE_PATHSPECS=1 find build -exec git rm -r DOCS \;` blocked without the grant and allowed with it; `find build -exec git rm {} +` stays allowed
- [ ] 23.2 A bare `GIT_ICASE_PATHSPECS=<truthy>` segment, and `export`/`declare -x NAME` after an earlier assignment, set the icase flag for the rest of the command (over-blocking a non-exported assignment is accepted); `xargs git rm|mv` is checked against the seen words like `xargs rm` (`pre-guard.mjs:369,384,387-391,457-462`) → accept: pre-guard.test: `GIT_ICASE_PATHSPECS=1; export GIT_ICASE_PATHSPECS; git rm -r DOCS`, `export GIT_ICASE_PATHSPECS; GIT_ICASE_PATHSPECS=1; git rm -r DOCS`, `set -a; GIT_ICASE_PATHSPECS=1; git rm -r DOCS`, `echo docs | xargs git rm -r` blocked without the grant and allowed with it; `export GIT_ICASE_PATHSPECS=1; export GIT_ICASE_PATHSPECS=0; git rm -r DOCS` and `typeset -x GIT_ICASE_PATHSPECS=1; git rm -r DOCS` behave as stated (the second blocked)

### Step 24 — guard-failclosed (., javascript, high) — round 12 (user decision b)
Depends on: none
Supersedes the unbuilt patch unit guard-xargs-git (row CANCELLED, nothing built or landed): ten rounds of per-form patches did not converge, so the removal check becomes fail-closed.
- [ ] 24.1 A Bash command is blocked without the doc-write grant when its text holds a removal-capable word (`rm unlink rmdir mv shred truncate rsync find xargs eval`, `sh|bash|zsh -c`, `git rm|mv|clean`, or a `>` redirect onto a guarded path), quoted or not, unless the parser proves it safe: simple commands joined by `; && || |` or newline, literal or quoted words, no `$` or backtick or `~` in a removal target, no env-assignment prefix, no shell keyword, `{`, `(` or function definition, and every removal target resolved (cwd, `git -C`, `cd X &&`) outside the docPaths bases and their ancestors. Anything unrecognised with a removal word present is blocked (ARCH-DOCS-07; `pre-guard.mjs` removal path) → accept: pre-guard.test: a table of unrecognised-grammar commands holding a removal word is blocked without the grant and allowed with it; the proven-safe forms stay allowed
- [ ] 24.2 The per-form denylist branches (keyword and wrapper stripping, icase env tracking, find action ordering, xargs producer tracking) are replaced by that one safe-subset check; git pathspec magic decoding runs only inside it, and a pathspec starting `:`, `--icase-pathspecs`, `GIT_ICASE_PATHSPECS`, `--work-tree` or `--git-dir` is not proven safe → accept: pre-guard.test: every blocked and allowed case that existed before stays green (`rm -f *.log`, `rm -rf build`, a `git commit -F - <<'EOF'` message naming guarded paths and `echo a | xargs echo` stay allowed); the old branches are gone from `pre-guard.mjs`
- [ ] 24.3 The ninth-review probes and the flagged forms are blocked without the grant and allowed with it → accept: pre-guard.test: `echo ':!src' | xargs git rm -r`, `echo ':(icase)DOCS' | xargs git rm -r`, `echo DOCS | xargs git --icase-pathspecs rm -r`, `export GIT_ICASE_PATHSPECS; { GIT_ICASE_PATHSPECS=1; }; git rm -r DOCS`, the same inside `if true; then …; fi`, `for i in 1; do …; done` and after `!`, `find build -exec sh -c 'git rm -r docs' \;`, `find build -execdir git rm -r ../docs \;`, `f() { git rm -r DOCS; }; GIT_ICASE_PATHSPECS=1 f`, `git --work-tree=. rm -r docs`; each fails on the pre-change code

## Sequencing
Steps 1–3 are merged and `plan-hierarchy` is merged, so no open plan writes these files.
Round 4 (Steps 4–9, from /scrutinise on 7e441ff..9549971): 4 → 5 share `doc-retire.mjs`; 6, 7, 8 and 9 are independent (9 writes `pre-guard.mjs`, 8 only `stats.mjs`). `doc-retire-tree` (feature-branch-plans) merged at 3805942, so Step 5 corrects it rather than duplicating deferred work.

Round 5 (Steps 10–12, second /scrutinise on 4931876..c4d686d): 11 → 12 share `pre-guard.mjs`; 10 is independent.

Round 6 (Steps 13–15, third /scrutinise on c4d686d..e56a6be): 14 → 15 share `pre-guard.mjs`; 13 is independent. Steps 14 and 15 also close the UNMET 11.1 and 12.2 criteria.

Round 7 (Steps 16–18, fourth /scrutinise on e56a6be..5d0c12c, bounded per the user-pending option (a)): 17 → 18 share `pre-guard.mjs`; 16 is independent. Closes UNMET 13.2, 14.1 and the archive-heading criterion. The remaining shell-grammar forms stay a best-effort denylist.

Round 8 (Steps 19–20, fifth /scrutinise on 5d0c12c..ca26733): 19 → 20 share `pre-guard.mjs`. Closes the UNMET 17.2 and two regressions of Step 18.

Round 9 (Step 21, sixth /scrutinise on ca26733..c122a11): single unit in `pre-guard.mjs`; closes the two remaining 20.x-class Warnings.

Round 10 (Step 22, seventh /scrutinise on c122a11..e17c43b): single unit in `pre-guard.mjs`; closes the last Warning (env flag propagation) and two same-class Suggestions.

Round 11 (Step 23, eighth /scrutinise on e17c43b..78b9947): single unit in `pre-guard.mjs`, the last bounded round for the two remaining same-class Warnings.

## Verification background
- Test job checkout has no `fetch-depth` — `.github/workflows/ci.yml:79`; size step — `ci.yml:97-107`
- Round 2: `extra` staged at `doc-retire.mjs:136`, rollback resets only `removing` at `:140` — reproduced by the scrutineer (index left `AD TRACKER-archive.md`, `AM TRACKER.md`)
- `tryGit` maps every error to null — `scripts/doc-retire.mjs:20`; HEAD-only grep — `doc-retire.mjs:68`
- Tracker files resolve to the main checkout — `scripts/tracker.mjs:119-120`
- pre-guard TTLs — `scripts/pre-guard.mjs:332-333`; grant paths — `pre-guard.mjs:330-331`, `scripts/doc-write.mjs:15`

CONSUMERS:
- `scripts/script-size-delta.mjs` → `.github/workflows/ci.yml` (1.2) only
- `doc-retire.mjs retire` → none yet (wired by feature-branch-plans unit sync-docs-modes)

## Risk & rollback
2.3 tightens the grant window, so a retire after 30 minutes needs `doc-write.mjs on` again — intended. Revert by merge commit.

## Out of scope
Round 3 (ce993dd) — deferred by user decision 2026-10-18, not defects of Steps 1–3: ARCH-SLIM-07 pre-guard/stop-gate p50/p95 (`pre-guard.mjs:309`, `stop-gate.mjs:353,355` log no `ms`) → `feature-branch-plans` Step 11 `hook-timing`; ARCH-DOCS-09 rollup removal and live-children refusal (`doc-retire.mjs:104-142`) → Step 4 `doc-retire-tree`; both BLOCKED on plan-hierarchy, and doc-retire stays unwired until Step 4. Round 3 suggestions (not tasks): pathspec magic in plan paths — set `GIT_LITERAL_PATHSPECS` or reject `[*?[\]]`/leading `:` (`doc-retire.mjs:13-17,79,94,105,136`); `write-tree`/`read-tree` drops intent-to-add, skip-worktree and assume-unchanged bits and overwrites a concurrent index change — back up the index file or use a temporary `GIT_INDEX_FILE` (`:132-146`); caller-supplied `sid` selects another session's longer grant window (`:35-41`); the unmerged-entries test should compare `snapshot()`; the restore-failure branch (`:146-151`) is untested; `script-size-delta.test.mjs` leaks its `mkdtemp` fixtures.
ARCH-DOCS-09 (rollup removal, refusing a parent with live children, full archive heading) — planned in `feature-branch-plans` Steps 3–4 (`tracker-lookup`, `doc-retire-tree`), BLOCKED on plan-hierarchy; doc-retire is not wired into any command until then. Disputed: pre-guard/stop-gate `ms` logging (ARCH-SLIM-07) — planned as `feature-branch-plans` Step 11 hook-timing. Follow-up suggestions, not tasks: lock around rollback restore (`doc-retire.mjs:96-101`), restrict `plan` to `docs/plans/*.md` (`:37-39`), `doc_prune_refused` on every refusal vs DOCS-08 wording (`:73`), `pct` rank off-by-one (`stats.mjs:15-18`, pre-existing). Round 2 suggestions (not tasks): restore the ledger under `withLock` (`doc-retire.mjs:142-145`, `tracker.mjs:404`); `ls-tree -z` and skip non-blob entries (`script-size-delta.mjs:6-12`); CI delta base vs merge-ref base (ci.yml size step); test `hookTimeouts()` against the real `hooks/hooks.json` (`stats.mjs:20-31`); fold `defaultGit` into `git()` (`doc-retire.mjs:49-53`). The pre-existing "Check PR diff whitespace" step has the same fetch-depth exposure (`ci.yml:122-125`).

Round 4 (/scrutinise on 7e441ff..9549971) Suggestions, flagged not driven: `tracker.mjs:449,457` lookupArchive uses one key for plan and slug, so a pruned idea heading can hide a retired plan's record; `pre-guard.mjs:18` and `stop-gate.mjs:16` start the `ms` clock after module load (use `performance.now()`); three cap tables diverge (`wiring.test.mjs:1071-1083`, `doc-size-policy.mjs` FILE_CAPS, `auto-command.test.mjs:61,128`); the size ratchet compares with `merge-base(HEAD, origin/main)` and skips on main or a shallow clone; the doc-retire rollup test fixture is a stub and always sets a goal; stale cites in `docs.rules.md` (ARCH-DOCS-02/07/08) and `slim.rules.md` (ARCH-SLIM-01) are refreshed by `/architect --update`, never here. Rules are not edited.

Round 5 (second /scrutinise on 4931876..c4d686d) Suggestions, flagged not driven: `doc-retire.mjs:131,135` builds the parent path from the slug and judges only the working-tree `children:` copy (use the index path and HEAD); the `hierarchy: true` flag of `tracker.mjs archive` (:472, :508) is caller-trusted (confirm epic/story level through plan-index); `pre-guard.mjs:114` resolves against `process.cwd()`, not the hook input cwd (realpath both sides); `_sync-docs-prune.md:18` lost "State the round count." in the size trim; `stats.test.mjs:69` asserts a tautology (spawn stats.mjs and assert the block count); older `preguard` events lack `result` and are no longer counted as blocks. The pre-guard parser is a best-effort denylist: forms beyond Steps 11–12 (for example `eval`, `python -c`, `perl -e unlink`) are not covered; that is a decision for the user, not a defect of these units.

Round 6 (third /scrutinise on c4d686d..e56a6be) Suggestions, flagged not driven: `eval`, `python -c`, `find -exec sh -c`, `-ok rm` and the `setsid`/`flock` wrappers remain outside the best-effort pre-guard parser (a decision for the user); `findNamesMiss` reads the live filesystem, so races and very large `docs/` trees show only at runtime.

Round 7 Suggestions, flagged not driven: `cat <<'EOF' | sh` (a heredoc piped to a shell) is the interpreter class; `typeset` accepted although 15.1 does not list it; `stripPrefixes(state.prev)` re-runs `assigned()` (duplicate seen entries, harmless); `mv ~/x build/` is blocked by the 12.2 leading-`~` rule (over-blocking by spec).

Round 8 Suggestions, flagged not driven: `doc-retire.mjs:186` restores only tracked rollups, so a rollup the archive newly creates could stay untracked; `doc-retire.mjs:146` searches the whole parent text, so a parent naming `beta` and `beta-api` can refuse `beta` (errs closed).

Round 9 Suggestions, flagged not driven: git `--work-tree`, `--git-dir` and `GIT_WORK_TREE` are not modelled in the git option loop; `(true)#` is parsed as a word (errs closed); `pre-guard.test.mjs:674` creates its repos under `os.tmpdir()`.

Round 10 Suggestions, flagged not driven: on a case-insensitive filesystem (macOS default) `rm -rf DOCS` and `git rm -r DOCS` reach the guarded docs and are allowed (predates the rounds, untested on this host); an empty `if` branch at `pre-guard.mjs:266` is a style point; the 21 test lacks `--icase-pathspecs` combined with `:` magic and `env VAR=1 git`.

Round 11 Suggestions, flagged not driven: the icase flag does not reach a shell function body (`f() { git rm -r DOCS; }; GIT_ICASE_PATHSPECS=1 f`); `local`/`readonly`/`declare` without `-x` also switch the flag on (errs closed).

Round 12 (Step 24, user decision b after the ninth /scrutinise on 78b9947..8ad7d0b): `pre-guard.mjs` removal detection becomes fail-closed in one unit. Follow-up for /architect --update, not edited here: ARCH-DOCS-07 holds as written; a sibling rule recording the fail-closed policy (unrecognised grammar with a removal word is blocked) may be added there. Accepted limits: a non-Bash tool, an interpreter call such as `node -e` or `python -c` with no removal word in its text, and case-insensitive filesystems stay outside what a text-level guard can see.
