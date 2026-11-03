---
slug: guard-redesign
goal: /scrutinise reports a text-guard bypass a model would not write in ordinary work as a Suggestion, and a doc-size cap may rise only through a recorded trade
level: feature
priority: P2
idea: docs/ideas/guard-redesign.md
classification: in-scope   # docs/ideas/guard-redesign.md verdict pursue-with-changes, architected (ARCH-SAFETY-17, ARCH-SLIM-16)
tracker_rows: [TRACKER#cap-trades, TRACKER#scrutineer-stated-limits]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)   # craftsman.config.json:164
coverage:
  contract:      1.1 (new export CAP_TRADES and ratchetFindings; raisedCaps kept for its callers)
  data:          N/A(no persistence or migration)
  config:        2.3 (FILE_CAPS and CAP_TRADES entries)
  security:      2.1 (review severity of text-guard bypasses, ARCH-SAFETY-17; no guard code changes)
  tests:         1.2, 2.2
  observability: N/A(no runtime path)
  interface:     2.1 (scrutineer FINDINGS severities; output format unchanged)
  docs:          N/A(rules and human docs already written by /architect at 2c3fd5b, da77e33; CHANGELOG feeds the release-notes unit near its ARCH-ENGINE-08 budget, 054276e)
  rollback:      revert each unit's merge; caps return to the merge-base values
units:
  - id: 1
    scope_id: cap-trades
    project: .
    depends_on: []
    module: scripts/doc-size-policy.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/doc-size-policy.mjs, scripts/doc-size-policy.test.mjs]
      docs: [docs/architecture/slim.rules.md, docs/plans/guard-redesign.md]
      write: [scripts/doc-size-policy.mjs, scripts/doc-size-policy.test.mjs]
    arch: [ARCH-SLIM-01, ARCH-SLIM-16]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check, doc-size-policy], mcp: [] }
  - id: 2
    scope_id: scrutineer-stated-limits
    project: .
    depends_on: [cap-trades]
    module: agents/scrutineer.md
    language: markdown
    security: normal
    scope:
      read: [agents/scrutineer.md, commands/scrutinise.md, scripts/doc-size-policy.mjs, scripts/scrutinise-rolling.test.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/slim.rules.md, docs/architecture/docs.rules.md, docs/plans/guard-redesign.md]
      write: [agents/scrutineer.md, commands/scrutinise.md, scripts/doc-size-policy.mjs, scripts/scrutineer-severity.test.mjs]
    arch: [ARCH-SAFETY-17, ARCH-SLIM-01, ARCH-SLIM-16, ARCH-DOCS-11]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check, doc-size-policy], mcp: [] }
---

# Plan: review severity for text-guard bypasses, paid by a recorded cap trade

## Outcome
`/scrutinise` reports a text-guard bypass spelling a model would not write in ordinary work as a Suggestion with its reproduction (ARCH-SAFETY-17), and the doc-size ratchet lets a cap rise only through a `CAP_TRADES` entry paid by another file read in the same invocation (ARCH-SLIM-16).

## Scope Steps (executable core)

### Step 1 — cap-trades (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards arch-check, doc-size-policy
Depends on: none
- [ ] 1.1 Failing tests first in `scripts/doc-size-policy.test.mjs` for a pure `ratchetFindings(baseCaps, caps, trades)` exported from `scripts/doc-size-policy.mjs`: (a) a rise with no entry naming the file is a finding; (b) a rise larger than the entry's `bytes` is a finding; (c) an entry whose `lower` file's cap fell by less than `bytes` against the base is a finding (unpaid); (d) an entry whose `lower` is not a `commands/*.md` file or an `INVOCATION_DOCS` member is a finding; (e) a covered, paid rise and any fall return `[]`; (f) an entry missing `raise`, `lower`, `bytes`, `rule` (`ARCH-…`) or `decided` (YYYY-MM-DD), or whose `raise` equals its `lower`, is a finding. → accept: each case fails before 1.2 (the function does not exist), with the failure output recorded.
- [ ] 1.2 Add `export const CAP_TRADES = []` and `ratchetFindings` to `scripts/doc-size-policy.mjs` (dependency-free, as `:203` requires); keep `raisedCaps` and its test; switch the ratchet test (`scripts/doc-size-policy.test.mjs:66-87`) to `ratchetFindings(base.FILE_CAPS, FILE_CAPS, CAP_TRADES)` for per-file caps; per-invocation caps keep refusing every rise. → accept: 1.1 green; `node --test scripts/doc-size-policy.test.mjs` and `node scripts/doc-size-policy.mjs` pass; no cap value changes in this step.
- [ ] 1.3 Run `node --test scripts/*.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: exit 0 and PASS.

### Step 2 — scrutineer-stated-limits (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards arch-check, doc-size-policy
Depends on: cap-trades
- [ ] 2.1 Failing test first: new `scripts/scrutineer-severity.test.mjs` asserts `agents/scrutineer.md` names ARCH-SAFETY-17 and says a text-guard bypass a model would not write in ordinary work is a Suggestion with its reproduction, and a Warning only for an ordinary-work spelling, a false block on an ordinary command, or a regressed pinned refusal. → accept: fails on the current file.
- [ ] 2.2 Add that sentence to `agents/scrutineer.md` as a lens bullet beside **Architecture** (`:16`), keeping every existing instruction (lenses, refute-before-report, acceptance verdicts, output order). → accept: 2.1 green; the diff of `agents/scrutineer.md` only adds the bullet and rewords without dropping an instruction.
- [ ] 2.3 Pay for it: trim `commands/scrutinise.md` by at least the rise, keeping the pinned phrases "one rolling summary plus the latest round; older rounds stay in git history" (`scripts/scrutinise-rolling.test.mjs:11`, ARCH-DOCS-11) and `agents/review-router.md` (`scripts/wiring.test.mjs:346`) and every step; set `FILE_CAPS["agents/scrutineer.md"]` to its new size (at most 3710) and `FILE_CAPS["commands/scrutinise.md"]` to its new size, at least `bytes` below 8169; add the first `CAP_TRADES` entry `{ raise: "agents/scrutineer.md", lower: "commands/scrutinise.md", bytes: <the rise>, rule: "ARCH-SLIM-16", decided: "2026-11-03" }`. → accept: the ratchet test passes against the merge-base; `node scripts/doc-size-policy.mjs` passes; `INVOCATION_CAPS.scrutinise` not raised.
- [ ] 2.4 Run `node --test scripts/*.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: exit 0 and PASS.

## Sequencing
Step 1 first: without `ratchetFindings` the cap rise in 2.3 fails the ratchet test (`scripts/doc-size-policy.test.mjs:85`). Tests before code in both steps (ARCH-ENGINE-21).

## Verification background   (citations — for the reviewer, not the executor)
- ARCH-SAFETY-17 and ARCH-SLIM-16 decided 2026-11-03 — `docs/architecture/safety.rules.md`, `docs/architecture/slim.rules.md` (commits 2c3fd5b, da77e33).
- `agents/scrutineer.md` is 3590 bytes, exactly its cap — `scripts/doc-size-policy.mjs:38`; a wording-only fit lands about 70 bytes over (measured while planning), hence the trade (owner decision 2026-11-03).
- The ratchet refuses every per-file rise — `scripts/doc-size-policy.test.mjs:66-87`; `raisedCaps` at `scripts/doc-size-policy.mjs:198-201`; the ratchet imports the merge-base copy alone, so the module stays dependency-free (`:203`).
- `INVOCATION_DOCS` lists the shared docs each invocation loads — `scripts/doc-size-policy.mjs:107`.
- CONSUMERS (doc-size-policy.mjs exports): `scripts/init.mjs:6` (checkDocSizes), `scripts/approval-protocol.test.mjs:7` (FILE_CAPS, INVOCATION_CAPS), `scripts/unit-runner-tdd.test.mjs:5` (FILE_CAPS), `scripts/doc-size-policy.test.mjs:10`, `commands/builtin-check.md:70` (runs the CLI). None reads `raisedCaps` except its own test; the new exports are additive.
- CONSUMERS (scrutineer severities): `commands/scrutinise.md:39` (root may lower a severity only with counter-evidence; unchanged), `commands/_scrutinise-deep.md:13` (same severities as the default pass), `commands/instruction.md:51` (goal loops on Critical/Warning; a Suggestion does not block it).

## Risk & rollback
A trade entry stays in `CAP_TRADES` after it lands; a later change could reuse it only by lowering `commands/scrutinise.md` again by the same bytes, which ARCH-SLIM-16 accepts. Revert either unit's merge to undo it; caps return to the merge-base values.

## Out of scope
- Any change to `scripts/pre-guard.mjs` or its tests (ARCH-SAFETY-17 changes review severity, not the guards).
- `agents/security-auditor.md` and `agents/code-reviewer.md` in `/orchestrate`'s merge gates: ARCH-SAFETY-17 names `/scrutinise` only.
- F3 `followup-sandbox-verify` and the two other follow-ups of `scrutinise-investigate-cross-repo-worktree-git-guard`.
