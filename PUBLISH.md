# Publishing craftsman to GitHub

This folder is a complete, publish-ready open-source repo (MIT). It couldn't be
pushed from the sandbox it was built in (no access to your GitHub account there),
so publish it from your own machine — it takes about a minute.

The commands below are already set to your account — `plantgreytrees/craftsman`.
Change the repo name if you'd prefer something other than `craftsman`.

## Option A — with the GitHub CLI (`gh`)

```bash
cd craftsman                      # this folder
git init
git add -A
git commit -m "craftsman v1.0.0 — stack-agnostic Claude Code plugin"
git branch -M main
git tag v1.0.0

# creates the repo under your account and pushes in one step
gh repo create craftsman --public --source=. --remote=origin --push
git push origin v1.0.0
```

(Install gh from https://cli.github.com and run `gh auth login` first if needed.)

## Option B — plain git + the GitHub website

1. Create a new **empty** repo at https://github.com/new named `craftsman`
   (Public, no README/license/gitignore — this folder already has them).
2. Then:

```bash
cd craftsman
git init
git add -A
git commit -m "craftsman v1.0.0 — stack-agnostic Claude Code plugin"
git branch -M main
git tag v1.0.0
git remote add origin https://github.com/plantgreytrees/craftsman.git
git push -u origin main
git push origin v1.0.0
```

## After it's live — how anyone installs it

```
/plugin marketplace add plantgreytrees/craftsman
/plugin install craftsman@craftsman-marketplace
```

Then in each repo: restart Claude Code, run `/craftsman:init`, then
`/craftsman:baseline`. (See [INSTALL.md](INSTALL.md).)

## Before you push — optional

- **LICENSE** — the copyright line reads `Copyright (c) 2026 Kieran`; change the
  name if you'd prefer your full name or a different handle.

The install snippets in README.md / INSTALL.md are already set to
`plantgreytrees/craftsman`, so they're copy-pasteable for your users as-is.

## Nice-to-haves once it's up

- Add repo **topics** on GitHub: `claude-code`, `claude-code-plugin`, `plugin`,
  `code-quality`, `developer-tools`.
- A short repo **description**: "Stack-agnostic doc-first loop + deterministic
  quality engine for Claude Code — any language."
- Turn on **Issues** and **Discussions** if you want contributions.
