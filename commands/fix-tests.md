---
description: Run the test suite (scoped or full), diagnose failures via pattern triage, apply minimum root-cause fixes, and restore a green build — no vacuous passes, no silently skipped tests.
argument-hint: "[scope e.g. a package/module/service — blank for the whole suite]"
model: opus
allowed-tools: Task, Bash, Read, Edit, Glob, Grep, TodoWrite
---

# Fix Tests

Run the test suite, diagnose failures, and patch code to restore a green build. Edits code only — writes nothing under `docs/`.

**Argument:** $ARGUMENTS — optional scope (a package, module, or service). Leave blank to run the whole suite.

---

## Workflow

### 1. Run

**Detect the runner from repo markers — never assume.** Read the project's config to find the test command (e.g. `package.json` scripts + lockfile package manager, `pytest`/`tox.ini`/`pyproject.toml`, `go test`, `cargo test`, `dotnet test`, `gradle test`, a `Makefile` target). Run the whole suite when no scope is given, or filter to `$ARGUMENTS` using the runner's own scoping flag. Prefer fast unit tests first; run slower integration/e2e tiers only when the change touches them.

Capture all output; read it fully before proceeding.

### 2. Triage

| Category | Pattern | Likely cause |
|---|---|---|
| Build/compile | compiler/type error | Fix the build error first |
| Assertion | `expected X, got Y` | Production code returns the wrong value |
| Null/undefined | null/undefined/None deref | Missing mock/stub setup or a null guard |
| Not found | 404 / missing key | Arranged data missing or route wrong |
| Auth | 401 / 403 | Auth/permission setup missing in the test |
| Timeout | cancelled/timed-out task | Slow async or a missing `await` |
| External resource | DB / network / container error | Test fixture or service not started, or a bad query |

### 3. Root cause

**Triage every failure before fixing any.** Group all failures first — one shared cause commonly lights up many tests (a changed contract, a broken shared helper, a missing global fixture). Fixing the first red test and re-running blind wastes cycles and hides the shared cause; cluster them, then fix at the shared site.

Trace from the test entry point → the failure line. Read the full stack trace, the test's arrange section, and the production code at the failure line. Verify every dependency the code under test calls has a corresponding mock/stub. **Fix the root cause, not the symptom** — when several tests fail through the same production function, one guard in that shared function beats editing each test; grep its callers so the fix doesn't break a sibling. **Which side is wrong is a `docs/` question, not a guess:** if the test and the code disagree on intended behaviour, the governing contract/architecture doc decides — never weaken a test to match code the docs say is wrong. For a stubborn or multi-cause cluster, delegate `build-doctor` (triage: failing command + full output) and act on its diagnosis.

### 4. Fix

Apply the minimum fix needed:
- Production code if the logic is wrong.
- Test arrange only if the test itself is set up incorrectly.
- Never delete or skip a failing test without a `// TODO: [reason + ticket]`.
- **Regression test on every bugfix:** a root-cause fix ships a test that **fails on the old code and passes on the new** — demonstrate the pre-fix failure where practical, so the bug can't silently return.

### 5. Re-run

Re-run the same command. Confirm previously failing tests now pass and no regressions appear. If new failures surface, repeat steps 2–4. **Green is not enough — verify the green is honest:** no assertion was weakened to match wrong output, no test was skipped without a `// TODO:` + ticket, coverage of the touched code didn't drop below the gate. A suite that passes because a test stopped checking the thing that broke is still red in reality.

### 6. Report

```
## Test Fix Summary
Scope:    [scope or "all"]
Fixed:    [TestName]: [root cause] → [fix]  (+ regression test: [name])
Failing:  [TestName]: [why not fixed now]
Regressions introduced: [yes/no]
Final: Pass [N] / Fail [N] / Skipped [N]
```

---

## Pitfalls

- Don't make a test pass vacuously (e.g. flipping the expected value to match wrong output).
- Don't skip failing tests without a `// TODO:` and ticket reference.
- Run the full scoped suite after every fix — single-test fixes commonly break neighbours.

## Standards

- The testing + development-workflow standards under `docs/standards/` (if present) govern coverage gates and what counts as an honest pass.
- **Which side is wrong (test vs code) is a `docs/` question** — the governing contract/architecture doc decides; never weaken a test to match code the docs say is wrong.

## After green

If the project has a build/packaging/container step and it's currently running, rebuild the affected artifact so the running instance matches the fixed code (and its consumers too if a shared library changed). Skip silently only when nothing is running.
