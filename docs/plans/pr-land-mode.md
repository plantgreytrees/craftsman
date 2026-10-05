---
slug: pr-land-mode
goal: Finished units can land through an auto-merging PR/MR on GitHub, GitLab or Azure DevOps instead of a direct push to a protected base branch.
classification: in-scope (repo-exec owns the merge lifecycle — scripts/repo-exec.mjs:2)
tracker_rows: [pr-land-mode#land-adapter, pr-land-mode#repo-exec-land, pr-land-mode#land-docs]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      2.1, 2.3, 3.1 (merge() return gains land/pr fields; direct-mode fields unchanged)
  data:          N/A(no persistence/migration)
  config:        2.2 (repoExec.land / host / autoMerge / mergeMethod defaults)
  security:      1.3 (no shell except win32 az, with sanitised free-text args; no tokens handled — the host CLIs own auth)
  tests:         1.4, 2.3, 2.4
  observability: 2.1 (structured result: pr url/state, auto_merge, auto_merge_error, cleanup_error)
  interface:     1.2 (host CLI argv), 2.1 (repo-exec merge input/output)
  docs:          3.1, 3.2, 3.3, 3.4
  rollback:      repoExec.land defaults to "direct" — the default or a revert restores current behaviour
units:
  - id: 1
    scope_id: land-adapter
    project: craftsman
    depends_on: []
    module: scripts/lib/land.mjs
    language: javascript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/core.mjs]
      docs: [docs/plans/pr-land-mode.md]
      write: [scripts/lib/land.mjs, scripts/lib/land.test.mjs]
    arch: []
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [language-aware-planning], guards: [scope, quality-gate], mcp: [] }
  - id: 2
    scope_id: repo-exec-land
    project: craftsman
    depends_on: [land-adapter]
    module: scripts/repo-exec.mjs
    language: javascript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, scripts/lib/land.mjs, scripts/lib/core.mjs, scripts/worktree-sweep.mjs]
      docs: [docs/plans/pr-land-mode.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, craftsman.config.json]
    arch: []
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [scope, quality-gate], mcp: [] }
  - id: 3
    scope_id: land-docs
    project: craftsman
    depends_on: [repo-exec-land]
    module: docs
    language: markdown
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/land.mjs]
      docs: [docs/plans/pr-land-mode.md]
      write: [commands/_shared-execution.md, README.md, EXTENDING.md, CHANGELOG.md]
    arch: []
    tooling: { implementer: implementer, gates: [], skills: [], guards: [scope], mcp: [] }
---

# Plan: PR/MR land mode for repo-exec

## Outcome
Finished units can land through an auto-merging PR/MR on GitHub, GitLab or Azure DevOps instead of a direct push to a protected base branch; worktree isolation is unchanged.

## Contract (fixed before unit 1)

`merge()` input unchanged. Config (project deep-merged over plugin defaults):
`repoExec.land: "direct" | "pr"` (default `"direct"`), `repoExec.host: "auto" | "github" | "gitlab" | "azure"` (default `"auto"`),
`repoExec.autoMerge: true`, `repoExec.mergeMethod: "merge" | "squash" | "rebase"` (default `"merge"`).

- **direct** — today's result plus `land: "direct"`. No other change.
- **pr** — never touches the primary checkout or the base branch; takes no merge lock. Returns
  `{ ...info, branch, land: "pr", merged: false, pushed: true, pr: { host, url, id, state: "opened" | "existing" }, auto_merge: bool, auto_merge_error?, cleaned, branch_deleted: false, cleanup_error? }`.
  Order: clean-worktree check → `verifyGateBeforeMerge` → host preflight (CLI present; auth where the CLI has a status command) → `git push -u origin <branch>` → find an open PR for the branch (idempotent retry → `state:"existing"`) → else create → request auto-merge when `autoMerge` (failure is non-fatal, reported as `auto_merge_error`) → cleanup (worktree removed; branch kept because it is not in base).
- `land:"pr"` without a remote, or with an undetectable host under `host:"auto"`, throws before any push.

**Tracker rule:** a pr-landed unit goes to MERGED with evidence `pr:<url> auto_merge:<bool>`. A unit whose `depends_on` names a pr-landed unit is PARKED("awaiting PR <url>") until `git fetch` shows the PR branch is in `origin/<base>`.

## Scope Steps (executable core)

### Step 1 — land-adapter (craftsman, javascript, high)
Tooling: implementer · gates security-auditor, code-reviewer · guards scope, quality-gate
Depends on: none
- [ ] 1.1 Create `scripts/lib/land.mjs` exporting `detectHost(originUrl, override)` → `"github" | "gitlab" | "azure" | null` (github.com; any host containing `gitlab`; dev.azure.com / *.visualstudio.com / ssh.dev.azure.com; an override wins unless `"auto"`) → accept: unit test covers https + ssh forms of each and an unknown host → null.
- [ ] 1.2 In `land.mjs`, a per-host table of argv builders: `preflight`, `find`, `create`, `autoMerge`, plus a parser for each one's output to `{ url, id }`. GitHub `gh pr view/create/merge --auto`; GitLab `glab mr view -F json` / `mr create --fill --yes --remove-source-branch` / `mr merge --auto-merge --yes`; Azure `az repos pr list --status active -o json` / `pr create --auto-complete --delete-source-branch -o json` / `pr update --auto-complete true` → accept: table-driven test asserts exact argv for each host × mergeMethod.
- [ ] 1.3 `land.mjs` exports `openPullRequest({ host, cwd, branch, base, title, body, autoMerge, mergeMethod }, runner = defaultRunner)`; `defaultRunner` uses `spawnSync` with `shell:false`, except Azure on win32 (`az.cmd`), where free-text args go through an allow-list sanitiser first. A missing CLI (ENOENT) → a clear `"<cli> is not installed"` error → accept: injected-runner tests cover missing CLI, auth failure, existing PR, fresh create, non-fatal auto-merge failure; no test needs network or a real CLI.
- [ ] 1.4 Run `node --test scripts/lib/land.test.mjs` → accept: all pass.

### Step 2 — repo-exec-land (craftsman, javascript, high)
Tooling: implementer · gates security-auditor, code-reviewer · guards scope, quality-gate
Depends on: land-adapter
- [ ] 2.1 In `scripts/repo-exec.mjs`, keep the direct path (+`land:"direct"`) and add `landPullRequest()` implementing the Contract's pr order; `merge(context, input, info, deps = {})` accepts an injected `runner` for tests only (no stdin JSON field can select it) → accept: existing direct-mode tests pass unchanged.
- [ ] 2.2 Add `repoExec.land:"direct"`, `host:"auto"`, `autoMerge:true`, `mergeMethod:"merge"` to `craftsman.config.json` → accept: the file parses as JSON.
- [ ] 2.3 Add tests to `scripts/repo-exec.test.mjs`: pr mode against a local bare `origin` with an injected runner — base branch and primary checkout untouched, feature branch pushed to origin, worktree removed, branch kept, `merged:false`; no remote → throws before any push → accept: `node --test scripts/repo-exec.test.mjs` passes.
- [ ] 2.4 Run the full suite `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: no new failures.

### Step 3 — land-docs (craftsman, markdown, normal)
Depends on: repo-exec-land
- [ ] 3.1 `commands/_shared-execution.md` Phase L + X.9d/e + step 11: describe pr mode (no lock, no base mutation, `merged:false`, branch kept), the tracker evidence rule and the dependent-unit PARK rule → accept: text names `repoExec.land`, `pr.url` evidence, and the PARK rule.
- [ ] 3.2 `README.md` "Good to know": one bullet on landing via PR/MR on protected branches → accept: bullet present.
- [ ] 3.3 `EXTENDING.md`: a `repoExec` section documenting land/host/autoMerge/mergeMethod, self-hosted hosts needing `host`, and squash-merged branches surviving locally → accept: section present.
- [ ] 3.4 `CHANGELOG.md` `[Unreleased] ### Added`: one bullet (LAST task) → accept: one entry, no duplicate.

## Sequencing
Adapter (pure, injected runner) → merge() integration → docs. CLI flag differences between hosts live in one table, tested before anything calls it.

## Verification background
- Direct push of base: `scripts/repo-exec.mjs:220`.
- The lock and base checkout exist only to mutate base: `scripts/repo-exec.mjs:208-231`.
- Cleanup keeps unmerged branches: `scripts/repo-exec.mjs:258-259`.
- The next unit branches from `origin/<base>`: `scripts/repo-exec.mjs:125` (hence the PARK rule).
- Tracker transitions: `scripts/tracker.mjs:20-21` (no new status needed).
- CI runs `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` on ubuntu/macos/windows: `.github/workflows/ci.yml`.

CONSUMERS:
- `merge()` return → `scripts/repo-exec.test.mjs:62,141` (reads `merged`, `cleaned`, `branch_deleted`); `commands/_shared-execution.md:45-46,57` (prose contract). No other code reads the result — stop-gate/session-context call `worktree-sweep.mjs` directly (`scripts/stop-gate.mjs:36`, `scripts/session-context.mjs:223`).
- `repoExec` config → `scripts/repo-exec.mjs:184` only.

## Risk & rollback
- A unit is marked MERGED while its PR may still fail CI remotely — mitigated by `pr:<url>` evidence and the dependent-unit PARK rule.
- A failed cleanup in pr mode leaves an unmerged worktree the Stop sweep does not flag (`stop-gate.mjs` blocks only merged ones) — surfaced via `cleanup_error`; follow-up candidate.
- A remote squash/rebase merge leaves the local branch un-ancestored, so it survives locally — documented.
- Windows `az.cmd` needs a shell — free text is sanitised first.
- Rollback: `repoExec.land:"direct"` (the default) or revert the commits.

## Out of scope
Bitbucket and other hosts; polling for remote merge completion; a new tracker status; changing the Stop sweep.
