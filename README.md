# craftsman

A Claude Code plugin that makes code better automatically — in **any language**.
It runs your formatters, linters, and type-checkers on every edit (flagging only
the issues *you* introduce), refuses to call a task "done" if it broke the tests
or left plan criteria unmet, and adds a clean plan → build → review workflow.

Drop it into a Python, Go, Rust, Java, Ruby, JS/TS, or C# repo and run
`/craftsman:init` — it detects your stack and configures itself. It's the
generalized evolution of the craftsman v0.2 starter.

---

## Quick start

```text
# 1 — install  (from GitHub once published; see PUBLISH.md)
/plugin marketplace add plantgreytrees/craftsman
/plugin install craftsman@craftsman-marketplace

# 2 — restart Claude Code so the hooks load, then in your repo:
/craftsman:init        # detect the stack, write a project config + starter CLAUDE.md
/craftsman:baseline    # snapshot existing lint issues so only NEW ones get flagged
```

That's the whole setup. Installing from a local folder instead of GitHub? Use
`/plugin marketplace add /absolute/path/to/craftsman`. Full walkthrough and
troubleshooting is in **[INSTALL.md](INSTALL.md)**.

---

## What it does

**1. A quality engine that runs itself.** Three layers, cheapest first — each only
does what the layer below can't:

| Layer | What happens | Cost |
|---|---|---|
| Deterministic | on every edit: format → lint → type-check; at "done": secrets scan + test-regression check. **Only newly-introduced issues are reported.** | ~free |
| Feedback | when a check fails, its output is fed straight back to Claude mid-turn to fix | ~free |
| Judgment | an LLM design review runs *only* where linters are blind, and only when a cheap triage says it's worth it | gated |

**2. A doc-first workflow:** **UNDERSTAND → PLAN → ORCHESTRATE → SCRUTINISE → SYNC-DOCS.**
Planners write a short plan doc; `/orchestrate` implements it; `/scrutinise`
reviews the result; `/sync-docs` keeps the docs honest. Acceptance criteria written
at plan-time are enforced before a task can finish.

**Language-agnostic by design:** every check is a config entry that **silently skips
if its tool isn't installed** — so the same plugin lints Python with `ruff`, Go with
`staticcheck`, Rust with `clippy`, and so on, wherever those tools exist. Adding a
language is a one-block config edit, never a code change.

---

## Commands

| Command | What it's for |
|---|---|
| `/craftsman:init` | detect the stack and scaffold a project config + starter `CLAUDE.md` |
| `/understand` | build a cited understanding of a feature/area before touching it |
| `/plan` | turn a request into a build-ready plan doc (the only command that writes plans) |
| `/orchestrate` | implement a plan doc across the repo |
| `/investigate` | root-cause a bug into a fix-ready plan |
| `/scrutinise` | review what was built (routed, so trivial diffs stay cheap) |
| `/sync-docs` | reconcile the docs with the code that actually shipped |
| `/fix-tests` | get a red test suite green |
| `/craftsman:baseline` | snapshot pre-existing lint issues (run once per repo) |
| `/craftsman:stats` | see which gates actually fire — delete the ones that don't earn their keep |
| `/craftsman:toggle` | turn the gates on/off for this repo |

---

## Configure it for your stack

`/craftsman:init` writes a starter `craftsman.config.json` in your repo root; edit
it any time. It **deep-merges over the plugin's defaults**, so you only write what
you're changing. Common tweaks (full guide in **[EXTENDING.md](EXTENDING.md)**):

```jsonc
{
  "stopGate": {
    "commands": { "package.json": "pnpm test" },   // your real test command
    "extraChecks": ["make lint"]                    // repo guards run before "done"
  },
  "languages": {
    "elixir": { "extensions": [".ex"], "format": ["mix format {file}"], "check": ["mix credo {file}"] }
  }
}
```

Turn everything off with `CRAFTSMAN=off` (env) or `/craftsman:toggle off`.

---

## Good to know

- **Doc-write authority** — only `/plan`, `/orchestrate`, and `/sync-docs` can edit
  files under `docs/`; every other command produces analysis and hands off to
  `/plan`. Enforced deterministically, per session.
- **Safe with concurrent sessions** — each session's state (test baseline, plan
  criteria, doc authority) is isolated under `.craftsman/sessions/<id>/`; one
  session finishing never blocks another. Separate git worktrees are isolated too.
- **Fast** — session start never blocks on a build (the baseline runs in the
  background); tool detection is cached; lint results are content-hash cached.

---

## Layout

```text
.claude-plugin/{plugin.json, marketplace.json}   plugin + marketplace manifests
craftsman.config.json                            default tunables (a project can override)
hooks/hooks.json                                 SessionStart / PreToolUse / PostToolUse / Stop
scripts/                                         the Node engine (no dependencies)
commands/                                        the workflow + engine commands
agents/                                          the specialist review/implement agents
skills/language-aware-planning/                  per-language idiom checklists + plan template
output-styles/craftsman-terse.md                 an optional terse response style
```

---

## Docs

- **[INSTALL.md](INSTALL.md)** — step-by-step install + troubleshooting
- **[EXTENDING.md](EXTENDING.md)** — add languages, checks, or project skill packs
- **[PUBLISH.md](PUBLISH.md)** — put this repo on GitHub
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — how to contribute
- **[CHANGELOG.md](CHANGELOG.md)** — version history

## Upgrading from craftsman v0.2

This **replaces** the v0.2 starter (it includes that engine plus the full
workflow). Don't run both — they share `.craftsman/` state and the `craftsman`
plugin name. Uninstall v0.2 first (see [INSTALL.md](INSTALL.md), step 0).

## Contributing

Issues and PRs welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)**. The plugin is
dependency-free; `claude plugin validate .` and `node --check scripts/*.mjs` are
essentially the whole test suite. Keep it stack-agnostic — project-specific
behaviour belongs in a project's own `.claude/`, not in the plugin.

## License

[MIT](LICENSE) © 2026 Kieran. Requires Node (ships with Claude Code); no other
dependencies.
