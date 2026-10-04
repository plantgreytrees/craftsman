# craftsman

**v2.1.0** — see [CHANGELOG.md](CHANGELOG.md) for what changed.

A Claude Code plugin that makes code better automatically — in **any language**.
It runs your formatters, linters, and type-checkers on every edit (flagging only
the issues *you* introduce), refuses to call a task "done" if it broke the tests
or left plan criteria unmet, and adds a clean plan → build → review workflow.

Drop it into a Python, Go, Rust, Java, Ruby, JS/TS, C#, Swift, Kotlin, PHP,
C++, Terraform, or Kubernetes repo and run `/craftsman:init` — it detects your
stack and configures itself. It's the generalized evolution of the craftsman
v0.2 starter.

---

## Quick start

```text
# 1 — install  (from GitHub once published; see PUBLISH.md)
/plugin marketplace add plantgreytrees/craftsman
/plugin install craftsman@craftsman-marketplace

# 2 — restart Claude Code so the hooks load, then in your repo:
/craftsman:init        # audit, upgrade older setup, and repair required structure
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
| Deterministic | on every edit: format → lint → type-check; at "done": secrets scan + test-regression check (skipped when nothing changed since the last check). **Only newly-introduced issues are reported.** | ~free |
| Feedback | when a check fails, its output is fed straight back to Claude mid-turn to fix | ~free |
| Judgment | LLM review — correctness, security, house-style conformance, plan soundness — runs *only* where linters are structurally blind, and only when a cheap router says a given diff is worth it | gated |

**2. A doc-first workflow:** **UNDERSTAND → PLAN → EXECUTE → SCRUTINISE → SYNC-DOCS.**
Planners write a short plan doc; `/orchestrate` executes it, reading each unit's
actual diff through `gate-select.mjs` to deterministically route it to the
specialists that apply — `ui-ux-reviewer`, `migration-reviewer`, `api-reviewer`,
`dependency-auditor`, `performance-reviewer`, `observability-reviewer` — instead
of trusting a file-pattern rule to be remembered correctly; `/scrutinise`
reviews the result; `/sync-docs` keeps the docs honest. Acceptance criteria written
at plan-time are enforced before a task can finish. `/craftsman:digest` reads the
same tracker state at any point for a done/decisions/next/%-complete summary.

**Language-agnostic by design:** every check is a config entry that **silently skips
if its tool isn't installed** — so the same plugin lints Python with `ruff`, Go with
`staticcheck`, Rust with `clippy`, and so on, wherever those tools exist. Adding a
language is a one-block config edit, never a code change.

**3. Pre-existing issues don't just vanish.** The gate only ever reports issues
*you* introduce — but `/craftsman:baseline` also writes what it skipped to
`docs/errors/KNOWN_ISSUES.md` (worst file first, regenerated on every run), so
a legacy repo's debt stays visible and addressable instead of living only in a
gitignored local snapshot.

---

## Commands

| Command | What it's for |
|---|---|
| `/craftsman:init` | audit or upgrade the setup, detect the stack, and repair required project structure |
| `/craftsman:workspace-init` | explicitly register selected existing Git projects without scanning the workspace |
| `/understand` | build a cited understanding of a feature/area before touching it |
| `/plan` | turn a request into a build-ready plan doc (the only command that writes plans) |
| `/orchestrate` | implement a plan doc across the repo (per-unit review is routed too, same reasoning as `/scrutinise`) |
| `/investigate` | root-cause a bug into a fix-ready plan |
| `/scrutinise` | review what was built (routed, so trivial diffs stay cheap) |
| `/sync-docs` | reconcile the docs with the code that actually shipped |
| `/fix-tests` | get a red test suite green |
| `/craftsman:digest` | ADHD-friendly progress digest: done, decisions needed, next, % complete per plan |
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

- **Doc-write authority** — only `/plan` and `/orchestrate` can edit plan docs and
  the tracker (`docs/plans/**` by default — the surface with real concurrency
  stakes); every other command produces analysis and hands off to `/plan`. The
  rest of `docs/` is ordinary prose, freely editable; widen the guard back to
  all of `docs/` in config if you want the stricter default. Enforced
  deterministically, per session.
- **Safe with concurrent sessions** — each session's state (test baseline, plan
  criteria, doc authority) is isolated under `.craftsman/sessions/<id>/`; one
  session finishing never blocks another. Each execution unit must activate a
  separate Git worktree with `worktree_path`; mutating Git commands from another
  checkout are blocked until the binding is released for the locked merge. A
  claim left behind by a crashed session can only be recovered once it's
  confirmed stale (24h+ by default) — see [EXTENDING.md](EXTENDING.md).
- **Structured tracker state** — the readable [tracker](docs/plans/TRACKER.md)
  stays concise and link-first, while `scripts/tracker.mjs` records validated
  unit identities, legal status transitions, and terse evidence in the local
  `.craftsman/tracker/events.jsonl` ledger. Claims write `IN_PROGRESS` there
  automatically. Both the ledger and `TRACKER.md` live in the **main checkout**
  even when a session works in a worktree, so every parallel session sees one
  tracker. Each transition re-renders the file's generated ledger block, and
  the `tracker-sync` hook does the same at SessionStart, after edits and at
  Stop. `pre-guard` blocks writes to a worktree's copy and hand edits of the
  block.
- **Fast** — session start never blocks on a build (the baseline runs in the
  background); tool detection is scoped to your detected stack and cached;
  lint results are content-hash cached; the Stop-gate's test-regression check
  only re-runs when something was actually edited since the last check, so an
  answer-only turn doesn't re-run the suite for nothing. At Stop, every test
  command, `extraChecks` entry, and secrets scan run concurrently against one
  shared wall-clock budget (`stopGate.totalBudgetMs`) rather than summed —
  see [EXTENDING.md](EXTENDING.md).
- **Secrets are a hard block, never silently skipped** — a scan that gets cut
  off (budget or its own timeout) fails the Stop gate with a clear message
  instead of passing quietly; a clean working tree still gets scanned at least
  once per session, and gitignored `.env` files are checked too, not just
  tracked changes. If the configured scanner (`gitleaks` by default) isn't on
  `PATH`, the gate falls back to a dependency-free built-in scanner instead of
  just blocking on a missing tool (opt out with `security.builtinFallback: false`).
- **Root-only by default, mechanically enforced** — `/orchestrate` and the
  planners do the work themselves, sequentially, instead of fanning out
  subagents; `execution.agentMode` (default `root-only`) is enforced by a
  `PreToolUse` hook that hard-blocks `Task` calls, not just a convention.
  There are two standing exceptions: `/plan`'s one decomposition step, and
  `/scrutinise`'s single isolated `scrutineer`, which reviews merged work in a
  fresh context that never saw the code being written (both run on `opus`;
  everything else in `/plan`, and most agents, run cheaper —
  `implementer`/`security-auditor` stay on `sonnet`). Each `/scrutinise` run
  is granted exactly one scrutineer, so a second or parallel dispatch is
  blocked. Flip
  `execution.agentMode` to `"subagents"` to restore real fan-out.
- **Context stays bounded, mechanically** — a hand-off or a unit reaching a
  terminal tracker state (merged, blocked, or parked) marks the session
  compact-required; every other tool call is blocked until a real `/compact`
  or `/clear` actually runs. Worktrees left behind after a merge, oversized
  shipped docs, and unbounded plan-memory/tracker growth are all caught the
  same way — by a hook or a CI check, not by remembering to do it.

---

## Layout

```text
.claude-plugin/{plugin.json, marketplace.json}   plugin + marketplace manifests
craftsman.config.json                            default tunables (a project can override)
hooks/hooks.json                                 SessionStart / PreToolUse / PostToolUse / Stop
scripts/                                         the Node engine (no dependencies)
commands/                                        the workflow + engine commands
agents/                                          the specialist review/implement agents
skills/language-aware-planning/                  19 per-language idiom checklists + plan template
skills/design-review/                            the UI/UX review checklist ui-ux-reviewer loads
skills/deep-research/                            forked read-only repo research (/deep-research)
output-styles/craftsman-terse.md                 an optional terse response style
.github/workflows/ci.yml                         syntax/test/JSON checks on every push and PR
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
dependency-free; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` (every
script's unit/subprocess suite, including claim/handoff/plan-graph/repo-exec/
scope/toggle/workspace coverage), `node --check` on every script, and
`claude plugin validate .` are the whole test suite — CI runs all of it plus a
diff-whitespace check on every push and PR. Run `claude plugin validate .` from
this directory (the repo root is one level up and has no manifest); because
`plugin.json` and `marketplace.json` share `.claude-plugin/`, the CLI validates
the marketplace manifest. Keep it stack-agnostic —
project-specific behaviour belongs in a project's own `.claude/`, not in the
plugin.

## License

[MIT](LICENSE) © 2026 Kieran. Requires Node (ships with Claude Code); no other
dependencies.
