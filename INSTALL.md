# Installing craftsman

craftsman works on any stack — Python, Go, Rust, Java, Ruby, JS/TS, C#, or a mix.
It configures itself with `/craftsman:init`, and every quality check silently
skips if its tool isn't installed, so it's safe to install before you've set
anything up.

**Requirements:** Claude Code (reasonably current — see [Troubleshooting](#troubleshooting)
if install fails) and Node (which ships with Claude Code). No other dependencies.

---

## Step 0 — remove craftsman v0.2 (only if you have it)

This plugin replaces the v0.2 starter. Running both double-fires the hooks and
both use `.craftsman/` state and the `craftsman` plugin name. Remove the old one:

```text
/plugin uninstall craftsman
/plugin marketplace remove <the-v0.2-marketplace-or-local-name>
```

Skip this step if you never installed v0.2.

---

## Step 1 — install the plugin

From GitHub (once you've published it — see [PUBLISH.md](PUBLISH.md)):

```text
/plugin marketplace add plantgreytrees/craftsman
/plugin install craftsman@craftsman-marketplace
```

Or from a local copy of this folder:

```text
/plugin marketplace add /absolute/path/to/craftsman
/plugin install craftsman@craftsman-marketplace
```

**Then restart Claude Code** — hooks are not hot-reloaded, so they won't run until
you restart.

> Tip: you can check the plugin before installing with
> `claude plugin validate /absolute/path/to/craftsman`.

**Expected result:** the plugin installs and prompts you for two config values
(Plans directory, Docs root). Accept the defaults unless your repo differs.

---

## Step 2 — fit it to your repo

```text
/craftsman:init
```

This inspects your repo and reports what it found (languages, your real test
command, package manager, CI, and which quality tools are installed). Then, with
your OK, it writes:

- **`craftsman.config.json`** at the repo root — only your repo's overrides (it
  merges over the defaults): the real test command, extra folders to ignore, and
  any repo-local lint scripts.
- **`.claude/CLAUDE.md`** — a short project intro, only if you don't already have one.
- a **`.gitignore`** entry for `.craftsman/`.

Review what it wrote before committing.

---

## Step 3 — take a baseline (once per repo)

```text
/craftsman:baseline
```

This records the lint/type issues that already exist, so from now on the gate
only flags issues **you** introduce — not the pile of pre-existing warnings in a
legacy codebase. Re-run it after any big intentional cleanup.

---

## Step 4 — install the tools you want enforced (optional)

craftsman gates only what's installed; missing tools are skipped silently. For the
languages `/craftsman:init` detected, install the matching tools to switch their
gates on:

| Stack | Install |
|---|---|
| Python | `ruff` (and `mypy` if you want type-checking) |
| JS / TS / Vue / Svelte | `eslint`, `prettier` |
| Go | `gofmt`, `staticcheck` |
| Rust | `rustfmt`, `cargo clippy` |
| Ruby | `rubocop` |
| Secrets (any stack) | `gitleaks` |

C#, Java, and C/C++ have no fast per-file linter wired (their tooling is too slow
per edit), so they're checked at the "done" build/test instead.

---

## Step 5 — verify it's working

```text
/craftsman:stats     # after some work: shows which gates actually fired
/context             # confirms the always-on footprint stays small
```

Make an edit that introduces a lint error in an installed language — you should
see craftsman flag it immediately. Try to finish with a failing test or an
unchecked plan criterion — it should hold you back.

---

## Tuning (quick reference)

Everything is in `craftsman.config.json` (your repo-root file overrides the
plugin's, deep-merged):

- **Change the test command:** `stopGate.commands` → your marker → command.
- **Run a repo guard before "done":** add it to `stopGate.extraChecks`.
- **Add a language:** a `languages.<name>` block with `extensions`, `format`, `check`.
- **Ignore / protect paths:** `ignore` and `protectedPaths`.
- **Turn it off:** `CRAFTSMAN=off` (env) or `/craftsman:toggle off`.

Full recipes are in **[EXTENDING.md](EXTENDING.md)**.

---

## Troubleshooting

**Install fails with `Invalid schema … marketplace.json … source: Invalid input`
or `Unrecognized key: "displayName"`.**
Your Claude Code is older than the marketplace file it's trying to read (these are
version-gated fields). Update Claude Code — `claude update`, or if you installed
via npm, `npm install -g @anthropic-ai/claude-code@latest` — then retry. If it's
another marketplace failing (e.g. the official one), you can also remove it:
`/plugin marketplace remove <name>`.

**Install fails with `invalid manifest … userConfig … title`.**
That's an older build of the plugin. Use this version (its `userConfig` entries
have the required `title` field). If you edited the manifest, make sure every
`userConfig` option has `type`, `title`, and `description`.

**The gate floods me with warnings on an existing codebase.**
Run `/craftsman:baseline` — it excludes everything that already existed so only new
issues surface.

**A check never seems to run.**
Its tool isn't installed. That's intentional (checks skip silently). Install the
tool (Step 4) to enable it, or leave it off.

**I want it fully off for a bit.**
`CRAFTSMAN=off` in your environment disables everything session-wide; `/craftsman:toggle`
flips it per repo.

**Hooks aren't firing at all.**
You didn't restart Claude Code after installing, or the plugin is disabled — check
`/plugin` and restart.
