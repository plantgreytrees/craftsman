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

By default only `/plan`, `/orchestrate`, `/sync-docs` may edit `docs/`
(`docWriteGuard.docPaths: ["docs/**"]`). Widen or narrow the guarded paths, or
turn it off, in config:

```json
{ "docWriteGuard": { "docPaths": ["docs/**", "adr/**"], "enabled": true } }
```

## The always-on budget

Keep `.claude/CLAUDE.md` and project rules small — they load every session.
Detail belongs in skills (loaded on demand), not in CLAUDE.md. Run `/context` to
see the footprint, and `/craftsman:stats` to delete gates that don't earn their
tokens. That discipline is the whole point of the reliability-per-token design.
