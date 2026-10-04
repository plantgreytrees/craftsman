# Architecture doc templates (canonical)

`/architect` writes every area as a **pair**. Load this only when writing one.
The split is physical on purpose: the loop loads only `<area>.rules.md`, so the
human doc can be as explanatory as it needs to be at zero token cost.
`node scripts/arch-check.mjs lint` validates the pair.

## `docs/architecture/<area>.md` — for people (Claude never loads it in the loop)

````markdown
> **Human reference.** The loop never reads this file. What it enforces lives in
> [`<area>.rules.md`](./<area>.rules.md); if the two disagree, the rules file wins
> and `/architect --update <area>` should be run.

# <Area> architecture
_Last verified: <YYYY-MM-DD> at `<short-sha>` · Source idea: [<slug>](../ideas/<slug>.md)_

## In plain English
What this part of the system is, what it is for, and how it behaves — one or two
short paragraphs a newcomer understands without reading code.

## How it fits
```mermaid
flowchart LR
  %% the real components and flows — named after actual modules, not concepts
```

## Decisions
| id | decision | why | rejected alternatives |
|---|---|---|---|
| ARCH-<AREA>-01 | … | … | … |

## Data & flows
Ownership of data, lifecycles, consistency guarantees; a sequence diagram if a
flow crosses more than two components.

## Trade-offs & known limits
What was deliberately given up, and when that would need revisiting.

## Glossary
Domain terms used above.
````

## `docs/architecture/<area>.rules.md` — what the loop enforces

````markdown
---
area: <area>
governs: ["<path or narrow glob>", "..."]   # what this area owns; keep it tight
human: docs/architecture/<area>.md
source: docs/ideas/<slug>.md                # or "init" (--init baseline) or "backfill" (--backfill)
verified_at: <full commit sha>
updated: <YYYY-MM-DD>
---
# ARCH <area> — enforced rules

- **ARCH-<AREA>-01** [decided] MUST … — check: <how a reviewer verifies it> — cite: <file:line>
- **ARCH-<AREA>-02** [observed] SHOULD … — check: … — cite: <file:line>
- **ARCH-<AREA>-03** [superseded by ARCH-<AREA>-05] …
````

## Rules for the rules file

- **One decision per line**, imperative (`MUST` / `MUST NOT` / `SHOULD`), checkable by reading code — no rationale (that is the human doc's job), no prose paragraphs.
- **Ids are permanent.** Never renumber or reuse; a change is a new id plus `[superseded by …]` on the old one, so plans that cited the old id fail loudly at scope activation instead of silently meaning something new.
- **`decided` needs a `cite:`** — where the rule is established or first applied (a planned file may cite the rules doc's own line until code exists). **`observed`** is reserved for `--init` inferences the user has not confirmed.
- **`governs` is the enforcement surface.** Too broad and every unrelated change must cite this area; too narrow and violations slip through. Prefer directory globs that match real module boundaries.
- Target **≤ 25 rules per area**; past that, split the area. A rule nobody could violate is noise — delete it.
