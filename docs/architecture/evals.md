> **Human reference.** The loop never reads this file. What it enforces lives in
> [`evals.rules.md`](./evals.rules.md); if the two disagree, the rules file wins
> and `/architect --update evals` should be run.

# Behaviour evals architecture
_Last verified: 2026-11-25 at `f3e0d29` · Source idea: [plugin-behaviour-evals](../ideas/plugin-behaviour-evals.md)_

## In plain English
Craftsman's behaviour lives mostly in prose that the model reads. The unit tests
check the scripts and that the prose exists, but not that the model acts on it.
This area adds a small suite of **behaviour evals**: real, isolated Claude Code
sessions run by the first-party `claude plugin eval` command. Each case sends a
prompt with craftsman loaded (and again without it), then checks what happened
with deterministic graders only.

The first suite answers two questions nothing else can: do the four shipped
skills that no command names (`test-driven-development`, `systematic-debugging`,
`verification-before-completion`, `deep-research`) ever fire, and does a
craftsman hook fire in a live session. The maintainer runs it by hand before
moving the `stable` branch and after any description or skill trim, never in CI.

## How it fits
```mermaid
flowchart LR
  SK[skills/*/SKILL.md descriptions] --> EV[claude plugin eval .]
  HK[hooks/hooks.json + scripts/*guard*.mjs] --> EV
  CASES[evals/<case>/prompt.md + graders/] --> EV
  EV -- per-case score, with-plugin only --> RES[evals/results/ (git-ignored)]
  EV -- scores or "unavailable" --> CL[CHANGELOG release entry]
  T[scripts/evals.test.mjs] -- structure, graders, .gitignore --> CI[ci.yml node --test]
  CL --> STABLE[git push origin main:stable]
```

## Decisions
| id | decision | why | rejected alternatives |
|---|---|---|---|
| ARCH-EVALS-01 | First-party `claude plugin eval`, cases in `evals/` | Exists locally (Claude Code 2.1.328, needs ≥ 2.1.269); ARCH-SLIM-15 forbids third-party dependencies | Port Superpowers' harness; custom `claude -p` scripts; relocate via the `experimental.evals` manifest key (experimental, and the default works) |
| ARCH-EVALS-02 | Deterministic graders only (`tool_used`, `tool_order`, `file_exists`, `regex`), defined only in `graders/*.md`, never inline in `case.yaml` | LLM judges agree with humans ~80% and carry verbosity/position bias; every judge is another model call; the plugin has no npm dependencies, so the structure test reads Markdown frontmatter, not YAML lists | Allow `llm` judges on short output; inline `case.yaml` graders |
| ARCH-EVALS-03 | Superseded by ARCH-EVALS-08 (one firing case per unreferenced skill, and per future skill) | No command or agent names these skills, so description-based triggering is their only path | Test only one skill; static removal without measuring |
| ARCH-EVALS-04 | Exactly one hook smoke case: Claude quotes the `craftsman guards:` line its SessionStart hook injects, regex on the final message, no tool grants | 12 `pre-guard*.test.mjs` files already cover guard logic deterministically; only live wiring is untested; this shape needs no Bash grant or sandbox | Re-test guard decisions in evals; a PreToolUse block on Bash (needs a Bash grant, and firing on that path is unproven) |
| ARCH-EVALS-05 | `--ablation none`, `--max-cost-usd 5`, `--no-publish`, minimal tool grants, results git-ignored | `tool_used: Skill` and the hook case can only pass with the plugin, so a no-plugin arm is pure cost; cost is real and unmeasured; reports contain transcripts; the plugin cache is a git checkout, so committed results would ship to every user | Two-arm runs; $2 or $10 ceilings; publishing reports to claude.ai |
| ARCH-EVALS-06 | Run before moving `stable` and after trims; record "unavailable" and proceed if the tool is switched off; no CI gate | Every merge to `main` ships, but `stable` is the tested channel (ARCH-MOD-06); Anthropic can switch `plugin eval` off server-side, which must not freeze releases; a CI gate needs model credentials and is flaky at ~70% invocation rates | Block `stable` until evals run; CI gate on every PR; release-only runs |
| ARCH-EVALS-07 | Superseded by ARCH-EVALS-09/10 (wire or delete a skill that never fires, after two rewrites) | A description-only skill that never fires costs description budget for nothing; a skill already linked (`deep-research` from `commands/understand.md:13`) is in use whatever its firing score | Keep and record only; apply to every skill |
| ARCH-EVALS-08 (replaces 03) | One firing case for every skill under `skills/` except `language-aware-planning`; a removed skill takes its case with it | Naming the four skills in the rule forced an amendment whenever one was removed; a per-directory rule needs none | Keep the named list and amend it on every removal |
| ARCH-EVALS-09 (replaces 07) | One rewrite, gated by a ceiling run and a held-out check: copy the prompt's words first (0/3 → fix the case design once), then one "Use when…" rewrite inside the existing caps, then two fresh paraphrases and one near-miss run locally; keep only at ≥2/3, ≥2/3 each and ≤1/3 | A single test prompt invites overfitting (the deep-research prompt echoes its description); an empty workspace may suppress firing; the owner accepts removal after one honest try | Two rewrites (07); committed should-not-fire cases (+cost every release); `when_to_use` or a raised total cap (owner: no) |
| ARCH-EVALS-10 | A skill not kept is removed with every trace (dir, case, cap, test entries, README line), never wired in | The loop already enforces test-first (`agents/implementer.md:24`), root cause (`/investigate`) and verification (Stop gate); preloading via an agent's `skills:` field would load into every unit-runner role | Wire into `agents/unit-runner.md` via `skills:`; keep and record only |

## Data & flows
Cases are committed and ship with the plugin (the cache is a git checkout:
`.claude-plugin/marketplace.json` source `./`). Results and HTML reports are
written to `evals/results/<timestamp>/`, are git-ignored, and never leave the
machine. Each case runs 3 times with the plugin only (`--ablation none`): every
grader checks something that cannot happen without it. No case needs Bash, so no
case depends on the OS sandbox (bubblewrap is installed here if one ever does).

## Trade-offs & known limits
- Three runs per case is noisy; a single failing run is not a regression.
- Long commands (`/orchestrate`, `/auto`) are out of scope: they need `.craftsman`
  state and exceed the default 10 turns / 300 s.
- The SessionStart hook's context does reach an eval session: the spike probe
  scored 1.00 at $0.07 (2026-11-24, `hook-guards-line`, one run).
- First full run (2026-11-24, 15 runs, $1.56): the hook case and
  `skill-fires-deep-research` scored 1.00; the three loop-discipline skills
  (`systematic-debugging`, `test-driven-development`,
  `verification-before-completion`) scored 0.00. ARCH-EVALS-07's two description
  rewrites have not started; the cases' Skill-only grant, 4 turns and empty
  workspace may also depress those scores.
- `claude plugin eval` can be switched off server-side; releases then record
  "Evals: unavailable" rather than wait.

## Dispute (2026-11-24, NOT ISOLATED)
The `/architect --deep` analyst could not be dispatched (no grant: `/architect --deep`
was not invoked), so root ran its brief itself. Results applied to the rules above,
edited in place because no plan or commit cited them yet:
- **WRONG** — ARCH-EVALS-02 named a grader type `file`; the documented type is
  `file_exists` (https://code.claude.com/docs/en/plugin-evals, Grader types).
- **Gap** — `case.yaml` may hold graders inline as YAML, which the zero-dependency
  structure test cannot read reliably; graders now live only in `graders/*.md`.
- **Gap** — `tool_used: Skill` graders are scored on the with-plugin arm only, so the
  default no-plugin arm doubled cost for no signal; runs now pass `--ablation none`.
- **Gap** — the tool can be "currently unavailable" server-side; ARCH-EVALS-06 now
  records that and lets `stable` move (owner decision).
- **Over-broad** — ARCH-EVALS-07 could have ordered `deep-research`, already linked
  from `commands/understand.md:13`, to be deleted; it now applies only to skills no
  command or agent names.
- **Unproven path replaced** — the hook case no longer relies on a PreToolUse hook
  firing on an ungranted Bash call; it uses the SessionStart context (owner decision).
- Considered and kept: ARCH-SLIM-18 also triggers on command `description:` trims,
  since command and skill descriptions share one listing and similar names cause
  wrong-skill calls (https://blog.langchain.com/evaluating-skills).
- Cost was unmeasured at decision time; the first full run cost $1.56, well inside
  the $5 ceiling, so the ceiling stands.

## Glossary
- **Arm:** the set of runs with the plugin (with-arm) or without it (without-arm).
- **Firing case:** a case whose grader checks that a named skill was invoked.
- **Deterministic grader:** a check computed from the transcript or files, with no model call.

## Amendment (2026-11-25, owner-approved): one rewrite, then remove
Source: [skill-description-rewrites](../ideas/skill-description-rewrites.md). The first suite run scored the three loop-discipline skills 0/3. ARCH-EVALS-07 (two rewrites, then wire in or remove) becomes ARCH-EVALS-09 (a ceiling run, one rewrite, a local held-out check) and ARCH-EVALS-10 (remove, never wire in). ARCH-EVALS-03's named skill list becomes ARCH-EVALS-08's per-directory rule so a removal needs no amendment. ARCH-SLIM-15 becomes ARCH-SLIM-19, which no longer names the borrowed patterns or cites a skill that may be removed.
