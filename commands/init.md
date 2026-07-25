---
description: Fingerprint this repo's stack and tooling, then scaffold craftsman for it — a project craftsman.config.json (real test command + tuning) and a starter .claude/CLAUDE.md. Run once when adding craftsman to a new project.
argument-hint: ""
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Init — fit craftsman to this repo

> This command writes a project `craftsman.config.json` and (if absent) a starter
> `.claude/CLAUDE.md` — neither is under `docs/`, so no doc-write grant is needed.
> Change nothing you can't justify from evidence in the repo.

## 1. Detect the stack

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
- **Installed quality tools** — `which` the linters/formatters the detected
  languages use (ruff, eslint, prettier, gofmt, staticcheck, clippy, rubocop,
  gitleaks, …).

## 2. Report

Print a short table: languages · real test command · package manager · CI ·
installed vs missing quality tools. Flag anything ambiguous and ask before
scaffolding it.

## 3. Scaffold

- **Project `craftsman.config.json` at the repo root** — it **deep-merges over the
  plugin defaults**, so include ONLY this repo's overrides, never a restatement of
  the defaults: the real `stopGate.commands` entry for the detected marker; any
  extra `ignore`/`protectedPaths` for this repo's generated dirs; and
  `stopGate.extraChecks` for any repo-local lint/guard scripts you found (e.g. a
  `scripts/lint` or a `make lint`). If the defaults already fit, write `{}` and say so.
- **Starter `.claude/CLAUDE.md`** (only if absent) — a lean project entry (< ~30
  lines, it's always-on context): one line on what the project is, the detected
  stack, the loop **UNDERSTAND → PLAN → EXECUTE → SCRUTINISE → SYNC-DOCS**, where
  plans live (`docs/plans/`), and that commands/agents/skills come from the
  craftsman plugin. Do not restate craftsman internals.
- Add `.craftsman/` to `.gitignore`.

## 4. Next steps

Tell the user to restart Claude Code (so hooks load), then run
`/craftsman:baseline` once. List the missing quality tools — their checks skip
silently until installed, so installing them is optional-but-recommended.
