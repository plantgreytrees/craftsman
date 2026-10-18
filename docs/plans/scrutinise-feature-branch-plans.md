---
slug: scrutinise-feature-branch-plans
goal: The CI script-size warning never fails a PR, and doc-retire refuses whenever it cannot prove a plan is safe to remove.
parent: feature-branch-plans
priority: P2
classification: in-scope (/scrutinise feature-branch-plans, isolated scrutineer, 2026-10-18; round 1: 1 Critical, 5 Warning; round 2 on 7fc96bb: 1 Warning)
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

## Sequencing
Independent; any order. Neither writes a file `plan-hierarchy` writes.

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
ARCH-DOCS-09 (rollup removal, refusing a parent with live children, full archive heading) — planned in `feature-branch-plans` Steps 3–4 (`tracker-lookup`, `doc-retire-tree`), BLOCKED on plan-hierarchy; doc-retire is not wired into any command until then. Disputed: pre-guard/stop-gate `ms` logging (ARCH-SLIM-07) — planned as `feature-branch-plans` Step 11 hook-timing. Follow-up suggestions, not tasks: lock around rollback restore (`doc-retire.mjs:96-101`), restrict `plan` to `docs/plans/*.md` (`:37-39`), `doc_prune_refused` on every refusal vs DOCS-08 wording (`:73`), `pct` rank off-by-one (`stats.mjs:15-18`, pre-existing). Round 2 suggestions (not tasks): restore the ledger under `withLock` (`doc-retire.mjs:142-145`, `tracker.mjs:404`); `ls-tree -z` and skip non-blob entries (`script-size-delta.mjs:6-12`); CI delta base vs merge-ref base (ci.yml size step); test `hookTimeouts()` against the real `hooks/hooks.json` (`stats.mjs:20-31`); fold `defaultGit` into `git()` (`doc-retire.mjs:49-53`). The pre-existing "Check PR diff whitespace" step has the same fetch-depth exposure (`ci.yml:122-125`).
