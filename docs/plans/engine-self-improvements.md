---
slug: engine-self-improvements
classification: in-scope # self-review of the plugin's own engine; no product owner to defer to — README.md:1-11, CONTRIBUTING.md:1-5
tracker_rows: [TRACKER#1, TRACKER#2, TRACKER#3, TRACKER#4]
guards:
  blast_radius: done # grep-only repo, no HTTP/event boundary; consumer-tracer not needed
  completeness_sweep: done
  blind_rederivation: skipped(trivial-per-unit; each unit is a single-file-family, mechanical change with no shared contract beyond in-repo grep-verified call sites)
coverage:
  contract:      1.1 | 4.1 (session-start.json shape change — only reader is stop-gate.mjs, both updated together)
  data:          N/A(no persistence beyond existing .craftsman/ state files, already covered under contract)
  config:        1.1 | N/A
  security:      N/A(no authn/authz/secret/input-boundary surface touched)
  tests:         3.1 | 3.2 | 3.3
  observability: 2.1 | 2.3
  interface:     N/A(no UI/API/CLI flag surface; /craftsman:stats output format changes, covered under 2.3/4.2)
  docs:          1.2 | 3.4 | 4.3 | 4.4
  rollback:      see Risk & rollback
units:
  - id: 1
    module: craftsman.config.json (language tooling)
    language: JSON/JavaScript (Node ESM)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 2
    module: scripts/stats.mjs, scripts/log-router.mjs, commands/scrutinise.md (observability)
    language: JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 3
    module: scripts/lib/core.test.mjs (unit tests)
    language: JavaScript (Node ESM, node:test)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 4
    module: scripts/snapshot.mjs, scripts/stop-gate.mjs (multi-runner stopGate)
    language: JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [] }
---

# Plan: Self-review improvements to the craftsman engine

## Outcome
Five gaps found in a self-review of this plugin are closed: dead C#/Java tooling
gets wired up and a new C/C++ language is added; the judgment-layer router and the
learned-rules store become visible in `/craftsman:stats`; `scripts/lib/core.mjs`'s
hand-rolled logic gets a real unit-test suite; and `stopGate.commands` supports
monorepos with more than one test runner.

## Units (executable core)

### Unit 1 — craftsman.config.json language tooling (JSON/config, normal)
Tooling: implementer implementer · gates none (config-only, no code path change) · skills none · guards none

- [ ] 1.1 In `craftsman.config.json`'s `languages.csharp` block, replace the empty
  `format`/`check` arrays with `format: ["dotnet format --include {file} -v quiet"]`
  and `check: ["dotnet format --verify-no-changes --severity info --include {file} -v quiet"]`
  — mirrors the existing `ruby`/rubocop pattern (autofix pass, then a report-only
  pass with the same tool) already in the file.
  → accept: `node -e "JSON.parse(require('fs').readFileSync('craftsman.config.json','utf8'))"`
  exits 0, and `languages.csharp.format`/`check` are non-empty arrays.
- [ ] 1.2 In `languages.java`, replace the empty arrays with
  `format: ["google-java-format -i {file}"]` and
  `check: ["checkstyle -c /google_checks.xml {file}"]` — both silently skip via
  `have()` (scripts/lib/core.mjs:121-130) when absent, consistent with every other
  language block; add one sentence to `EXTENDING.md`'s "Add or change a language"
  section noting these two binaries are what `java` now wires to, so a project can
  swap them via config override.
  → accept: same JSON-parse check as 1.1; `EXTENDING.md` mentions `google-java-format`
  and `checkstyle`.
- [ ] 1.3 Add a new `languages.cpp` block: `extensions: [".c", ".h", ".cc", ".cpp",
  ".hpp", ".hh"]`, `format: ["clang-format -i {file}"]`,
  `check: ["clang-tidy {file} --quiet"]` — `clang-format` is already probed for in
  `scripts/session-context.mjs:48` but no language block consumes it; this closes
  that gap.
  → accept: JSON-parse check passes; a scratch `.cpp` file resolves via
  `detectLang()` (scripts/lib/core.mjs:111-117) to the new `cpp` entry (verify with
  `node -e '...'` calling `detectLang`).

### Unit 2 — Observability: router decisions + learned rules in `/craftsman:stats` (JS, normal)
Tooling: implementer implementer · gates none · skills none · guards none

- [ ] 2.1 Add `scripts/log-router.mjs`: a small dependency-free CLI —
  `node log-router.mjs <ESCALATE|SKIP> [reason...]` — that calls
  `logEvent({ ev: "router", result, reason })` from `scripts/lib/core.mjs:228-233`
  (reusing the existing event log, no new storage). Reject/no-op on an argv[2] that
  isn't exactly `ESCALATE` or `SKIP` (avoid corrupting the event log with typos).
  → accept: `node scripts/log-router.mjs ESCALATE "new endpoint"` appends one
  `{"ev":"router","result":"ESCALATE",...}` line to `.craftsman/events.jsonl`;
  `node scripts/log-router.mjs bogus` writes nothing and exits non-zero.
- [ ] 2.2 In `commands/scrutinise.md`'s Phase 1 "Routing first" paragraph, add the
  instruction: immediately after `review-router` returns its verdict, run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/log-router.mjs" <verdict> "<12-word reason>"`
  via Bash, before branching on SKIP/ESCALATE. This is the only call site
  (`agents/review-router.md` itself is a pure LLM triage agent with no Bash-driven
  logging step of its own — grep-verified: only `commands/scrutinise.md:25` invokes it).
  → accept: `commands/scrutinise.md`'s Phase 1 section contains the `log-router.mjs`
  invocation instruction, placed after the router-verdict sentence and before the
  SKIP/ESCALATE branch.
- [ ] 2.3 Extend `scripts/stats.mjs` with two new sections after the existing
  "Stop gate"/"SessionStart" lines: (a) a "Review router" section reading
  `events.filter(e => e.ev === "router")`, reporting ESCALATE vs SKIP counts and
  escalate-rate percentage (or "No review-router events yet." if empty); (b) a
  "Learned rules" section calling `topRules(cfg)` (already imported pattern from
  `scripts/lib/core.mjs:258-265`) and listing each rule's `lang`/`tool`/`n`/`sample`,
  or "No learned rules yet." if empty.
  → accept: `node scripts/stats.mjs` (with at least one `router` event and one
  learned-rule present in `.craftsman/`) prints both new sections without throwing.

### Unit 3 — `scripts/lib/core.mjs` unit tests (JS, node:test, normal)
Tooling: implementer implementer · gates none · skills none · guards none

- [ ] 3.1 Create `scripts/lib/core.test.mjs` using Node's built-in `node:test` +
  `node:assert/strict` (zero new dependencies, per CONTRIBUTING.md:4-5). Test
  `globToRe` (scripts/lib/core.mjs:88-103): `**` matches across path segments
  (`"**/node_modules/**"` matches `"a/b/node_modules/c"`), single `*` does not cross
  `/`, `?` matches exactly one char, `{a,b}` alternation matches either branch, and
  literal regex metacharacters (`.`, `+`) are escaped.
  → accept: `node --test scripts/lib/core.test.mjs` passes with these cases present
  and failing before the fix would exist (n/a here — testing existing correct
  behavior) — i.e., the suite is green against current `globToRe`.
- [ ] 3.2 In the same file, test `deepMerge` (scripts/lib/core.mjs:66-74): nested
  object keys merge recursively; an array value in the override **replaces** the
  base array wholesale (current documented behavior — do not assert concatenation);
  a scalar override replaces a scalar base.
  → accept: `node --test scripts/lib/core.test.mjs` green, including this case.
- [ ] 3.3 In the same file, test `normLine` (scripts/lib/core.mjs:189-191): strips
  `:123` and `:123:45` line/col suffixes to `:N`, collapses runs of whitespace to a
  single space, and trims leading/trailing whitespace.
  → accept: `node --test scripts/lib/core.test.mjs` green, including this case.
- [ ] 3.4 Add a "Running the unit tests" line to `CONTRIBUTING.md`'s "Testing before
  a PR" section: `node --test scripts/lib/*.test.mjs`, run alongside the existing
  `node --check` loop.
  → accept: `CONTRIBUTING.md` contains the new command in that section.

### Unit 4 — Multi-runner `stopGate.commands` for monorepos (JS, normal)
Tooling: implementer implementer · gates code-reviewer (touches the Stop-gate regression contract) · skills none · guards none

- [ ] 4.1 In `scripts/snapshot.mjs`, change line 28's
  `Object.entries(cfg.stopGate?.commands || {}).find(([m]) => markerPresent(m))`
  to `.filter(...)` and run **every** matched command (sequential `await`, same
  `pexec` call as today), writing `session-start.json` as
  `{ results: [{ cmd, green }], sid, ts }` instead of the current single
  `{ testsGreenAtStart, cmd, sid, ts }` shape. This is the only writer of that file
  (grep-verified: `scripts/snapshot.mjs` is the sole writer;
  `scripts/stop-gate.mjs:44` is the sole reader).
  → accept: with two markers present (e.g. a scratch repo with both `package.json`
  and `go.mod`), running `snapshot.mjs <sid>` writes a `results` array with two
  entries.
- [ ] 4.2 In `scripts/stop-gate.mjs`, update the read at line 44 and the regression
  check at lines 45-52 to iterate `start.results` (falling back to treating a
  legacy `{testsGreenAtStart,cmd}` shape as a one-entry array, so an in-flight
  session's already-written snapshot from before this change doesn't crash Stop),
  re-running each `green: true` entry's `cmd` and pushing one `REGRESSION:` problem
  per failing command (labelled with its `cmd` so multiple failures are
  distinguishable).
  → accept: with two runners recorded green at start and one made to fail, Stop
  blocks with two distinct problems reported only for markers, or one `REGRESSION`
  problem naming the failing command; a legacy single-shape `session-start.json`
  (no `results` key) still runs without throwing.
- [ ] 4.3 Add a short note + example to `EXTENDING.md`'s "Add or change a language /
  check" section: `stopGate.commands` now runs every matched marker's command, not
  just the first, so a monorepo can list both `"package.json": "pnpm test"` and
  `"go.mod": "go test ./..."` and both run.
  → accept: `EXTENDING.md` contains this note near the existing `stopGate.commands`
  example.
- [ ] 4.4 Add a `## [Unreleased]` section to `CHANGELOG.md` above `[1.0.0]`
  summarizing all four units of this plan (language tooling for csharp/java/cpp,
  router + learned-rules visibility in `/craftsman:stats`, a `core.mjs` unit-test
  suite, multi-runner `stopGate.commands`).
  → accept: `CHANGELOG.md` has an `## [Unreleased]` section listing all four
  changes, placed above `## [1.0.0]`.

## Sequencing
Units are independent (no file overlap between 1/2/3/4 except the shared doc files
touched by their own trailing doc task) — run in numeric order for review clarity;
Unit 4 last since its `4.4` changelog task summarizes the whole plan. No unit
depends on another's code changing first.

## Verification background
- `csharp`/`java` empty arrays — `craftsman.config.json:166-175`.
- `clang-format` probed but unused — `scripts/session-context.mjs:48` vs no `cpp`
  entry in `craftsman.config.json`'s `languages`.
- `review-router` has no logging call site — grep across `commands/*.md`,
  `agents/*.md`, `scripts/*.mjs` finds only `commands/scrutinise.md:25` as an
  LLM-driven Task dispatch, no `logEvent` anywhere near it.
- `stats.mjs` only reports `gate`/`stop`/`pre`/`session_start` events —
  `scripts/stats.mjs:17-20`.
- `topRules`/`recordFailure` exist and are wired into `session-context.mjs` only,
  never surfaced back to the user — `scripts/lib/core.mjs:244-265`,
  `scripts/session-context.mjs:77`.
- `core.mjs` has zero test coverage; `CONTRIBUTING.md:33-44`'s "Testing before a
  PR" section only runs `node --check` (syntax) and JSON validation, no logic tests.
- `stopGate.commands` resolves via `.find()` (first match wins) in both
  `scripts/snapshot.mjs:28` and is read as a single `{testsGreenAtStart, cmd}` pair
  in `scripts/stop-gate.mjs:43-52` — confirmed sole writer/reader pair via grep.

## Risk & rollback
All four units are additive or config-only:
- Unit 1 only adds commands that silently no-op when their binary is absent
  (`have()` check, scripts/lib/core.mjs:121-130) — no behavior change on a machine
  without `dotnet`/`google-java-format`/`checkstyle`/`clang-format`/`clang-tidy`.
  Revert: restore the empty arrays / remove the `cpp` block.
- Unit 2 adds a new script and a new `stats.mjs` section; no existing behavior
  changes. Revert: delete `scripts/log-router.mjs` and the `scrutinise.md` line.
- Unit 3 adds a test file only. Revert: delete the file.
- Unit 4 changes the `session-start.json` shape — the one behavioral risk. Mitigated
  by 4.2's legacy-shape fallback so a session that started before the upgrade (old
  writer, new reader mid-upgrade) doesn't crash Stop; worst case it just skips the
  regression check for that session, which is the existing "not finished yet" safe
  default (stop-gate.mjs's header comment: "If it hasn't finished by Stop, that
  session's Stop skips the regression check (safe)").

## Out of scope
- Extracting `markerPresent` (duplicated in `session-context.mjs` and
  `snapshot.mjs`) into a shared helper — no third call site yet, and it's a
  pre-existing duplication unrelated to this plan's tasks (abstraction budget:
  don't refactor what wasn't asked for).
- Adding tests for scripts beyond `core.mjs` (e.g. `quality-gate.mjs`,
  `stop-gate.mjs` end-to-end) — larger effort (needs process/hook fixtures), not
  requested by the self-review.
- Windows-specific tokenization edge cases in `runOne`/`tokenize` — unrelated to
  the five findings.
