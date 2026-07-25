# Contributing to craftsman

Thanks for helping improve craftsman. It's a Claude Code plugin: a stack-agnostic
doc-first command loop on top of a deterministic quality engine. No build step, no
npm dependencies — just Node (which Claude Code already ships).

## Repo layout

See [README.md](README.md#layout). In short: `scripts/` is the Node engine,
`commands/` and `agents/` are the loop, `skills/language-aware-planning/` holds the
per-language idiom references, and `craftsman.config.json` is the default tunables
(a project can override any of it by deep-merging its own root `craftsman.config.json`).

## How it works (the one idea)

Three layers, ordered by reliability-per-token: (1) deterministic format/lint/type
checks on every edit — **regression-only** (see `scripts/baseline.mjs`) and content-
hash cached; (2) `exit 2` turns a check's output into mid-turn model feedback; (3)
LLM review only where linters are structurally blind, gated by a cheap router.
Everything is config-driven and **any check silently skips when its tool is absent**,
which is what makes the plugin language-agnostic.

## Making changes

- **Add or change a language/check:** edit `craftsman.config.json` `languages` (or
  document a project override). See [EXTENDING.md](EXTENDING.md).
- **Engine changes** (`scripts/*.mjs`): keep it dependency-free and Node-only. All
  per-session state lives under `.craftsman/sessions/<id>/` — preserve the session
  scoping so concurrent sessions stay isolated.
- **Commands/agents:** keep descriptions to one routing sentence (they're always-on
  context) and keep bodies lean. Don't reintroduce stack-specific assumptions.

## Testing before a PR

```bash
# every script must parse
for f in scripts/*.mjs scripts/lib/*.mjs; do node --check "$f" || echo "FAIL $f"; done
# all JSON must be valid
for j in .claude-plugin/plugin.json .claude-plugin/marketplace.json hooks/hooks.json craftsman.config.json; do
  node -e "JSON.parse(require('fs').readFileSync('$j','utf8'))" || echo "FAIL $j"
done
# optional: validate the plugin manifest with the Claude Code CLI
claude plugin validate .
```

A quick manual smoke test (guards + session scoping) lives in the PR template notes.
Please run `claude plugin validate .` and confirm it passes before opening a PR.

## Guidelines

- Keep it stack-agnostic. Anything project-specific belongs in a *project's* own
  `.claude/`, not in this plugin (that's what EXTENDING.md is for).
- Small, focused PRs. Describe what changed and why; note any new config keys.
- By contributing you agree your contributions are licensed under the project's
  [MIT License](LICENSE).
