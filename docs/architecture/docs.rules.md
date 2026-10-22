---
area: docs
governs: ["scripts/doc-retire.mjs", "scripts/doc-retire.test.mjs", "commands/sync-docs.md", "scripts/arch-check.mjs"]
human: docs/architecture/docs.md
source: docs/ideas/feature-branch-plans.md
verified_at: 7dc6c597f14eaf7e2edb045abde8118f9eb67906
updated: 2026-10-23
---
# ARCH docs — enforced rules

- **ARCH-DOCS-01** [superseded by ARCH-DOCS-09] A plan doc is retired only by scripts/doc-retire.mjs after tracker.mjs archive accepts the plan (every row COMPLETE or CANCELLED); it removes the plan and each scrutinise-/investigate- sibling whose own rows are closed from git, and writes `## <plan> (<date>) — goal · doc <sha> · landed <sha>` to docs/plans/TRACKER-archive.md — check: doc-retire.test.mjs — cite: scripts/tracker.mjs:384-408
- **ARCH-DOCS-02** [superseded by ARCH-DOCS-12] Retirement and prune MUST refuse a doc with any inbound reference (rules cite:/source:, scripts/*.test.mjs, top-level *.md, docs/** incl. related:) and list the referrers; no force path exists — check: doc-retire.test.mjs refusal case — cite: scripts/doc-retire.mjs:112-119
- **ARCH-DOCS-03** [decided] arch-check lint MUST fail when a rules doc's source: file is missing — check: arch-check.test.mjs — cite: scripts/arch-check.mjs:216-217
- **ARCH-DOCS-04** [decided] /sync-docs has --archive (retire COMPLETE plans) and --prune (stale docs); prune runs a dry run first, confirms every round of ≤15 docs, skips docs named by a live ledger row, claim or hand-off, touches non-craftsman folders only when named, and is never covered by /goal pre-approval — check: sync-docs.md modes — cite: commands/sync-docs.md:46
- **ARCH-DOCS-05** [decided] Paired architecture areas are superseded through /architect, never deleted; a rejected or deferred idea may be pruned only when uncited and its archive index line records slug, verdict, deciding fact and sha, which /idea's overlap scan reads — check: idea.md Phase 1 lists TRACKER-archive.md — cite: commands/idea.md:30
- **ARCH-DOCS-06** [decided] /auto, /instruction and /orchestrate resolve a slug through tracker.mjs lookup before treating a missing plan doc as new work — check: auto-command.test.mjs — cite: commands/auto.md:16
- **ARCH-DOCS-07** [decided] Deleting a docWriteGuard path (Write tools, or a git/shell remove) needs the session's doc-write grant: doc-retire.mjs checks it and pre-guard blocks the raw command — check: pre-guard.test.mjs — cite: scripts/doc-retire.mjs:85-87
- **ARCH-DOCS-08** [decided] Retirement logs doc_retired {plan, sha, siblings} and refusals log doc_prune_refused {path, cited_by}; no new stats section — check: doc-retire.test.mjs events — cite: scripts/doc-retire.mjs:117,159
- **ARCH-DOCS-09** [decided] A plan doc is retired only by scripts/doc-retire.mjs after tracker.mjs archive accepts the plan (every row COMPLETE or CANCELLED); it removes the plan, each scrutinise-/investigate- sibling whose own rows are closed, and the plan's docs/plans/<slug>/TRACKER.md rollup from git, refuses a parent whose children are live, and writes `## <plan> (<date>) — goal · doc <sha> · landed <sha>` to docs/plans/TRACKER-archive.md — check: doc-retire.test.mjs — cite: scripts/tracker.mjs:423-448
- **ARCH-DOCS-12** [decided] Retirement and prune MUST refuse a doc with any inbound reference (rules cite:/source:, scripts/*.test.mjs, top-level *.md, docs/** incl. related:) and list the referrers; no force path exists; docs/plans/NEXT.md (ARCH-VIEWS-06) is not a referrer, and retiring a plan removes its NEXT.md line in the same commit — check: doc-retire.test.mjs refusal case and NEXT.md removal case — cite: scripts/doc-retire.mjs:131-146
