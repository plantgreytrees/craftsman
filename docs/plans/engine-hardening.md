---
slug: engine-hardening
classification: in-scope # self-review of the plugin's own engine, going beyond the four already-merged rounds; no product owner to defer to — README.md:1-11, CONTRIBUTING.md:1-5
tracker_rows: [TRACKER#22, TRACKER#23, TRACKER#24, TRACKER#25]
guards:
  blast_radius: done # grep-verified; no HTTP/event/process boundary in a plugin-only repo, consumer-tracer not applicable
  completeness_sweep: done
  blind_rederivation: explore-agent — found 5 same-class defects the manual analysis missed (see Verification background); folded into Units 1-3
coverage:
  contract:      N/A(no exported type/API change outside this plugin's own script surface; tokenize()'s signature/behavior unchanged, markerPresent/cacheKey signatures unchanged)
  data:          N/A(no persistence/migration beyond existing .craftsman/ state files)
  config:        1.6
  security:      N/A(no authn/authz/secret/input-boundary surface introduced; 1.3 changes the secrets-scan TRIGGER condition only — a real hit is still a hard, non-baselined block)
  tests:         1.5 | 2.2 | 2.5
  observability: 1.3 | 1.4 | 2.6 | 2.7
  interface:     N/A(no UI/API/CLI surface)
  docs:          1.7 | 4.1
  rollback:      see Risk & rollback
units:
  - id: 1
    module: scripts/stop-gate.mjs, scripts/snapshot.mjs, scripts/lib/core.mjs (splitCmd), craftsman.config.json, EXTENDING.md
    language: JavaScript (Node ESM, dependency-free) / JSON / Markdown
    security: normal
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [] }
  - id: 2
    module: scripts/lib/core.mjs, scripts/session-context.mjs, scripts/baseline.mjs
    language: JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 3
    module: commands/understand.md, commands/investigate.md, commands/sync-docs.md
    language: Markdown (Claude Code command prompts)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 4
    module: CHANGELOG.md
    language: Markdown
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
---

# Plan: Harden the craftsman engine — Stop-gate correctness, marker detection, fan-out caps

## Outcome
The Stop hook can no longer block completion on a pre-existing secret it just
re-scanned for the tenth time this session, nor silently exceed its own 300s
hook ceiling with a slow monorepo's multiple test runners. A quoted argument
in a configured command no longer breaks silently in `stop-gate.mjs` or
`snapshot.mjs`. A freshly scaffolded, not-yet-`git add`ed marker file (new
`package.json`, `go.mod`) is detected immediately instead of being invisible
until the next commit — in stack detection, tool-runner selection, *and*
`/craftsman:baseline`. Tool-presence probing on Windows no longer silently
reports every tool as absent. `/understand`, `/investigate`, and
`/sync-docs --tracker` all get the same fan-out cap + drop-logging discipline
`/scrutinise --deep` already has, instead of an unbounded blast-radius trace.

## Units (executable core)

### Unit 1 — Stop-gate correctness + budget (JS/JSON/Markdown, normal)
Tooling: implementer implementer · gates code-reviewer (touches the Stop-gate regression contract, per the engine-self-improvements Unit 4 precedent) · skills none · guards none

- [ ] 1.1 In `scripts/lib/core.mjs`, extract the quote-aware token-splitting logic
  already inside `tokenize()` (lines 199-209: `cmdTemplate.match(/"[^"]*"|'[^']*'|\S+/g) || []`,
  then strip surrounding quotes) into a private `splitTokens(str)` helper, and
  export a new `splitCmd(str)` that returns `splitTokens(str)` as-is (no
  `{file}`/`{dir}` substitution — these call sites have no per-file template).
  `tokenize()` keeps its existing exported signature and behavior unchanged.
  → accept: `node --check scripts/lib/core.mjs` exits 0; `node --test
  scripts/lib/core.test.mjs` still green with zero edits to existing
  `tokenize` test cases.
- [ ] 1.2 In `scripts/stop-gate.mjs`, import `splitCmd` and replace all three
  `cmd.split(" ")` sites (the security-check loop, the `results` test-command
  loop, the `extraChecks` loop) with `splitCmd(cmd)`.
  → accept: `node --check scripts/stop-gate.mjs` exits 0; a config with
  `stopGate.extraChecks: ["node -e \"process.exit(0)\""]` (a quoted-argument
  command) runs without throwing via `echo '{}' | node scripts/stop-gate.mjs`.
- [ ] 1.3 In `scripts/stop-gate.mjs`, before the secrets-scan loop, resolve
  tree-dirtiness once via `pexec("git", ["status", "--porcelain",
  "--ignored"], { cwd: PROJECT_ROOT })` — **`--ignored` is required, not
  optional**: plain `--porcelain` omits gitignored files by default, and a
  freshly-created `.env`-style file is exactly the class of file most likely
  to carry a real secret and most likely to be gitignored; without `--ignored`
  it would read the tree as "clean" and skip the one scan that exists to
  catch it. Fail-safe: any error (not a git repo, git absent) defaults
  dirty=true, scan runs. Skip the whole `cfg.security.check` loop when clean,
  logging `logEvent({ ev: "stop-secrets-skipped", sid, reason: "clean" })`;
  run it exactly as today when dirty. This changes only the "should we scan
  right now" decision — a real gitleaks hit when it does run is still a hard,
  non-baselined block.
  → accept: with a fully committed, clean worktree, `echo '{}' | node
  scripts/stop-gate.mjs` logs `stop-secrets-skipped` and does not invoke
  gitleaks; with an untracked scratch file present, the scan runs as before;
  with only a **gitignored** scratch file present (e.g. matching an existing
  `.gitignore` pattern), the scan still runs (proves `--ignored` is doing its
  job).
- [ ] 1.4 Restructure `scripts/stop-gate.mjs`'s command execution from three
  independent sequential loops (secrets, test-commands, extraChecks) into one
  **concurrent** batch, following the existing `Promise.all` idiom
  `scripts/lib/core.mjs`'s own `runChecks()` already uses for the same
  "run N independent shell commands, bounded" problem:
  - Build one flat task list — `{ kind: "secret"|"test"|"extra", cmd,
    timeoutMs }` — from (a) `cfg.security.check` entries when 1.3 says dirty,
    each `timeoutMs: 60000` (the existing hardcoded secrets timeout,
    unchanged); (b) each `green: true` entry from `results` when `isDirty`,
    `timeoutMs: cfg.stopGate?.testTimeoutMs ?? 250000`; (c) each
    `cfg.stopGate?.extraChecks` entry, same `testTimeoutMs` default.
  - Compute one shared deadline: `const budgetDeadline = Date.now() +
    (cfg.stopGate?.totalBudgetMs ?? 280000)`.
  - Run all tasks via a single `Promise.all(tasks.map(runTask))`, where
    `runTask` computes `const cap = Math.min(t.timeoutMs, budgetDeadline -
    Date.now())` **at dispatch time** — since every task dispatches together
    at (approximately) the same instant, `cap` is effectively each task's own
    full configured `timeoutMs` in the common case (this is the fix for the
    sequential design's flaw: secrets and tests no longer compete for the
    same clock by running one after another, they run alongside each other,
    so the shared budget only ever binds when the *sum of what's actually
    slow* is large — e.g. several genuinely slow test runners — not merely
    because a mandatory secrets scan happened to run first). `cap <= 0` →
    skip that task (`logEvent({ ev: "stop-budget-exceeded", sid, cmd:
    t.cmd })`), never run it. Preserve each kind's existing error handling
    exactly: `kind: "secret"`/`"extra"` still `continue`-skip silently on
    `e.code === "ENOENT"` (tool absent); `kind: "test"` has no such skip (a
    project's own test command must exist). Preserve each kind's existing
    output truncation (`secret`: `slice(0,15)`; `test`: `slice(-30)`;
    `extra`: `slice(-20)`) and `problems` message wording exactly as today.
  - **Explicitly documented exception, not silently inherited:** a
    budget-skipped `secret` task is logged only, same as `test`/`extra` —
    given concurrent dispatch makes this practically unreachable except under
    genuine multi-command time pressure, this is a deliberate, disclosed
    choice (state it in a comment above the task list), not an accidental
    weakening of "secrets are always a hard block" — that invariant is about
    what happens *when a scan runs and finds something*, not about whether an
    already-time-starved Stop attempt gets to run it at all.
  - The existing `if (results.length) { try { fs.unlinkSync(dirtyPath); }
    catch {} }` dirty-flag-clear logic keeps its current condition (based on
    `results.length`, i.e. "was there a session-start snapshot to check
    against"), independent of whether any individual test task was
    budget-skipped or failed.
  → accept: with `stopGate.totalBudgetMs` set to a very small value (e.g.
  `10`) in a scratch config and two matched `stopGate.commands` entries,
  `echo '{}' | node scripts/stop-gate.mjs` completes without hanging and logs
  at least one `stop-budget-exceeded` event; with the default budget and one
  normal-speed test command plus the secrets scan, both run to completion
  concurrently and neither is skipped (proves the common case no longer
  starves either category).
- [ ] 1.5 In `scripts/snapshot.mjs`, replace its own naive `cmd.split(" ")`
  (same defect class, found independently at the same call site pattern) with
  `splitCmd(cmd)`, and change its `testTimeoutMs` fallback default from
  `180000` to `250000` so it agrees with `stop-gate.mjs`'s default for the
  same config key (`cfg.stopGate?.testTimeoutMs`) instead of silently
  disagreeing.
  → accept: `node --check scripts/snapshot.mjs` exits 0; grepping the file
  shows no remaining `.split(" ")` and no remaining `180000`.
- [ ] 1.6 Add tests to `scripts/lib/core.test.mjs` for `splitCmd`: a quoted
  argument with an embedded space stays one token (`splitCmd("pytest -q -k
  'test something'")` → `["pytest","-q","-k","test something"]`), and a plain
  unquoted command still splits on whitespace.
  → accept: `node --test scripts/lib/core.test.mjs` green including the new
  cases.
- [ ] 1.7 Add `"totalBudgetMs": 280000` to `craftsman.config.json`'s
  `stopGate` block, alongside `testTimeoutMs` — 20s headroom under the Stop
  hook's 300s ceiling (`hooks/hooks.json:15`) for process/IPC overhead.
  → accept: `node -e "JSON.parse(require('fs').readFileSync('craftsman.config.json','utf8'))"`
  exits 0; `stopGate.totalBudgetMs` is `280000`.
- [ ] 1.8 Add a short note to `EXTENDING.md`'s Stop-gate section (near the
  existing `testTimeoutMs`/`stopGate.commands` documentation) explaining
  `stopGate.totalBudgetMs`: the shared deadline across every command Stop
  runs concurrently (secrets scan + every matched test runner + every
  `extraChecks` entry), defaulting to 280000ms of headroom under the Stop
  hook's 300s ceiling in `hooks/hooks.json`, that the commands run alongside
  each other (not summed) so the common single-runner case is unaffected,
  and that a budget-skipped command is logged (`stop-budget-exceeded`), never
  blocked.
  → accept: `EXTENDING.md` documents `stopGate.totalBudgetMs` with this
  explanation.

- [ ] 1.9 **Addendum, found by an independent post-merge security review of
  1.3/1.4 (not part of the original plan):** the clean-tree skip means an
  already-committed secret that predates this session — never yet caught by
  any scan — would go permanently unscanned once the tree happens to be
  clean, instead of being re-caught on every Stop as the old unconditional
  scan guaranteed. That's a real narrowing of "secrets are always a hard
  block, never baselined," not just the intended efficiency win. Fix: track
  a session-scoped `sessionDir(sid)/secrets-scanned` marker (same pattern as
  the existing `dirty` marker); the secrets loop runs when `treeDirty ||
  !scannedThisSession` (i.e. always at least once per session, regardless of
  dirtiness), writing the marker via `atomicWrite` right after deciding to
  scan. Every Stop after the first in a clean session still skips — the
  efficiency win is preserved — but no session can complete with an
  already-committed secret never having been looked at even once.
  → accept: a fresh session's very first Stop scans even on a fully clean
  tree (no `stop-secrets-skipped` log on that first Stop); a second
  consecutive clean Stop in the same session skips and logs
  `stop-secrets-skipped`; a dirty Stop always scans regardless of the marker.
- [ ] 1.10 **Second addendum, found while manually verifying 1.9:** `git
  status --porcelain --ignored` also reports this plugin's own `.craftsman/`
  runtime-state directory (untracked, gitignored, and realistically always
  present with a constantly-appended `events.jsonl` once the plugin has run
  once) as non-empty essentially always — silently making `treeDirty` read
  `true` on nearly every real Stop regardless of whether the actual PROJECT
  source tree changed, defeating 1.3's entire point outside a
  never-yet-run-once repo. Fix: filter any porcelain status line whose path
  is `.craftsman` or starts with `.craftsman/` out of the dirty computation
  before checking for remaining content — `--ignored` itself stays on
  (still needed for a real gitignored file like `.env` elsewhere in the tree).
  → accept: a scratch repo with a non-trivial `.craftsman/events.jsonl`
  present but an otherwise fully clean/committed source tree reads as NOT
  dirty; the same repo with a real tracked-file modification still reads as
  dirty.

- [ ] 1.11 **Third addendum, found by automated security review
  ("fail-open-state-drift"):** the session-scoped `secrets-scanned` marker
  from 1.9 was a bare boolean (file exists = "already scanned"), but
  `loadConfig()` re-reads `craftsman.config.json` fresh on every Stop — a
  mid-session edit to `security.check` (a new/changed scan tool) would leave
  an already-scanned session permanently skipping the newly-configured check
  for the rest of that session, since the marker recorded only THAT
  something was scanned, not WHAT. Fix: store
  `sha1(JSON.stringify(cfg.security?.check || []))` in the marker instead of
  a timestamp; "already scanned" now requires the marker's content to match
  the CURRENT signature, not merely exist. Preserves 1.9's budget-skip
  guarantee unchanged (same write site/gating, only the written value
  changed).
  → accept: an unchanged config across consecutive clean Stops in one
  session skips as before; a `security.check` edit mid-session forces a
  fresh scan on the next Stop even though the tree and session are otherwise
  unchanged; a fresh session with no marker yet still gets its guaranteed
  first scan.

### Unit 2 — Marker/tool detection correctness (JS, normal)
Tooling: implementer implementer · gates none (no Stop-gate regression contract touched) · skills none · guards none

- [ ] 2.1 In `scripts/lib/core.mjs`'s `gitTrackedFiles()`, change `git(["ls-files"])`
  to `git(["ls-files", "--others", "--cached", "--exclude-standard"])` so a
  marker file on disk but not yet staged/committed is still found
  (`--exclude-standard` still respects `.gitignore`). Update the stale
  "tracked-file list" wording in the function's doc comment (lines ~143-145,
  ~155-157) to describe the new tracked-plus-untracked-not-ignored behavior.
  Also export a test-only `resetGitTrackedFilesCache()` that sets the
  module-level `_gitFiles` memo back to `null` — a one-line comment marks it
  as test-only (production call sites never need to invalidate this within
  one process's short lifetime), giving tests a seam to exercise the real
  function instead of duplicating its git-args literal.
  → accept: `node --check scripts/lib/core.mjs` exits 0.
- [ ] 2.2 Add a test to `scripts/lib/core.test.mjs` that creates a real
  untracked-but-not-ignored scratch file, calls `resetGitTrackedFilesCache()`
  then the real exported `gitTrackedFiles()` (not a hand-written duplicate of
  its git-args), asserts the file is present in the result, and removes the
  scratch file in a `finally` block (also resetting the cache again so later
  tests aren't affected by this test's memoized result).
  → accept: `node --test scripts/lib/core.test.mjs` green including the new
  case, and unaffected by test execution order.
- [ ] 2.3 In `scripts/baseline.mjs`, replace its own `(await
  git(["ls-files"])).split("\n")...` block with `await gitTrackedFiles()`
  (import it from `./lib/core.mjs`) — removes a second, independent
  implementation of the same tracked-file listing (found by blind
  rederivation) and gets the untracked-file fix from 2.1 automatically.
  Remove the now-unused `git` import if nothing else in the file uses it
  (verify with grep before removing). Update the stale "Prefer git-tracked
  files" comment (lines ~15-18) to match.
  → accept: `node --check scripts/baseline.mjs` exits 0; grep confirms no
  remaining direct `git(["ls-files"])` call in the file.
- [ ] 2.4 In `cacheKey()`, add `lang.format` and `lang.projectScoped` to the
  hashed input alongside the existing `lang.check`
  (`.update(JSON.stringify(lang.format || []))`,
  `.update(String(!!lang.projectScoped))`), so editing either busts the cache
  the same way editing `check` already does. Add a one-line comment marking
  this field list as a **deliberate allow-list** (not every `lang.*` field
  affects check/format output — `extensions`/`ignore` don't — so the next
  field that's added and does affect output needs a human decision to add it
  here, not silent omission).
  → accept: `node --check scripts/lib/core.mjs` exits 0.
- [ ] 2.5 Extend the existing `cacheKey: identical inputs are deterministic; a
  changed config busts the key` test in `scripts/lib/core.test.mjs`: two
  `lang` objects identical except for `format` produce different keys; same
  for `projectScoped`.
  → accept: `node --test scripts/lib/core.test.mjs` green including the new
  cases.
- [ ] 2.6 In `scripts/lib/core.mjs`'s `which()`, distinguish `e.code ===
  "ENOENT"` (the probe binary — `which`/`where` — itself is absent) from a
  normal non-zero exit (probe ran, target tool not found), and call `warn(...)`
  once per process when the probe itself is missing, instead of silently
  treating both as "tool not installed."
  → accept: `node --check scripts/lib/core.mjs` exits 0.
- [ ] 2.7 In `scripts/session-context.mjs`'s duplicated inline tool-probe
  (`for (const b of wanted) { try { await pexec("which", [b]); ... } catch
  {} }`), fix two defects found by blind rederivation in the same few lines:
  (a) it hardcodes `"which"` with no `win32` → `"where"` branch, so every
  tool silently reads as absent on Windows regardless of what's installed —
  add the same platform branch `core.mjs`'s `which()` already uses; (b) apply
  the same ENOENT-vs-not-found distinction as 2.6, warning once when the
  probe binary itself is missing.
  → accept: `node --check scripts/session-context.mjs` exits 0; grep confirms
  a `win32` check now guards the probe binary name.

### Unit 3 — Fan-out caps for read-only comprehension commands (Markdown, normal)
Tooling: implementer implementer · gates none (prompt-doc edits, no code path) · skills none · guards none

- [ ] 3.1 In `commands/understand.md`'s Phase 1 opening paragraph, add an
  explicit fan-out cap mirroring `_scrutinise-deep.md`'s Phase D cap: full
  per-bullet tracing (entry points, layers, contracts, state, enforcement,
  tests) applies to the target and its directly-coupled modules (direct
  importers/importees); once the total exceeds ~15 modules, anything past
  that first ring is listed by name only (not traced), and the brief's "Gaps,
  risks & open questions" section says so explicitly — a huge target
  degrades visibly, not silently or by unbounded spend.
  → accept: `commands/understand.md` Phase 1 names an explicit numeric cap and
  an explicit "log what's excluded" instruction, phrased analogously to
  `_scrutinise-deep.md`'s existing cap language.
- [ ] 3.2 In `commands/investigate.md`'s Phase 1 ("Cast wide: the brief is
  everything wrong on this path, not the first plausible cause" — no cap),
  add the analogous cap: parallel subagent dispatch is bounded to the path
  segments actually on the reproduced/suspected route plus their direct
  neighbors; a segment count beyond ~15 gets the same "list, don't fully
  trace, and say so" treatment.
  → accept: `commands/investigate.md` Phase 1 names the same cap discipline.
- [ ] 3.3 In `commands/sync-docs.md`'s `--tracker` mode step 2 (batched
  `phase-tracker`/`Explore` verifier fan-out, no stated cap), add the same
  cap: batch size bounded to ~15 rows per fan-out round, remaining rows
  processed in subsequent rounds rather than one unbounded fan-out, logged so
  a large tracker's true batch count is visible.
  → accept: `commands/sync-docs.md`'s `--tracker` step 2 names the batch cap.

### Unit 4 — CHANGELOG (Markdown, normal)
Tooling: implementer implementer · gates none · skills none · guards none

- [ ] 4.1 Append to `CHANGELOG.md`'s existing `## [Unreleased]` section (reuse
  its current bucket structure, do not create a second `## [Unreleased]`
  header) bullets summarizing: Stop-gate's secrets scan now skips a clean
  tree and shares a wall-clock budget across every command it runs;
  `stop-gate.mjs`/`snapshot.mjs` now quote-safely split configured commands;
  marker/tool detection now sees untracked-but-not-ignored files (stack
  detection, Stop-gate runner selection, and `/craftsman:baseline` alike);
  tool-presence probing no longer silently misreports on Windows or when
  `which`/`where` itself is missing; `cacheKey` now invalidates on a changed
  `format`/`projectScoped` language setting; `/understand`, `/investigate`,
  and `/sync-docs --tracker` fan-out is now capped and logs what's excluded.
  → accept: `CHANGELOG.md`'s `## [Unreleased]` section lists these changes,
  no duplicate header created.

## Sequencing
Unit 1 before Unit 2 — both touch `scripts/lib/core.mjs` in disjoint regions
(Unit 1: `tokenize`/`splitCmd` area; Unit 2: `gitTrackedFiles`/`cacheKey`/
`which` area) with no line overlap, but running Unit 1 to a merged state
first removes any chance of a same-file merge conflict rather than relying on
a clean 3-way merge. Unit 3 is fully independent (Markdown-only, different
files) — any order. Unit 4 last, once Units 1-3's final wording is known.

## Verification background
- `scripts/stop-gate.mjs:29-40` — the unconditional secrets-scan loop; `isDirty`
  (line 49) is a session Write/Edit/MultiEdit marker, not working-tree state,
  confirmed by grep it's set only in `scripts/quality-gate.mjs`'s PostToolUse
  path — a Bash-created file never sets it, so gating on it (instead of `git
  status --porcelain`) would silently miss a Bash-introduced secret.
- `scripts/stop-gate.mjs:59, :80` and `hooks/hooks.json:15` — the three
  independent per-command timeouts vs the hook's single 300s ceiling.
- `scripts/lib/core.mjs:199-209` — `tokenize()`'s existing quote-aware split,
  the fix already merged (L3) for `quality-gate.mjs`/`baseline.mjs`'s
  check/format commands but never extended to `stop-gate.mjs`.
- `scripts/snapshot.mjs:25-30` — blind-rederivation finding: the identical
  naive-split defect, plus a `180000` vs `250000` `testTimeoutMs` default
  mismatch against the same config key `stop-gate.mjs` reads.
- `scripts/lib/core.mjs:147-152` (`gitTrackedFiles`), consumed by
  `markerPresent` (:158-166) → `session-context.mjs:34,80`, `snapshot.mjs:20`
  — bare `git ls-files` misses untracked files.
- `scripts/baseline.mjs:19` — blind-rederivation finding: an independent,
  duplicate `git(["ls-files"])` call with the identical gap, never routed
  through the shared `gitTrackedFiles()` helper.
- `commands/_scrutinise-deep.md:12` — the existing "cap fan-out to top 12
  modules, log what was dropped" precedent (already-merged audit-fixes C2)
  this plan's Unit 3 extends to three more commands.
- `commands/understand.md:16,24-33`, `commands/investigate.md:21-27`,
  `commands/sync-docs.md:32` — the three uncapped fan-out sites (the first
  from the original analysis; the latter two from blind rederivation).
- `scripts/lib/core.mjs:188-197` and `scripts/session-context.mjs:66-71` —
  the duplicated `which`-probe; blind rederivation found the
  `session-context.mjs` copy hardcodes `"which"` with no `win32` branch at
  all (worse than the originally-reported ambiguity — every tool reads
  absent on Windows unconditionally, not just when `which` itself is
  missing).
- `scripts/lib/core.mjs:336-346` — `cacheKey()`'s existing hash inputs;
  `lang.format`/`lang.projectScoped` both absent from the digest despite
  affecting output (`filterAttributed` in `quality-gate.mjs` branches on
  `projectScoped`).

## Risk & rollback
All six units are additive, config-tunable-with-a-behavior-preserving-default,
or a targeted fix to a demonstrated defect:
- Unit 1's dirty-gate (1.3) defaults to the *current* always-scan behavior
  whenever the git check itself errors (fail-safe), and only ever *removes*
  scans on a provably clean tree — never widens what's already scanned. The
  budget (1.4) only ever shortens a command's own timeout or skips a command
  entirely when time is already exhausted; a budget-skipped command is
  logged, never silently dropped, and never a new hard-block source. Revert:
  restore unconditional scanning / per-command-only timeouts.
- Unit 2's `--others --cached --exclude-standard` flag addition is strictly
  additive to what `gitTrackedFiles()` returns (a superset of the prior
  tracked-only list) — no existing marker/tool detection that worked before
  can now fail; only previously-invisible untracked markers become visible.
  `cacheKey`'s two new hash inputs can only *add* cache misses (never
  incorrectly serve a stale cache hit that was previously a miss), so the
  worst case is a redundant re-check, never a skipped one. Revert: drop the
  added flags / hash inputs.
- Unit 3 changes only how much a read-only comprehension command traces
  before falling back to name-only listing on an unusually large target —
  no `docs/` write behavior changes, and the existing "Total coverage" goal
  is preserved for the common (non-huge) case where the cap never engages.
  Revert: remove the cap language.
- Unit 4 is documentation only.

## Out of scope
- A cross-platform, `which`/`where`-independent PATH scanner (manually
  walking `process.env.PATH` entries) — real value for a true distroless
  container, but meaningful implementation complexity (executable-extension
  handling on Windows, `PATHEXT`, permission-bit checks on POSIX) for an
  edge case narrower than the two defects actually fixed in Unit 2 (the
  Windows `which`-hardcoding bug is real and common; a `which`-less
  container running this plugin interactively is rarer, since Claude Code's
  own Bash tool already needs a shell). Distinguishing the failure mode
  (2.6/2.7) is the proportionate fix for this pass; the full scanner is a
  candidate for its own plan if a `which`-less environment is actually hit.
- `cfg.timeoutMs` in `cacheKey()`'s hash (raised by blind rederivation) — a
  changed timeout doesn't itself change a file's lint output, only whether a
  check *times out*; and a timed-out check is already never cached as a
  finding (it's excluded from `failures` by design, per already-merged B7).
  Including it in the hash wouldn't fix the deeper "a timeout is silently
  cached as if it were a clean pass" question, which is a separate, larger
  design question about whether timeouts should be cacheable at all — not
  one of the defects this plan addresses.
- Deduplicating `scripts/lib/core.mjs`'s `which()`/`have()` with
  `session-context.mjs`'s inline probe into one shared export — the two
  serve different call shapes (interactive per-check vs batch-probe-and-cache
  to `tooling.json`) and this exact "pre-existing duplication, no third call
  site, unrelated to this plan's tasks" judgment was already made for
  `markerPresent` in the already-merged engine-self-improvements plan. Both
  copies get the identical correctness fix (2.6/2.7) instead.
