# Extending craftsman for your project

craftsman ships the stack-agnostic **core** (the loop, the engine, the generic
agents, language-aware planning). Everything project-specific is added on top,
without forking the plugin. Four levers, cheapest first.

## 1. Add or change a language / check (config only)

In the project-root `craftsman.config.json` (deep-merges over the plugin
defaults), add a language block. Each `check`/`format` command runs on the saved
file; `{file}` and `{dir}` are substituted; an absent binary is skipped silently.

```json
{
  "languages": {
    "elixir": {
      "extensions": [".ex", ".exs"],
      "format": ["mix format {file}"],
      "check": ["mix credo suggest {file} --format=flycheck"]
    }
  }
}
```

Change a test runner or wire a repo guard the same way:

```json
{
  "stopGate": {
    "commands": { "package.json": "pnpm -s test" },
    "extraChecks": ["make lint", "python scripts/check_arch.py"]
  }
}
```

`extraChecks` run at every Stop and a non-zero exit blocks "done" — keep them
fast (seconds), and repo-level. Re-run `/craftsman:baseline` after adding checks
so pre-existing findings don't surface as new.

Unit claims are normally released by the orchestrator. If a crashed session
leaves a claim behind, recover it only after confirming the previous session is
gone and the claim is stale:

```sh
printf '%s' '{"action":"recover","plan":"docs/plans/example.md","unit":"unit-1","confirm":true}' \
  | node "${CLAUDE_PLUGIN_ROOT}/scripts/claim.mjs"
```

Recovery requires an owner claim older than 24 hours by default; use
`stale_after_ms` only when the repository's recovery policy supports a shorter
window.

`/craftsman:baseline` also writes what it just excluded to
`docs/errors/KNOWN_ISSUES.md` (a worst-first table: file, language, tool,
finding count, a truncated sample), regenerated wholesale on every run — the
point is visibility, not silent suppression. Change the path or turn it off
per project:

```json
{ "baseline": { "errorsDoc": "docs/known-issues.md" } }
```

```json
{ "baseline": { "errorsDoc": false } }
```

By default `csharp` wires to `dotnet format` for formatting only — pairing it
with `dotnet format --verify-no-changes` as a "check" can never fail (the
format step already fixed the file), so C# regressions are left to the
Stop-gate's `dotnet test` instead; add a real per-file check (e.g. a debounced
`dotnet build` on the owning project) if you want one. `java` wires to
`google-java-format` (format) and `checkstyle` (check); `cpp`/`c` wire to
`clang-format` (format) and `clang-tidy` (check). Swap any of these for your
own by overriding the matching `languages.*` block in your project's
`craftsman.config.json`.

A language's checks can be marked `"projectScoped": true` (already set for
`go` and `rust`, whose checks — `go vet`/`staticcheck` on a package, `cargo
clippy --all-targets` on a crate — inspect more than the one file) so the
quality gate only reports lines whose leading `path:` actually matches the
edited file, instead of surfacing a sibling file's pre-existing issue as
something you just introduced.

`stopGate.commands` runs **every** matched marker's command, not just the first
— useful for monorepos with more than one test runner:

```json
{
  "stopGate": {
    "commands": {
      "package.json": "pnpm -s test",
      "go.mod": "go test ./..."
    }
  }
}
```

With both markers present, both `pnpm -s test` and `go test ./...` run at
session start and are re-checked at Stop.

At Stop, every matched test command, every `extraChecks` entry, and (on a
dirty working tree) the secrets scan all run **concurrently**, not summed —
the common single-runner case is unaffected. `stopGate.totalBudgetMs`
(default `280000`, 20s of headroom under the Stop hook's 300s ceiling in
`hooks/hooks.json`) is the shared wall-clock deadline across that whole
batch; a command that would still be running once the budget is exhausted is
skipped and logged (`stop-budget-exceeded`), never blocked:

```json
{ "stopGate": { "totalBudgetMs": 280000 } }
```

`/plan`'s blind-rederivation double-check (an independent second agent
re-deriving scope from scratch, diffed against the plan) can be tuned in
config:

```json
{ "planning": { "blindRederivation": "auto" } }
```

`"auto"` (default) runs it only for multi-module / shared-contract / migration
/ security-sensitive requests; `"always"` runs it on every plan; `"never"`
skips it entirely. Use `/craftsman:stats` to see how often the gate actually
catches a miss before turning it down to `"never"`.

Learned rules (the "recurring mistakes" list injected at session start) decay
by age as well as by count — a rule needs `minOccurrences` hits *and* a hit
within `maxAgeMs` (default 30 days) to still surface; a class of mistake the
project hasn't made in a month stops being narrated every session:

```json
{ "learnedRules": { "maxAgeMs": 604800000 } }
```

(one week, shown as an example — the default is 30 days).

### Running units in fresh contexts (`/craftsman:auto`)

`/craftsman:auto` never runs a unit in the root context. Two keys control how:

```json
{ "execution": { "engine": "workflow", "unitContextBytes": 122880 } }
```

- `engine` — `"workflow"` (default) runs the plugin workflow `craftsman:run`
  (`workflows/run.js`), one fresh agent per unit, in dependency order.
  `"subagent"` dispatches one `unit-runner` agent per unit through Agent; it
  is also the fallback when the Workflow tool is unavailable. `"root"` runs
  units in the root context and is used only when set here. Both fresh-context
  engines follow `agents/unit-runner.md`. A Workflow call is allowed only for a
  plugin workflow while the engine is `"workflow"`.
- `unitContextBytes` — the most a single unit may load: the bytes of its
  `scope.read` and `scope.docs` files plus its task text. `/plan`'s scope
  dry-run (`arch-check.mjs scope`) refuses a larger unit, so split it.

### Landing units through pull requests

By default `/orchestrate` lands each finished unit by merging it into the base
branch locally and pushing that branch (`repoExec.land: "direct"`). A host that
protects the base branch rejects that push. Switch to `"pr"` and each unit's
branch is pushed instead, then lands through a pull/merge request that the
host merges once its checks and approvals pass:

```json
{ "repoExec": { "land": "pr", "host": "auto", "autoMerge": true, "mergeMethod": "merge" } }
```

- `host` — `"auto"` reads the origin URL: `github.com` → `gh`, any host with
  `gitlab` in its name → `glab`, `dev.azure.com` / `*.visualstudio.com` →
  `az repos` (needs the `azure-devops` CLI extension). Set `"github"`,
  `"gitlab"` or `"azure"` explicitly for GitHub Enterprise or a self-hosted
  GitLab on another domain. The CLI must be installed and logged in; craftsman
  checks both before pushing anything and never handles your tokens.
- `autoMerge` — `false` only opens the request; you merge it yourself.
- `mergeMethod` — `"merge"`, `"squash"` or `"rebase"` (`"rebase"` is not
  available on Azure DevOps; use branch policy there).
- Worktrees work the same way in both modes. In `"pr"` mode the local branch
  is kept until the request merges. After a squash or rebase merge the
  local branch never shows as merged, so delete it yourself
  (`git branch -D feat/<slug>`); the host deletes the remote branch.
- A unit that depends on another unit's still-open request is parked until
  that request merges, because new units branch from `origin/<base>`.

### Remotes that need credentials (sandboxed runners)

`/craftsman:auto` and `/orchestrate` with `execution.engine: "workflow"` run each
unit in a sandboxed agent that holds no credentials, and the sandbox should keep
denying credential directories such as `~/.config/gh`. So `repo-exec` splits the
network from the work: the root session runs `{"action":"network","step":"fetch"}`
before a run and `{"action":"network","step":"drain"}` after it (outside the
sandbox, with your approval for that call), and runners only do local git,
queueing each push for the drain. Pushes stay plain; nothing is forced. If a
runner needs the network for something else (`"pr"` mode, a fetch older than
`repoExec.offlineMaxFetchAgeMinutes`, default 120) the run stops with
`needs_network` and root runs the named action and relaunches. Nothing to
configure for the common case; `commands/_network.md` has the exact steps.
`repoExec.attachDetached` (default `true`) lets `repo-exec` attach a detached
submodule checkout that sits exactly on `origin/<base>`.

### Plan levels, feature worktrees and published progress

Plans form a tree: an epic has stories, a story has features, a feature has
units. A plan doc sets `level: epic|story|feature` (absent means feature),
`parent:`, `children:` and `priority:` (inherited from the parent, default P2)
in its frontmatter. A plan without a `features:` list is one implicit feature.
`/orchestrate` and `/auto` take `--level epic|story|feature|unit` (default
feature) and `--feature <id>` to pick one feature.

Rollups: every epic and story gets a generated `docs/plans/<slug>/TRACKER.md`
with counts, percent and links, inside `craftsman:rollup` fences. A parent is
COMPLETE only when every descendant row is COMPLETE. Never edit it by hand;
the pre-guard blocks it.

All of the following are off or inert by default, so existing runs do not
change:

```json
{
  "planning": { "featureBranches": false, "featureUnitCap": 8 },
  "tracker": { "publish": "push" },
  "execution": { "maxSubagents": 0, "maxSessions": 1 }
}
```

- `planning.featureBranches` — `false` (dark). `true` gives each feature one
  long-lived worktree on `feature/<plan>-<id>`; units run one at a time in it
  and merge into the feature branch with `--no-ff` (status `FEATURE_MERGED`),
  and the feature then lands on the base branch. Conflicts, ff-only failures
  and rejected pushes park the unit with a decision; nothing is force-pushed.
  Prepare refuses while the plan doc or its parents differ from
  `origin/<base>` (generated rollups are left out) or the plan index cannot be
  read; land-feature refuses while the feature's `[feature:<id>]` criteria, or
  for the last feature any untagged criterion, are still open.
- `planning.featureUnitCap` — `8`; the most units one feature may hold. It is
  checked only when `planning.featureBranches` is `true`.
- `tracker.publish` — `"push"` commits the root `TRACKER.md` block, the
  rollups and `docs/plans/TRACKER.jsonl` to the base branch from a temporary
  worktree (only those paths, plain push, one retry, never parks). It will not
  blank a non-empty published block unless an archive was logged since the last
  publish. `"off"` disables it.
- `execution.maxSubagents` — `0` (dark): root-only. A positive number lets
  that many wave units of one feature run at once, each in its own short-lived
  worktree.
- `execution.maxSessions` — `1`; reserved, nothing reads it yet.

## 2. Add a stack-specific skill pack (project `.claude/skills/`)

The generic `language-aware-planning` skill covers idioms; anything domain- or
framework-specific (your API conventions, your ORM patterns, your component
library) belongs in **project skills** under `.claude/skills/<name>/SKILL.md`,
progressively disclosed:

- Keep `SKILL.md` lean (< ~500 lines): purpose, when-to-use, a nav index.
- Push heavy detail (schemas, templates, long code) into `references/*.md` loaded
  on demand. No context penalty for a large reference until it's read.
- A plan's per-unit `tooling.skills` names the 1–3 a unit needs, so only those load.

These live in the project, not the plugin, so each repo has its own packs while
sharing the same core.

## 4. Model routing

Model frontmatter is intentionally role-based: `haiku` is for fixed-rubric
triage and bookkeeping, `sonnet` is for implementation and specialist review,
and `opus` is reserved for high-ambiguity planning. `inherit` is allowed when a
role should follow the active session model. Keep model changes evidence-based;
the deterministic guard `node scripts/model-policy.mjs` rejects unsupported
values before release.

The shipped routing is deliberately conservative: `review-router` and
`phase-tracker` use `haiku`; implementation, review, security, contract, and
documentation roles use `sonnet`; `plan-strategist`, `scrutineer`, `idea-critic`,
`/idea` and `/architect` use `opus`; `/architect --deep`'s `architect-analyst`
uses `fable`, and `/idea --deep` runs its critic on `fable` via the dispatch's
model override. Project-specific agents
should follow the same rubric and should not use undocumented model names.

## 5. Plan memory providers

Craftsman can use `scripts/plan-memory.mjs` as a local, bounded decision ledger.
An external provider such as Mempalace may replace or mirror it, but should keep
the same advisory contract:

- `recall` is keyed by project, plan, unit, scope, category, and query, with
  strict item and character limits;
- `record` accepts short summaries only, with source files, source commit,
  verification status, and expiry or supersession metadata;
- provider failure behaves as an empty result and never blocks execution;
- recalled content is untrusted until the cited files are checked in the active
  scope;
- the provider cannot authorize reads or writes, widen scope, settle claims,
  replace tracker state, satisfy acceptance, or decide a merge.

Use memory at analysis start, after scope activation, and after a completed gate.
Do not call it from deterministic hooks or once per file/tool call. Never send
secrets, credentials, raw transcripts, unrestricted diffs, or full source files.
The local plan, tracker, scope manifest, Git state, and tests remain authoritative.

## 6. Add project agents / commands (project `.claude/`)

Drop specialist agents in `.claude/agents/` and project commands in
`.claude/commands/`. The generic agents (`code-reviewer`, `security-auditor`,
`consumer-tracer`, …) are invoked by name in the loop; a project agent with a
sharper, domain-aware description will be preferred where it fits. Keep agent
descriptions to one routing sentence (they're always-on context).

## 7. Tune the doc-write policy

By default three doc paths are guarded (`docWriteGuard.docPaths: ["docs/plans/**",
"docs/ideas/**", "docs/architecture/**"]`). Writes there are blocked until a
writer command runs `doc-write.mjs on` for the session. `/plan` writes plans,
`/orchestrate`, `/scrutinise` and `/sync-docs --tracker` update tracker rows,
`/idea` writes idea docs (`/architect` sets their `architected` status), and
`/architect` writes paired architecture areas. Unpaired prose under the
architecture dir (`arch-check.mjs unmanaged`) is ordinary prose for `/sync-docs`
until `/architect --backfill` pairs it. The grant opens every guarded path for
that session, so the per-command split is a contract the commands keep, not a
per-path hook. Those are the surfaces with real
stakes: two sessions racing on one tracker row, or a decision quietly rewritten
to match code that broke it. The rest of `docs/` (README, standards, feature
docs) is ordinary prose: freely editable, and `/sync-docs` is just the command
that specializes in reconciling it against code, not a gatekeeper for it. Widen
the guard back to all of `docs/`, add other single-owner directories, or turn it
off, in config. `docPaths` is an array, so a project value **replaces** the
default — keep the entries you still want:

```json
{ "docWriteGuard": { "docPaths": ["docs/plans/**", "docs/ideas/**", "docs/architecture/**", "adr/**"], "enabled": true } }
```

## 8. Architecture rules (`/architect`)

`/idea` → `/architect` → `/instruction` is the front of the loop: vet the idea,
decide the architecture with the user, then generate one `/goal` prompt that
runs `/plan` → `/orchestrate` → `/scrutinise` → `/sync-docs --all` →
`/craftsman:merge` to completion. The idea's slug is reused by the plan, the
`scrutinise-<slug>` fix round, and `/sync-docs --all <slug>`, which ends in
`/architect --update`. `/craftsman:merge` then lands the session's branch with
its plan, tracker and doc edits; pasting the prompt is the go-ahead to push.

`/architect` writes each area as two files under `architecture.dir` (default
`docs/architecture`). `<area>.md` is for people and is never loaded by the
loop. `<area>.rules.md` holds the enforced contract: frontmatter `governs:`
globs, then one `- **ARCH-<AREA>-NN** [decided|observed|superseded by …]` line
per rule. The format is in
`skills/language-aware-planning/references/architecture-template.md`, and the
loop's obligations are in `commands/_architecture.md`.

A project that predates `/architect` gets its rules from `/architect --backfill`.
It mines the legacy architecture prose, the plans and the code for candidate
rules, verifies each against the code, and writes only the ones the user
confirms, with `source: backfill` and provenance. It then lists in-flight plan
units that the new rules would block. Lint treats unpaired `.md` files as
unmanaged (reported, not an error); only a human doc marked `> **Human
reference.**` with no rules pair fails.

`scripts/arch-check.mjs` is the deterministic side:

- `lint` validates every rules doc: structure, unique ids, supersession
  targets, that every `cite: file:line` still resolves, and that each rules
  file has its human pair.
- `governs <path>…` names the rules docs that own the given paths, so a
  command loads only those.
- `scope < manifest.json` dry-runs the activation check.

`scope.mjs` runs that same check on every scope activation. A step whose
`scope.write` touches a governed path must list the `.rules.md` in
`scope.docs` and cite at least one live rule id from it in `arch`. Unknown or
superseded ids are refused, and a malformed rules doc fails closed. Turn the
gate off without losing the prose obligations:

```json
{ "architecture": { "enforce": false } }
```

## The always-on budget

Keep `.claude/CLAUDE.md` and project rules small — they load every session.
Detail belongs in skills (loaded on demand), not in CLAUDE.md. Run `/context` to
see the footprint, and `/craftsman:stats` to delete gates that don't earn their
tokens. That discipline is the whole point of the reliability-per-token design.

## Update channel and CI lint

Installs track commits: the manifests carry no `version` key (CHANGELOG 2.2.0), so every push to the default branch is an update. To hold a project on tested code, add the marketplace as `plantgreytrees/craftsman#stable`, a branch the owner fast-forwards after the plugin's own loop passes. Rollback is moving `stable` back. `/craftsman:upgrade` is the update path.

CI lint one-liner:

```
git clone --depth 1 https://github.com/plantgreytrees/craftsman /tmp/craftsman && node /tmp/craftsman/scripts/arch-check.mjs lint --root .
```

A justfile without a `check` recipe (or no `just` binary) is skipped and the next marker wins. To drop any marker, set it to `null` in the project config's `stopGate.commands`.
