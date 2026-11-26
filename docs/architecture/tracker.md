> **Human reference.** The loop never reads this file. What it enforces lives in
> [`tracker.rules.md`](./tracker.rules.md); if the two disagree, the rules file wins
> and `/architect --update tracker` should be run.

# Tracker architecture
_Last verified: 2026-10-18 at `ac57d0e` · Source idea: [autonomous-e2e-loop](../ideas/autonomous-e2e-loop.md)_

## In plain English
The tracker already works much like Anthropic's "feature list". It is an
append-only JSON ledger (`.craftsman/tracker/events.jsonl`) with enforced
status transitions. `docs/plans/TRACKER.md` is generated from it. The
autonomous loop adds:
- a derived per-run manifest (`.craftsman/runs/<slug>.json`) that the workflow
  takes as input;
- a structured `decision` on parked rows;
- two rules: a run can't cancel rows to look finished, and each unit runs a
  smoke test before editing.

## How it fits
```mermaid
flowchart LR
  AG[unit agents] -- tracker.mjs transition --> L[(ledger events.jsonl)]
  L --> RB[renderBlock] --> TM[docs/plans/TRACKER.md]
  L --> RM[run-manifest.mjs] --> RJ[(runs/&lt;slug&gt;.json)] --> WF[workflow args]
  L -- PARKED decisions --> PC[/auto Phase C/]
```

## Decisions
| id | decision | why | rejected alternatives |
|---|---|---|---|
| ARCH-TRACKER-01 | The run manifest is derived from the ledger | Keeps every existing consumer working | Replace TRACKER.md with JSON (breaks pre-guard, tracker-sync and history) |
| ARCH-TRACKER-02 | Changes to event fields are additive only | Consumers spread `...event` | — |
| ARCH-TRACKER-03 | Structured `decision` on PARKED | Phase C is assembled mechanically | Free-text evidence |
| ARCH-TRACKER-04 | Autonomous runs can't emit CANCELLED | Stops a run declaring done early (Anthropic's harness findings) | — |
| ARCH-TRACKER-05 | Smoke test first | Catches breakage left by the previous unit | — |
| ARCH-TRACKER-06 | New `FEATURE_MERGED` status; COMPLETE only via land-feature | Hooks read status alone, so a flag would let them treat a unit as landed early | `MERGED` + `feature_landed` flag |
| ARCH-TRACKER-07 | Additive `feature`/`feature_branch` fields; manifest adds `feature_groups` | `features[]` already means units (TRACKER-01 consumers) | Rename `features[]` |
| ARCH-TRACKER-08 | `[feature:<id>]` criteria gate a feature's landing | User decision: explicit per-feature definition of done | Untagged lines gate only the last feature |
| ARCH-TRACKER-09 | Machine-readable archive headings + `lookup` | A retired plan is reachable only through its index line | A separate index file |
| ARCH-TRACKER-15 | Whole-plan criteria carry `[plan:<slug>]`; they hold only their own plan's promotion and land-feature | One shared acceptance file holds many plans; an untagged line from one plan held every plan's rows (2026-10-27) | Attribute by section header (lines land under foreign headers); tag to the plan's last unit (gates MERGED, not the plan) |
| ARCH-TRACKER-16 | Stop holds a session only to the units and plans its ledger names; untagged lines bind only plan-less sessions, otherwise appear in the Stop notice | A goal for one plan was blocked 9 times on another plan's untagged criterion (2026-10-27) | Notice only, never bind (loses a single-plan repo's gate); keep binding every owner (status quo) |

## Trade-offs & known limits
The manifest is a cache, so a crash between a transition and regeneration
leaves it stale. It is regenerated on the next transition or read.

## Plan-hierarchy additions (2026-10-18)
ARCH-TRACKER-10..12: generated epic/story rollups, `tracker publish` (the only path that commits progress to base) and the `TRACKER.jsonl` snapshot with refuse-to-blank. See [plan](./plan.md) for the reasoning and rejected alternatives.

## Partial-ledger amendments (2026-10-23)
ARCH-TRACKER-12 → 13: publish refuses to drop *any* committed row key without an archive event, not only a shrink to empty. Loost showed why: 5 local rows against 50 committed would have published silently. Repair is by name (`init --merge`), never a silent union, which could resurrect rows archived on another machine. ARCH-TRACKER-14: `init --from-block` rebuilds a ledger from the committed table when no `TRACKER.jsonl` exists (Loost); it is lossy on long evidence by design. This lands on main before PR #1 is rebased. See [approval](./approval.md).

## Run-outcome amendment (2026-11-26, owner-approved)
_Source idea: [run-outcome-clarity](../ideas/run-outcome-clarity.md) · verified at `5f6ac09`_

**In plain English.** A run used to count as "done" only when *every* row for its plan was COMPLETE, follow-ups included. A plan whose own work was finished therefore never read as done once follow-ups had been added to it. Now each row is sorted into **planned**, **follow-up** or **unclassified**, and one script prints the slug's outcome:
- `delivered`: every remaining planned row is COMPLETE and no unclassified row is open.
- `stopped — needs you`: a planned row is PARKED or BLOCKED.
- `not determined`: an unclassified row is open, and the line lists them.
- `open`: none of the above.

Follow-ups are counted beside the outcome and never hold it. The outcome is printed, never stored as a status, so the ledger stays the one source of truth.

```mermaid
flowchart LR
  L[(ledger events.jsonl)] --> CS[tracker.mjs currentState]
  PI[lib/plan-index.mjs<br/>family + planned ids<br/>ARCH-PLAN-09] --> PO
  CS --> PO[lib/plan-outcome.mjs<br/>classify + outcome]
  PO --> OUT[tracker.mjs outcome slug<br/>prints line, logs run_outcome]
  PO --> RM[runs/slug.json<br/>additive outcome key]
  PO --> DG[digest.mjs<br/>per-plan outcome line]
  OUT --> AF[/auto Finish + /goal final turn/]
  PG[tracker.mjs purge<br/>owner only] -. tracker_purged .-> LK[lib/ledger-keys.mjs<br/>publish excusals]
```

| id | decision | why | rejected alternatives |
|---|---|---|---|
| ARCH-TRACKER-17 | Outcome derived in a pure leaf lib. Rows are classed by optional `origin`, then the `followup-` prefix, then planned-id membership, else unclassified. Unclassified open rows → `not determined`; CANCELLED planned rows leave the total | Your choice. A plain `tracker_rows` match left sandbox-auto-flow open forever, because its scrutinise child lists `followup-*` rows as planned. With the prefix first, 13 of 17 live plans read delivered. A leaf lib lets core.mjs use it later without an import cycle | Membership first (the example stays open); an explicit field only (all 44 follow-ups unclassified until triaged); computing inside tracker.mjs (33 KB, and core.mjs can't import it); computing in run-manifest (stale and family-blind) |
| ARCH-TRACKER-18 | digest: only COMPLETE is done; MERGED gets its own "shipped, awaiting COMPLETE" list | Two definitions of done (digest vs /auto) were part of the confusion | Fold MERGED into Next |
| ARCH-TRACKER-19 (supersedes 13) | Owner-only `purge` action whose `tracker_purged` event excuses keys at publish | Your choice. 71 leaked fixture rows (plans a, f, demo, example, release, other, live, big). Cancel-and-archive would write 8 fake headings that shadow future slugs | Cancel then archive; hand-editing the ledger (breaks ARCH-TRACKER-11) |
| ARCH-TRACKER-20 | Fixtures are their own git root, plus a regression test (TMPDIR inside a repo, and GIT_DIR set). Lands before the purge | Your choice. mainCheckoutRoot adopts any enclosing repo, so one suite run on 2026-10-25 wrote into the real ledger | Production guard in mainCheckoutRoot (unproven for workspace subdirectories) |
| ARCH-TRACKER-21 | Warn (`tracker_row_unclassified`) when a new row is unclassifiable | Keeps the classification honest over time, and with `run_outcome` it measures whether misreads happen | Refuse such rows (would park real work) |

**Trade-offs & limits.**
- A `followup-` name removes a row from the blocking set, and nothing enforces who uses it; the acceptance clause (ARCH-AUTO-04) is the backstop.
- Three live plans read `not determined` until their 53 legacy rows are triaged by hand (ARCH-PLAN-04 forbids scripting that).
- Rollups (ARCH-TRACKER-10) and notes (ARCH-VIEWS-12) keep the every-row definition in v1, so in a repo with epics they can show IN_PROGRESS beside `delivered`.
- After the purge publish, fast-forward the main checkout before the next transition, or sync refuses on the stale TRACKER.jsonl.
- Rollout order: leak fix → purge → outcome logic → command wording.
