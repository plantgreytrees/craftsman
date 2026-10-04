---
description: Audit, migrate, and scaffold craftsman for this repo — including older project configs and missing required structure.
argument-hint: ""
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
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

- **Languages** — glob for markers: `package.json` (and which of react/vue/svelte/
  next/nuxt/angular is in its deps), `pyproject.toml`/`requirements.txt`/`setup.py`,
  `go.mod`, `Cargo.toml`, `pom.xml`/`build.gradle(.kts)`, `Gemfile`, `*.sln`/`*.csproj`,
  `composer.json`, `mix.exs`, `pubspec.yaml`, `CMakeLists.txt`.
- **Test command** — read the project's REAL command, don't guess: `package.json`
  → `scripts.test`; `Makefile` → a `test:` target; CI workflows (`.github/workflows`,
  `.gitlab-ci.yml`); else the marker default (`pytest -q`, `go test ./...`,
  `cargo test`, `mvn test`, `gradle test`, `dotnet test`, `bundle exec rake`, …).
- **Package manager** — lockfile: `package-lock.json`→npm, `pnpm-lock.yaml`→pnpm,
  `yarn.lock`→yarn.
- **Infra / repo shape** — `docker-compose*.yml`, `k8s`/`helm` dirs, CI presence,
  `.gitmodules` (monorepo/submodules).
- **Installed quality tools** — the engine probes the linters/formatters for the
  detected languages and the secrets scanner (for example ruff, eslint, prettier,
  gofmt, staticcheck, clippy, rubocop, and gitleaks).

## 3. Report

Print a short table: languages, real test command, package manager, CI, and
installed versus missing quality tools. Flag an ambiguous command; do not silently
replace a real project command with a guessed one.

## 4. Scaffold or upgrade

After the audit, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" --write
```

For an existing installation whose Craftsman track has changed, use:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" --update
```

`--update` refreshes every project-owned Craftsman surface that init manages,
then reports the plugin version and audits all shipped commands, agents, hooks,
scripts, skills, default configuration, JavaScript syntax, and JSON validity. It
also walks `docs/plans/` in activity order, beginning with plans that are
`IN_PROGRESS`, `BLOCKED`, `PARKED`, or `PENDING`, then unfinished plans, then
historical plans. Canonical plan frontmatter receives the current release as
`craftsman_version`; task prose and tracker statuses are preserved. The
`architecture` section counts rules docs and unmanaged legacy docs; when its
`next` is set, report it (usually `/architect --backfill`). To pull a newer
plugin first, run `/craftsman:upgrade`.
It does not overwrite application source, custom project context, or arbitrary
files. A missing or invalid shipped asset is reported as an internal plugin
problem and prevents the update rather than being silently regenerated.

- Migrate an older full/default config to the current override shape while
  preserving unknown project keys and explicit project tuning.
- Refresh test commands from the current package scripts, Makefile, or CI evidence;
  use a marker default only when no real command is discoverable.
- Create missing `.claude/CLAUDE.md`, a comprehensive project-aware `.claudeignore`,
  `craftsman.config.json`, and `.gitignore` coverage for `.craftsman/`; never
  replace existing user-authored context or ignore rules.
- Run the audit again after writing and report any remaining missing tools or
  ambiguous test command. Do not claim the repository is fully ready when a
  required item remains unavailable.

The engine writes only project overrides in `craftsman.config.json`, preserves
unknown custom keys, creates a lean `.claude/CLAUDE.md` only when absent, manages
the stack-specific block in `.claudeignore`, and adds `.craftsman/` to `.gitignore`
without duplicating the entry.

## 5. Next steps

Tell the user to restart Claude Code (so hooks load), then run
`/craftsman:baseline` once. List the missing quality tools — their checks skip
silently until installed, so installing them is optional-but-recommended.
