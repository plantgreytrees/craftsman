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

## 3. Add project agents / commands (project `.claude/`)

Drop specialist agents in `.claude/agents/` and project commands in
`.claude/commands/`. The generic agents (`code-reviewer`, `security-auditor`,
`consumer-tracer`, …) are invoked by name in the loop; a project agent with a
sharper, domain-aware description will be preferred where it fits. Keep agent
descriptions to one routing sentence (they're always-on context).

## 4. Tune the doc-write policy

By default only `/plan` and `/orchestrate` may edit plan docs and the tracker
(`docWriteGuard.docPaths: ["docs/plans/**"]`) — that's the surface with real
concurrency stakes (two sessions racing on the same tracker row). The rest of
`docs/` (architecture, README, standards) is ordinary prose: freely editable,
`/sync-docs` is just the command that happens to specialize in reconciling it
against code, not a gatekeeper for it. Widen the guard back to all of `docs/`,
add other single-owner directories, or turn it off, in config:

```json
{ "docWriteGuard": { "docPaths": ["docs/plans/**", "adr/**"], "enabled": true } }
```

## The always-on budget

Keep `.claude/CLAUDE.md` and project rules small — they load every session.
Detail belongs in skills (loaded on demand), not in CLAUDE.md. Run `/context` to
see the footprint, and `/craftsman:stats` to delete gates that don't earn their
tokens. That discipline is the whole point of the reliability-per-token design.
