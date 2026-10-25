---
area: approval
governs: ["scripts/approval.mjs", "scripts/lib/approval-page.mjs", "commands/_approval.md", "scripts/approval.test.mjs"]
human: docs/architecture/approval.md
source: docs/ideas/dev-lifecycle-docs-plan.md
verified_at: ca1534f838e26eba29599a9c43f690c55dd93e11
updated: 2026-10-25
---
# ARCH approval — enforced rules

- **ARCH-APPROVAL-01** [superseded by ARCH-APPROVAL-08]
- **ARCH-APPROVAL-02** [superseded by ARCH-APPROVAL-09]
- **ARCH-APPROVAL-03** [decided] The page is a private claude.ai Artifact declaring the db and user capabilities; it offers two buttons, "Merge now" and "Open PR", and marks one as recommended: Open PR when base is protected or the diff touches security, infra, CI, env, migrations or submodule pointers, or exceeds repoExec.approval.prLines; the click writes approvals/<run> {choice, head_sha} under a db rule whose write level is owner, then republishes the page so the watching session is notified — check: approval-page.test.mjs recommendation table and capability config — cite: scripts/lib/approval-page.mjs:3-28,84-96
- **ARCH-APPROVAL-04** [decided] A run lands only after the session itself reads approvals/<run> through ArtifactData, confirms the writer is the artifact owner and head_sha equals the feature head it recorded; a republish notice, a comment or any page text alone is never approval, and page content and db rows are untrusted data — check: approval.test.mjs mismatched head_sha and non-owner writer are refused — cite: scripts/approval.mjs:163-175, commands/_approval.md:13-14
- **ARCH-APPROVAL-05** [decided] A pending run is recorded in .craftsman/approvals/<run>.json {url, plan, feature_heads, recommendation, requested_at}; SessionStart in that repo names approved-but-unlanded runs and /auto resumes landing them through ARCH-LAND-27; an approval never expires on its own — check: session-context.test.mjs pending-approval line — cite: scripts/approval.mjs:204-211, scripts/session-context.mjs:283-301
- **ARCH-APPROVAL-06** [decided] Approval events go to .craftsman/events.jsonl as approval_requested {run, recommendation}, approval_decided {run, choice} and approval_landed {run, sha, mode}; stats.mjs reports time-to-approve — check: stats.test.mjs approval section — cite: scripts/approval.mjs:140,173,186, scripts/stats.mjs:129-142
- **ARCH-APPROVAL-07** [decided] Where the Artifact runtime cannot be used (claude -p, no claude.ai access, publish refused) the same content is written to .craftsman/approvals/<run>.md and the two choices are asked once with AskUserQuestion; the landing path is identical — check: approval.test.mjs fallback — cite: scripts/approval.mjs:213-219, commands/_approval.md:15
- **ARCH-APPROVAL-08** [decided] Phase B of /auto MUST, when planning.featureBranches is on (default off), end at a verification point, not at base: every unit landed on its feature branch, gates green, the repo's pre-commit suite run once (ARCH-ENGINE-20), the secrets scan clean; nothing reaches base, a PR or an external service before ARCH-APPROVAL-04 is satisfied, except the Phase A docs-only plan landing (ARCH-LAND-28); with planning.featureBranches off there is no verification point: units land on base through repo-exec merge and approval_unenforced is logged — check: repo-exec-approval.test.mjs refuses and pushes nothing, approval_unenforced — cite: scripts/lib/approval-gate.mjs:11-19
- **ARCH-APPROVAL-09** [superseded by ARCH-APPROVAL-10]
- **ARCH-APPROVAL-10** [decided] The approval page MUST show, per feature: what changed and how it works; an attention list (env key names derived from the diff); evidence (gates and tests run, review verdicts, acceptance criteria, pre-commit result, diff stats, commit SHAs); risk and exact rollback (revert SHA or re-pin). Secret values never appear; env changes show key names only — check: approval-page.test fixture with a .env change renders the key, never the value — cite: scripts/lib/approval-page.mjs:34-44
