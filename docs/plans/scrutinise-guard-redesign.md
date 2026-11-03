---
slug: scrutinise-guard-redesign
goal: record /scrutinise's findings on guard-redesign; four Suggestions kept as follow-ups, nothing to fix in this run
level: feature
parent: docs/plans/guard-redesign.md
children: []
priority: P3
classification: follow-up   # 0 Critical, 0 Warning, 0 UNMET; Suggestions do not block
tracker_rows: [TRACKER#followup-ratchet-lower-pairing, TRACKER#followup-ratchet-trade-choice, TRACKER#followup-scrutineer-between-units, TRACKER#followup-scrutinise-automatically]
guards:
  blast_radius: N/A(no unit executes in this plan)
  completeness_sweep: N/A(findings record only)
  blind_rederivation: skipped(config:never)   # craftsman.config.json:164
coverage:
  contract: N/A(no change)
  data: N/A(no change)
  config: N/A(no change)
  security: N/A(no change)
  tests: N/A(no change)
  observability: N/A(no change)
  interface: N/A(no change)
  docs: N/A(no change)
  rollback: N/A(no change)
units: []
---

# Scrutinise: guard-redesign

## Rolling summary

| Round | Range | Findings | Outcome |
|---|---|---|---|
| 1 | 37f6fe5..49f52cf (cap-trades bfcb219, scrutineer-stated-limits 49f52cf) | 0 Critical · 0 Warning · 4 Suggestion | 6/6 criteria MET; no fix units; Suggestions kept as follow-ups F1-F4 |

One rolling summary plus the latest round; older rounds stay in git history.

## Latest round — 1 (2026-11-03)

Isolated scrutineer (`craftsman:scrutineer`), default mode, router ESCALATE (lenses code-reviewer, consumer-tracer, architecture, cross-unit). Floor on 49f52cf: `node --test scripts/*.test.mjs` 1446/1446, `doc-size-policy` PASS, `arch-check lint` PASS. Root checked every cited line at 49f52cf and reproduced S2; nothing disputed.

Acceptance: all six `[unit:cap-trades]` / `[unit:scrutineer-stated-limits]` criteria MET (red runs confirmed against 37f6fe5).

Findings (all Suggestion):
- **S1 [Architecture]** `scripts/doc-size-policy.mjs:211-212` — `loadedByInvocation` accepts any `commands/*.md` or `INVOCATION_DOCS` member as `lower`; ARCH-SLIM-16 says the lower file "is read in the same invocation" as the raised one. The rule's `check:` is met and plan task 1.1(d) chose this test. → F1.
- **S2 [Correctness]** `scripts/doc-size-policy.mjs:239,242` — with two valid trades for one `raise`, `named.find` binds the first covering entry even when its `lower` is unpaid and another entry's is paid. Repro: base `{a:1, c:100, d:100}`, current `{a:3, c:100, d:90}`, trades a→c 5 and a→d 5 → "commands/c.md: cap fell 0 bytes, short of the 5 its trades owe (unpaid)". Fails closed; unreachable with today's single entry. → F2.
- **S3 [Correctness]** `agents/scrutineer.md:18` — the Cross-unit bullet lost "between units"; the gate "when the range spans more than one unit" keeps most of the meaning. → F3.
- **S4 [Correctness]** `commands/scrutinise.md:40` — the ledger sentence lost "automatically", so the TRACKER re-render can read as root's job beside the write policy at `:10`. → F4.

## Follow-ups (PENDING tracker rows, not driven by this run)
- **F1 `followup-ratchet-lower-pairing`** — either reword ARCH-SLIM-16 to "a file some invocation loads" via `/architect`, or record which invocation dispatches each agent so `loadedByInvocation` can check the pairing exactly.
- **F2 `followup-ratchet-trade-choice`** — choose the first covering trade whose `lower` still has fall left (or state one trade per raised file); add the S2 repro as a test.
- **F3 `followup-scrutineer-between-units`** — restore "between units" in `agents/scrutineer.md`'s Cross-unit bullet when a trim or trade frees the bytes (the file is at its 3700-byte cap).
- **F4 `followup-scrutinise-automatically`** — restore "automatically" (about 10 bytes) in `commands/scrutinise.md:40`; the file is at its 8030-byte cap.

Acceptance criteria for F1-F4 are written when one is planned for execution, so none sits unticked meanwhile.
