---
slug: known-issues-doc
classification: in-scope # user-requested: pre-existing/skipped issues should be recorded in docs/ instead of silently disappearing
tracker_rows: [TRACKER#20, TRACKER#21]
guards:
  blast_radius: done # grep-verified; only caller of writeBaseline/runChecks in this shape is baseline.mjs itself
  completeness_sweep: done
  blind_rederivation: skipped(trivial — single new capability, one script + one new pure function, no shared contract change)
coverage:
  contract:      N/A(no exported type/API change outside this plugin's own script surface)
  data:          N/A(no persistence beyond the new doc file itself, which IS the deliverable)
  config:        2.1
  security:      N/A(no authn/authz/secret/input-boundary surface)
  tests:         1.2
  observability: N/A(the doc itself is the observability win; no new logEvent needed beyond baseline's existing one)
  interface:     N/A(no UI/API/CLI surface beyond the existing /craftsman:baseline command)
  docs:          2.2
  rollback:      see Risk & rollback
units:
  - id: 1
    module: scripts/lib/core.mjs, scripts/baseline.mjs, scripts/lib/core.test.mjs
    language: JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 2
    module: craftsman.config.json, commands/baseline.md, commands/sync-docs.md, EXTENDING.md, INSTALL.md, README.md, CHANGELOG.md
    language: JSON/Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
---

# Plan: Record skipped pre-existing issues in docs/errors/

## Outcome
`/craftsman:baseline` no longer lets pre-existing findings disappear into an
opaque, gitignored, local-only snapshot. It now also writes
`docs/errors/KNOWN_ISSUES.md` — a single, worst-first table of every file
with pre-existing issues (language, tool, finding count, a truncated sample)
— tracked in git, regenerated wholesale on every baseline run, so the debt is
visible to the whole team and addressable later instead of silently skipped
forever.

## Design decisions (and what was deliberately left out)

- **Regenerated wholesale, not merged/annotated across runs.** The doc has no
  persisted status/owner/priority per row that survives a re-run. A fuller
  design (matching `docs/plans/TRACKER.md`'s row-persists-and-gets-archived
  model) would need a stable per-finding identity to merge against and a way
  to preserve human annotations through regeneration — real complexity for a
  request that asked for *visibility*, not a lifecycle-tracking system. Left
  for a follow-up if actually wanted; noted here so it isn't mistaken for an
  oversight.
- **File-level granularity, not one row per finding line.** A legacy repo's
  baseline can run to hundreds of individual lint lines; a table with one row
  per *file* (count + one representative sample) stays readable and puts the
  worst offenders at the top. Full detail for a given file is still in
  `.craftsman/baseline/<hash>.txt` locally if needed.
- **Not added to `protectedPaths`.** Considered hard-blocking direct edits
  (the doc's own banner says "not hand-edited"), but `TRACKER.md` has the
  identical requirement and enforces it by convention/instruction only, not
  a mechanical block — and this plan's own prior work (`audit-fixes`, finding
  B5) specifically *reduced* over-eager hard-blocking. Followed that
  precedent instead: the banner text is the only enforcement.
- **`/sync-docs --arch` excludes `docs/errors/`** — that command reconciles
  hand-authored architecture/feature docs against code; this doc is
  machine-managed by `/craftsman:baseline` on its own schedule, the same
  reason `docs/plans/`, `docs/api/`, and `docs/standards/` are already
  excluded from its scope.
- **Doesn't touch the ongoing PostToolUse skip path.** `quality-gate.mjs`'s
  `pass-baselined` result (a file you're editing has pre-existing, already-
  baselined issues you didn't touch) never *discovers* a new pre-existing
  issue — by construction, everything in the baseline was already captured
  when `/craftsman:baseline` last ran. Only that command needed to write the
  doc.

## Verification performed
- `node --check` on `core.mjs` and `baseline.mjs` — clean.
- `renderKnownIssuesDoc` unit tests (empty state, sort order, pipe-escaping,
  long-sample truncation, summary counts) — 6 new tests, 36/36 total passing.
- End-to-end: ran `baseline.mjs` against an isolated temp git repo with a
  synthetic always-failing check command — confirmed the doc is created with
  correct content on a real finding, confirmed it's *not* created when there's
  nothing to report and no prior doc exists (no clutter for a clean repo), and
  confirmed a subsequent clean run rewrites an existing doc to an explicit
  "no known issues" state rather than leaving it stale.
- Ran `baseline.mjs` against this repo itself — 0 findings (no JS/MJS linter
  installed in this environment), correctly did not create `docs/errors/`.

## Risk & rollback
Additive only — a new config key with a default that preserves prior
behavior if disabled (`baseline.errorsDoc: false`), one new pure function, no
change to any existing exported function's signature or behavior. Revert by
reverting the commit; no migration or data-shape change.

## Out of scope
Per-finding persistence/annotation across runs (see Design decisions above).
