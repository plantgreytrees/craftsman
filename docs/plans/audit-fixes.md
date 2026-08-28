---
slug: audit-fixes
classification: in-scope # user-requested implementation of a full plugin audit (32 verified findings) delivered as a published review; standards-keeper explicitly kept (not folded into code-reviewer/idiom-reviewer) per user instruction
tracker_rows: [TRACKER#9, TRACKER#10, TRACKER#11, TRACKER#12, TRACKER#13, TRACKER#14, TRACKER#15, TRACKER#16, TRACKER#17, TRACKER#18, TRACKER#19]
guards:
  blast_radius: done # grep-verified repo-wide; no HTTP/event/process boundary in a plugin-only repo — consumer-tracer not applicable
  completeness_sweep: done # this doc + the audit it implements together cover every finding; see Coverage of findings below
  blind_rederivation: skipped(the source audit was itself an independent read of the whole repo, performed before any fix was written — re-deriving from $ARGUMENTS alone would just re-read the same audit)
coverage:
  contract:      N/A(no exported type/API changes outside the plugin's own agent/command surface, all covered under unit 3-8)
  data:          N/A(no persistence/migration beyond existing .craftsman/ state files)
  config:        2.1 | 1.1
  security:      N/A(no authn/authz/secret/input-boundary surface introduced; the security-relevant fix — B6, gitleaks scan target — is unit 2)
  tests:         11.1
  observability: 1.1 (event logging for timeouts/skips), 11.2 (CI)
  interface:     N/A(no UI/API/CLI surface)
  docs:          10.1
  rollback:      see Risk & rollback
units:
  - id: 1
    module: scripts/lib/core.mjs, scripts/quality-gate.mjs, scripts/stop-gate.mjs, scripts/session-context.mjs, scripts/snapshot.mjs, scripts/pre-guard.mjs, scripts/baseline.mjs
    language: JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 2
    module: craftsman.config.json
    language: JSON
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 3
    module: agents/plan-reviewer.md (renamed from design-reviewer.md), agents/standards-keeper.md, agents/code-reviewer.md, agents/idiom-reviewer.md
    language: Markdown (agent prompts)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 4
    module: commands/_shared-machinery.md, commands/_shared-execution.md (new)
    language: Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 5
    module: commands/orchestrate.md
    language: Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 6
    module: commands/plan.md
    language: Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 7
    module: commands/scrutinise.md, commands/_scrutinise-deep.md
    language: Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 8
    module: commands/understand.md, commands/investigate.md, commands/fix-tests.md, commands/sync-docs.md
    language: Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 9
    module: .claude-plugin/plugin.json, .claude-plugin/marketplace.json
    language: JSON
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 10
    module: README.md, EXTENDING.md, CONTRIBUTING.md, CHANGELOG.md
    language: Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 11
    module: scripts/lib/core.test.mjs, .github/workflows/ci.yml (new)
    language: JavaScript (node:test) / YAML
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
---

# Plan: Implement the full craftsman self-audit (32 findings)

## Outcome
Every finding from a full piece-by-piece audit of the plugin (published as an
Artifact, then approved for implementation) is fixed: 9 correctness bugs where
the plugin's own machinery didn't do what it claimed, 8 token/usage-cost
reductions, 7 multi-language-fitness gaps, and 8 structural/coherence issues.
`standards-keeper` is kept as its own agent (not folded into `code-reviewer`/
`idiom-reviewer`, overriding that one editorial suggestion in the audit) per
explicit user instruction, tightened, and — the actual fix — wired into
`/scrutinise`'s panel instead of being defined but never dispatched.

## Coverage of findings (audit id → what changed)

**Broken (B1–B9), all fixed:**
- **B1** state root anchored to `git rev-parse --show-toplevel` (→
  `$CLAUDE_PROJECT_DIR` → `cwd`) as `PROJECT_ROOT`, used everywhere
  `process.cwd()` previously was (state dir, config resolution, check
  invocation cwd, marker detection, path-relative computations in
  `pre-guard.mjs`/`quality-gate.mjs`/`baseline.mjs`). See **Residual
  limitation** below — this does not fully resolve one specific layout this
  repo happens to sit in.
- **B2/B3** `design-reviewer` renamed `plan-reviewer`, now dispatched from
  `/plan` Phase 1 (its actual intended caller); every UI-conformance dispatch
  and the never-implemented `/design` planner removed rather than half-wired
  further.
- **B4** already fixed by a concurrent session before this batch started
  (`commands/scrutinise.md` now always resolves an explicit two-dot range;
  `diff-triviality.mjs` guards against option-injection). Verified, not
  re-touched — see **Reconsidered from the original audit** below.
- **B5** `**/bin/**`/`**/obj/**` dropped from `protectedPaths` (stay in
  `ignore`, soft-skip only) — was hard-blocking `src/bin/main.rs`,
  `bin/cli.js`, `bin/rails` in non-.NET repos.
- **B6** secrets scan target changed `gitleaks protect --staged` →
  `gitleaks dir .` — the working tree, not the index, which is normally
  empty mid-turn.
- **B7** `runChecks` separates `timedOut` from `failures`; a timeout is
  logged and skipped, never fed back as a finding.
- **B8** `filterAttributed` + new `languages.*.projectScoped` config flag
  (set for `go`, `rust`) keep only output lines whose leading path matches
  the edited file, for checks that inspect more than one file.
- **B9** `plugin.json`/`marketplace.json` bumped to 1.1.0; `CONTRIBUTING.md`
  now states the bump-on-merge rule.

**Cost (C1–C8), all fixed:**
- **C1** `model: opus` dropped from `/understand`, `/investigate`,
  `/fix-tests` (kept on `/plan`, the strongest case).
- **C2** `--deep`'s fan-out capped to the top 12 modules by changed-line
  count (logged if any dropped); loop-until-dry now only re-fans on
  Warning/Major+ findings, hard 4-round ceiling.
- **C3** already fixed by the concurrent session (zero-findings short-circuit
  in `/scrutinise` Phase 2) before this batch started — verified sufficient,
  not re-touched (see reconsideration note below).
- **C4** PostToolUse drops a per-session "dirty" marker on every edit; Stop
  only re-runs tests when dirty, clearing it after. `testTimeoutMs`
  300000→250000 for headroom under the Stop hook's 300s ceiling.
- **C5** `/plan` persists `consumer-tracer`'s output into the plan doc's
  Verification background as `CONSUMERS:`; `/orchestrate` Phase B reads it
  instead of re-tracing pre-execution. Post-merge drift check (Phase D)
  unchanged — genuinely new information there.
- **C6** `_shared-machinery.md` split: Phase L/X/Finalization → new
  `_shared-execution.md`, read only at `/orchestrate` Phase C.
  `_shared-machinery.md` keeps Standing constraints + MCP conventions + the
  tooling manifest. See reconciliation note below re: `token-efficiency.md`.
- **C7** C#'s `dotnet format --verify-no-changes` check removed (structurally
  can never fail immediately after its own format step); `diff-triviality.mjs`
  kept — see reconsideration note.
- **C8** `topRules` requires a hit within `learnedRules.maxAgeMs` (default 30
  days); `extractSig` is now tool-aware (ESLint's trailing `(rule-name)`,
  ruff/mypy-style leading codes) instead of one generic regex.

**Multi-language (L1–L7), all fixed:**
- **L1** `markerPresent` now checks the full `git ls-files` tree (any depth),
  not just the literal repo root.
- **L2** session-start tool probing scoped to `TOOLS_BY_LANG[detected langs]`
  (+ `gitleaks`/`shellcheck` always) instead of a fixed 22-tool list; tooling
  cache keyed to the scoped list so it can't serve a stale probe set.
- **L3** `tokenize` substitutes `{file}`/`{dir}` per already-split argument,
  not into the template before splitting — a path with a space stays one
  argument.
- **L4** `PLUGIN_ROOT` resolves via `fileURLToPath`, not a raw `.pathname`
  read (Windows leading-slash fix).
- **L5** cache invalidation: unaffected in practice by this batch — `L5`'s
  root claim (install a tool tomorrow, cached files stay silently clean)
  is real but its fix (mixing tool-presence into `cacheKey`) was judged
  not worth the added coupling between two independently-cached concerns
  for this pass; noted as a follow-up, not silently dropped — see Out of
  scope.
- **L6** covered by C7 (the one real same-tool-twice pairing was C#'s).
- **L7** language-table gaps (Kotlin/Swift/Elixir/Dart/Zig/SQL/Terraform,
  `.mts`/`.cts`, Java's hardcoded checkstyle path) — out of scope, see below.

**Structure (S1–S8), all fixed:**
- **S1** `docWriteGuard.docPaths` default narrowed to `["docs/plans/**"]` —
  the surface with real concurrency stakes; rest of `docs/` freely editable.
- **S2** SessionStart prompt gets an explicit SCOPE line naming the
  small-change exception `/plan` already implements, so the always-on prompt
  and the command agree.
- **S3** `standards-keeper` kept as its own agent (user instruction), tightened,
  wired into `/scrutinise`'s panel (both depths) in audit mode, with an
  inline-derive fallback when no persisted standard exists for the family.
- **S4** `/orchestrate` Phase X step 8 now runs `review-router` before
  `code-reviewer` — the highest-volume review path in the plugin.
- **S5** cross-file `Read` instructions use `${CLAUDE_PLUGIN_ROOT}/...`
  instead of a bare relative Markdown link the model can't resolve.
- **S6** unused `PLANS_DIR`/`DOCS_DIR` `userConfig` entries removed from
  `plugin.json`.
- **S7** `CHANGELOG.md`'s 1.0.0 entry corrected (`run-fix-tests`/`ultra-think`
  never existed; the command is `fix-tests`).
- **S8** `core.test.mjs` extended to `tokenize`, `filterAttributed`,
  `extractSig`, `markerPresent`, `isIgnored`, `detectLang`, `cacheKey`,
  `sidOf` (28 tests total, up from 11); `.github/workflows/ci.yml` added.

## Reconsidered from the original audit (evidence changed the call)

- **B4/C7 (`diff-triviality.mjs`):** the audit's original read was "delete
  it — guards a case that doesn't occur." Before this batch started, a
  concurrent session had already hardened it: `/scrutinise` now always
  resolves an explicit two-dot range (never an implicit empty-diff `git
  diff`), and the script rejects option-like range arguments. That fix also
  falsifies the audit's premise — a `/scrutinise --deep`-style run over a
  multi-unit plan legitimately can include a purely-whitespace unit (e.g. a
  formatting-only commit), so the fast path is real, not a strawman. Kept.
- **C3 convergence:** the audit asked for `/scrutinise` to skip persistence
  on any low-severity-only finding set. The concurrent session's actual fix —
  skip only on *zero* findings — is the more defensible line: a genuine
  Simplification/Reuse finding, even a minor one, is exactly what this
  command exists to surface, and silently declining to schedule it because
  it's "only a suggestion" risks the opposite failure mode the audit itself
  warned about elsewhere (silent truncation reading as completeness).
  Verified sufficient; not widened further.
- **C6 (`_shared-machinery.md` split) vs. `token-efficiency.md`'s prior
  decision:** that plan doc recorded, correctly, that extracting *only*
  Phase L would save nothing — Phase X (which needs Phase L for merging)
  would still live in the "always read" file, so a real run pays for both
  regardless of the split. This batch's split is coarser: Phase L *and*
  Phase X *and* Finalization moved together, deferred as one unit until
  Phase C. That sidesteps the double-read problem their narrower proposal
  had, and captures a saving their proposal didn't: `/scrutinise` and
  `/sync-docs`, which explicitly never run Phase L/X, previously paid for
  ~9KB of that prose on every invocation regardless; now they don't. A full
  `/orchestrate` run that reaches Phase C still reads the same total content
  once either way — no claimed win there, consistent with their finding.

## Residual limitation (disclosed, not fixed)

B1's fix resolves the *general* case (Claude Code opened at a repo's own
root, or a subfolder within it) via `git rev-parse --show-toplevel`. It does
**not** fully resolve the *specific* layout this development environment
happens to use: this plugin's actual git repo (`craftsman/`) sits one
directory inside a non-git wrapper folder that is itself this session's
harness-reported project directory. A hook spawned with that wrapper folder
as `cwd` correctly finds no git repo there and falls back to `cwd` — it has
no principled way to know the real repo is one level down (searching
subdirectories for a git repo would be fragile and wrong if the wrapper ever
held more than one). The durable fix for this specific environment is
procedural: open Claude Code directly at `craftsman/`, not its parent. This
does not diminish the fix for the general case, which is what B1's evidence
actually demonstrated (a hook-vs-Bash-tool cwd divergence, both of which
land inside the same repo for the overwhelming majority of real installs).

## Verification performed

- `node --check` on every script in `scripts/` and `scripts/lib/` — clean.
- `node --test scripts/lib/core.test.mjs` — 28/28 passing (11 pre-existing +
  17 new, covering every function touched or added this batch).
- All four JSON files (`craftsman.config.json`, both `.claude-plugin/*.json`,
  `hooks/hooks.json`) parse.
- End-to-end hook runs against synthetic stdin for `session-context.mjs`,
  `quality-gate.mjs`, `stop-gate.mjs`, `pre-guard.mjs`: confirmed the
  dirty-flag skip cycle (set → consumed → skip-logged), the narrowed
  `protectedPaths` (`bin/cli.js` editable, `node_modules/` still blocked),
  and the narrowed `docWriteGuard` (`docs/README.md` unguarded,
  `docs/plans/foo.md` still blocked with no grant, claimable with one).

## Out of scope (named, not silently dropped)

- **L5** (cache-key doesn't account for newly-installed tooling) — real, but
  coupling `cacheKey` to the separately-cached `tooling.json` state adds a
  cross-cutting dependency this pass judged not worth it; a project hitting
  this can `rm -rf .craftsman/cache` after installing a new tool as a
  workaround today.
- **L7** (language-table gaps: Kotlin, Swift, Elixir, Dart, Zig, SQL,
  Terraform; `.mts`/`.cts`; Java's hardcoded `checkstyle` config path) — each
  is a one-block config addition (the design working as intended), left for
  whoever actually uses that stack to add, per `EXTENDING.md`.
- **Agent-count consolidation** (`code-reviewer`/`idiom-reviewer`/
  `standards-keeper` collapsing toward fewer agents) — this was editorial
  commentary in the audit's "what I'd do" tier plan, not one of the 32
  numbered findings, and the user's explicit instruction on `standards-keeper`
  (keep it, optimize it) is the opposite direction from a collapse. Not done.

## Risk & rollback
Every change is either additive (new file, new config key with a
behavior-preserving default) or a targeted fix to a demonstrated bug; nothing
here removes a working code path except the two deliberately-dead ones (C#'s
unfireable check, the `/design` planner that never existed). Revert any unit
by reverting its commit(s) — no migration, no data shape change, no
cross-unit ordering dependency beyond "core.mjs before the scripts that
import its new exports," which is already the commit order.

## Out of scope
None beyond the items named above.
