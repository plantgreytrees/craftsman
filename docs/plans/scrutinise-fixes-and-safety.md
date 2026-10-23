---
slug: scrutinise-fixes-and-safety
goal: The self-protection layer holds, so a tool call cannot forge a grant, marker, scope or goal token, run the doc-write or toggle scripts out of turn, or skip git hooks, and the Stop and drift reports say what they promise.
level: feature
priority: P0
classification: in-scope # twelve isolated /scrutinise rounds of fixes-and-safety (PR #1); this doc keeps a rolling summary plus the latest round (ARCH-DOCS-10), older rounds are in git history
tracker_rows: [] # none registered (the main checkout's TRACKER.md carries an uncommitted user change)
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(every round's decomposition came from an isolated /scrutinise with file-level fixes, and the root re-ran the security findings)
coverage:
  security:      unzip-argument-free-letters # the unzip list-only skip was deleted (round 12)
  tests:         every unit # each fix ships a case that fails on the previous code
  docs:          rules-cites-round12 # ARCH-SAFETY-05 and safety.md say archive and option spellings are best-effort
  rollback:      every unit is one commit; revert it
units:
  - id: unzip-argument-free-letters
    scope_id: unzip-argument-free-letters
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/safety-claims.test.mjs, scripts/safety-cites.test.mjs, docs/architecture/safety.rules.md, docs/architecture/safety.md, .craftsman/acceptance.md]
    arch: [ARCH-SAFETY-05, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: rules-cites-round12
    scope_id: rules-cites-round12
    project: .
    depends_on: [unzip-argument-free-letters]
    module: docs/architecture/safety.rules.md
    language: markdown
    security: normal
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [docs/architecture/safety.rules.md, docs/architecture/safety.md, scripts/safety-claims.test.mjs, docs/plans/scrutinise-fixes-and-safety.md, .craftsman/acceptance.md]
    arch: [ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [docs-curator], skills: [], guards: [arch-check], mcp: [] }
---

# Plan: scrutinise fixes-and-safety

## Outcome
PR #1 (`feat/fixes-and-safety`) builds the 20 Oct review's quick fixes and the 18 Oct safety audit's hardening (`docs/plans/fixes-and-safety.md`). Twelve isolated reviews (`craftsman:scrutineer`) then attacked the delivered guards; every round's findings were reproduced, fixed test-first, and re-reviewed. This doc is the rolling record. The full text of every earlier round (findings tables, step lists, per-round notes) is in git: `git log -p -- docs/plans/scrutinise-fixes-and-safety.md`; the last full copy is commit `1d4dc30`.

## Rolling summary of rounds 1-12
| Round | Steps | Built in | What the review found and what changed |
|---|---|---|---|
| 1 | 1-10 | ce003c9 to 5ef1ef9 | /scrutinise --deep (4 Critical, 5 Warning): a tool call could forge markers, scripts and settings keys; self-protection moved to shell words |
| 2 | 11-17 | cdcb681 to c97b5ae | one SELF_SCOPED list, protected config keys, the authority scripts check their own authority, a failed prompt hook cannot erase the prompt |
| 3 | 18-23 | c43a6ee to f1156f4 | directory destinations, symlinked directories, config-include hook-skip routes, `stopGate.markdownTests`, ARCH-SAFETY cites pinned by a test |
| 4 | 24-33 | 6a25739 to ec48f49 | subshell writes, session-id spoofing, recursive copies, in-place edits, `find -delete`, dangling links, settings keys, goal-token content hash, `craftsman.project.json`, a claims test |
| follow-ups | - | 509f7fa | the one-shot nonce pre-guard leaves for the authority scripts; Skill-record and writer-operand decided and documented |
| 5 | 34-39 | 44b2023 to e70d4a1 | nonce skip by marker, `read`/`export`/`env` setters, tar `-C` chains, awk in-place spellings, `run.sh` and `craftsman.project.json` |
| 6 | 40-43 | 513dbe5, 529622b, f7afdcc, 5992c29 | the marker removed, archive extraction as an allowlist, loop and brace forms documented as limits |
| 7 | 44-46 | efd4cdf, 4f43fb7, 25facc9 | unknown archive options refused outright; `doc-retire` under safety off |
| 8 | 47-49 | 4a6b7d1, 26bc0a4, 49009f0 | my own regression: `doc-retire` skipped its grant on a child-settable variable; reverted |
| 9 | 50-52 | e3d4812, 0c895dd, 5e34ab0 | the unzip list-only skip read list letters in member patterns |
| 10 | 53-54 | f4ad1ca, e73e842 | negated flags (`--l`) defeated the skip |
| 11 | 55-56 | 4ac46aa, 29e8c72 | my own regression: step 53 widened the list-letter search; fixed |
| 12 | 57-58 | 035749a, 1d4dc30 | `-P`/`-O`/`-I` take the rest of their cluster as a value; the skip was deleted instead of extended |

The review counts per round fell from 4 Critical + 5 Warning (round 1) to one spelling-level Critical per round (rounds 9-12). Rounds 8 and 11 were regressions I introduced; the lesson recorded for both is: no script grants, skips or relaxes an AUTHORITY check on a variable a child process can set, and no list of "letters that write nothing" is trustworthy.

## Latest round: round 12 (steps 57-58)
Review of e73e842..29e8c72: 1 Critical, 0 Warning, 3 Suggestion. The round 11 regression itself was fixed and confirmed.

| # | Finding | Class / severity | Unit |
|---|---|---|---|
| 1 | the unzip list-only skip treats any cluster holding `l t p Z v c z h` as a list flag, but `-P` (password) and, in this build, `-O`/`-I` take the REST of their cluster as a value, so the letter after them is not a list flag: `cd .craftsman && unzip -Pl ../stage/off.zip`, `cd .claude && unzip -oPl ../stage/s.zip` and `cd .claude && unzip -qoOv ../stage/s.zip` got guard exit 0 and wrote protected state (the root re-ran them; the reviewer's 1050-form matrix found exactly 21, all `-P/-O/-I` plus a list letter; allowed by earlier guard versions too) | Security / Critical | unzip-argument-free-letters |
| 2 | none of ARCH-SAFETY-05's cites landed on the unzip code | Architecture / Suggestion | unzip-argument-free-letters |
| 3 | steps 55.0-55.2 said "four rows"; three exist | Correctness / Suggestion | (record only) |
| 4 | no claims row covered a value-taking letter hiding the list letter | Test-coverage / Suggestion | unzip-argument-free-letters |

### Step 57 and 58 — as built (decision of the user, 2026-10-23, after twelve rounds)
The whitelist first planned (`/^-[ltpZvczhoqnjufaLVb]+$/`) was NOT built: the user asked for the skip to be deleted outright, the archive/option spellings to be documented as best-effort, and the review exit rule to change. Steps 57 and 58 landed in one commit because the rule text and its needle test cannot be split.
- [x] 57.0 Tests first, seen red on 29e8c72: `-Pl`, `-oPl` and `-qoOv` really wrote protected state unguarded and were allowed; the cost test expected `unzip -l a.zip` refused
- [x] 57.1 The unzip list-only skip is deleted from `otherWriters`; only the allowlist (argument-free `oqnjufaLVb`, `-d DIR`) decides, so `unzip -l a.zip`, `-v`, `-c`, `-z`, `-hh` and `unzip -l -d DIR a.zip` are refused
- [x] 57.2 The three forms are claims rows; ARCH-SAFETY-05 cites the unzip branch (`pre-guard.mjs`, pinned in `safety-cites.test` by "No list-only skip"); the older `pre-guard.test` expectation that `unzip -l` is allowed was corrected
- [x] 58.1 ARCH-SAFETY-05 and `safety.md` say there is no list-only skip and that "archive and option spellings are best-effort; the sandbox is the boundary"; options taken from the environment (`UNZIP`, `UNZIPOPT`, `TAR_OPTIONS`) are a recorded limit
- [x] 58.2 The review exit rule (below) is recorded; `verified_at` follows 035749a

CI at the build: 802 node tests, model-policy, doc-size-policy, `arch-check lint`, `claude plugin validate .`, `claude plugin test .` (12), `git diff --check`. `spendRunnerDispatch` failed once under parallel load and passed alone and in three repeat runs (a timing flake).

## Review exit rule (the user's decision, 2026-10-23)
A review whose only findings are spelling-level items in the stated limit class counts as clean: "archive and option spellings are best-effort; the sandbox is the boundary" (option spellings of `tar`/`unzip`/`awk`, loop and brace variable setters, options from the environment). Merge when a review reports 0 Critical and 0 Warning outside that class. A finding outside the class, or a regression against the previous commit, still gets a round. The loop had no end state because a spelling-level guard has none, and an interpreter write (`node -e`) bypasses all of it by design.

## Merge of main into the branch (2026-10-23)
`origin/main` was 117 commits ahead of the branch's base; the merge conflicted in 31 files and was resolved keeping both sides' intent: agent and command frontmatter (our shorter routing descriptions, main's `disable-model-invocation` and `maxTurns`), main's approval/network partials (given `user-invocable: false`), main's `docs` budget keys beside our `worktrees` keys, the size-cap tables (the lower cap wins; a merged file that no longer fits takes main's own cap), ARCH-LAND-05 as main's superseded stub (main's ARCH-LAND-23 carries the force rule), CHANGELOG sections merged within the 8 KB cap, and this plan condensed to fit ARCH-DOCS-10. Three over-budget historical manifests in `autonomous-e2e-loop.md` lost one write-only read each; six skill descriptions were shortened to stay under the 4.5 KB total; `docs/architecture/slim.rules.md` says "Skill tool" instead of the removed tool name.

## Verification background
- Evidence per round: the isolated reviewer's report (default mode, lenses code-reviewer and security-auditor), and the root's own re-run of each security finding in a throwaway repo with a temp HOME, comparing the guard before and after. Reviewers were told never to run state-writing scripts outside a `/tmp` project after the round 8 incident.
- CONSUMERS (round 12): `otherWriters` and its allowlist are private to `pre-guard.mjs`; the claims table is read by `safety-claims.test.mjs` only; the ARCH-SAFETY-05 cites are read by `arch-check lint` (range existence) and `safety-cites.test.mjs` (identifiers).
- Acceptance lines for rounds 8-12 in `.craftsman/acceptance.md` are ticked on the evidence above and confirmed or contradicted by the next review under the exit rule.

## Risk & rollback
- Every unit is one commit; revert in reverse order.
- Cost of deleting the unzip skip: `unzip -l a.zip` and any unzip not of the plain `-d DIR` form is refused for the model (run it outside the model). Cost of the tar allowlist: a clustered or abbreviated `tar -x` is refused. Both are named in `safety.md`.
- Residual risk: tests were run on Fedora's UnZip 6.00 and GNU tar only (bsdtar and busybox differ); `-O`/`-I` come from a distro iconv patch; encrypted archives are untested; a permission prompt can follow a minted nonce (it expires after 60 seconds); tools run with `CLAUDE_CODE_SESSION_ID` set and no `CLAUDE_PROJECT_DIR` can reach the real repo through the session pin (it happened once, in round 8's review).

## Out of scope (flagged, not driven)
- Recorded as a stated limit, on the user's decision (2026-10-23): the tracker's MERGED acceptance gate, `baseline` and `snapshot` honour `CRAFTSMAN=off` in a script's own environment; it is the user's documented switch for the quality side, so the quality gates are not a security boundary. Stated in ARCH-SAFETY-05 and `safety.md`, pinned by a `tracker.test.mjs` case. No authority check reads that variable.
- The stray ledger lines the round 8 reviewer wrote into the main checkout (three `docs/plans/p.md` lines in `.craftsman/tracker/events.jsonl`, `.craftsman/runs/p.json`, possibly a regenerated `docs/plans/TRACKER.md`) are for the user to remove; nothing should `git checkout` that file, which also holds the user's own uncommitted change.
- Moving the `failClosed` block, duplicated in three guards, into `core.mjs`; the interpreter, run-time-built-text and archive-contents limits `safety.md` names; runtime-only facts about Claude Code (mid-session settings reload, `--resume` keeping `session_id`).
