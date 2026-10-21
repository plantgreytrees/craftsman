---
description: Audit, migrate, and scaffold craftsman for this repo — including older project configs and missing required structure.
argument-hint: ""
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# Init — fit or upgrade craftsman in this repo

> Init is deliberately repeatable. It audits first, then writes only the project
> config and missing scaffolding it can justify from repository evidence.

## 1. Run the deterministic audit

Run the repository-local init engine from the project root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"
```

Use `--check` for CI/readiness checks, `--diff` to preview generated changes,
`--write` to apply the normal setup, or `--update` to perform the full Craftsman
upgrade pass. `--write` and `--update` create a timestamped backup under
`.craftsman/init-backups/` before replacing an existing managed file.

Read its JSON result and report: detected markers/languages, the test command for
each marker, installed and missing quality tools, and each required item marked
present or missing. A missing tool is a finding, not a reason to invent an install
command or rewrite application dependencies.

## 2. Detect the stack

- **Languages** — the engine globs the stack markers (`package.json` and its
  framework deps, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`,
  `*.sln`, `composer.json`, `mix.exs`, `pubspec.yaml`, `CMakeLists.txt`, …).
- **Test command** — the project's REAL command, never a guess: `scripts.test`,
  a Makefile `test:` target, CI workflows; else the marker default (`pytest -q`,
  `go test ./...`, `cargo test`, `mvn test`, …).
- **Package manager** — lockfile: `package-lock.json`→npm, `pnpm-lock.yaml`→pnpm,
  `yarn.lock`→yarn.
- **Infra / repo shape** — `docker-compose*.yml`, `k8s`/`helm` dirs, CI presence,
  `.gitmodules` (monorepo/submodules).
- **Installed quality tools** — the engine probes the linters/formatters for the
  detected languages and the secrets scanner (ruff, eslint, prettier, gofmt, gitleaks, …).

## 3. Report

Print a short table: languages, real test command, package manager, CI, installed
versus missing quality tools. Flag an ambiguous command; never replace a real one with a guess.

## 4. Scaffold or upgrade

After the audit, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" --write
```

For an existing installation whose Craftsman track has changed, use:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" --update
```

`--update` refreshes every project-owned Craftsman surface init manages, reports
the plugin version, and audits all shipped commands, agents, hooks, scripts, skills,
default configuration, JavaScript syntax and JSON validity. It also walks `docs/plans/` in activity order, beginning with plans that are
`IN_PROGRESS`, `BLOCKED`, `PARKED`, or `PENDING`, then unfinished plans, then
historical plans. Canonical plan frontmatter receives the current release as
`craftsman_version`; task prose and tracker statuses are preserved. The
`architecture` section counts rules docs and unmanaged legacy docs; when its
`next` is set, report it (usually `/architect --backfill`). To pull a newer
plugin first, run `/craftsman:upgrade`.
It does not overwrite application source, custom project context, or arbitrary
files. A missing or invalid shipped asset is an internal plugin problem: it blocks
the update instead of being regenerated.

- Migrate an older full/default config to the current override shape while
  preserving unknown project keys and explicit project tuning.
- Refresh test commands from the current package scripts, Makefile, or CI evidence;
  use a marker default only when no real command is discoverable.
- Create a missing lean `.claude/CLAUDE.md`, a project-aware `.claudeignore`,
  `craftsman.config.json` (project overrides only; unknown keys are kept), and
  `.gitignore` coverage for `.craftsman/`; never replace existing user-authored
  context or ignore rules.
- Re-run the audit after writing and report any missing tools or ambiguous test
  command; never claim the repo is ready while a required item is unavailable.

## 5. Next steps

Tell the user to restart Claude Code (so hooks load), then run
`/craftsman:baseline` once. List the missing quality tools — their checks skip
silently until installed, so installing them is optional-but-recommended.

## 6. Sandbox settings (optional)

Outside-root writes and credential reads belong to the Claude Code sandbox, not craftsman. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" --settings-diff`, show it, and ask with `AskUserQuestion` whether to merge it; only on a yes run `--settings-write`. It adds `sandbox.enabled: true` and ask rules for `rm -r`/`-rf`, `sudo`, `git push --force`, `git reset --hard` and `git clean` to `.claude/settings.json`, never overwriting a key, and backs the old file up. A no, or no answer, writes nothing.
