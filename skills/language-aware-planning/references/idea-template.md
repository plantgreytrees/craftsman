# Idea verdict template (canonical)

The shape of every `docs/ideas/<slug>.md` that `/idea` writes and `/architect`
consumes. Load only when writing one. A rejected or deferred idea is kept, not
deleted — it is how the next `/idea` run spots a duplicate.

````markdown
---
slug: <idea-slug>
status: proposed | pursue | pursue-with-changes | defer | reject | architected
verdict: <one of the statuses above, as decided by /idea>
confidence: low | medium | high
depth: standard | deep
isolation: isolated | NOT ISOLATED
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
related: [<docs/ideas/…>, <docs/plans/…>, <docs/architecture/<area>.rules.md>]
touches: [<the paths/globs the idea would change — /architect and /instruction feed these to arch-check governs>]
---

# Idea: <neutral title — not the pitch>

## Proposal (neutral restatement)
Problem · claimed benefit · who benefits · what "done" looks like. Written so a
sceptic would accept it as a fair summary — no persuasive framing.

## Verdict
**<VERDICT>** (<confidence>) — two to four sentences: why, and the single fact
that would most likely flip it.

| criterion | score 1–5 | evidence |
|---|---|---|
| value (problem is real and frequent) | | |
| system fit (aligns with architecture + direction) | | |
| cost (build + maintain) — 5 = cheap | | |
| risk (blast radius, failure modes) — 5 = low | | |
| reversibility — 5 = trivially undone | | |
| evidence strength (research + repo proof) | | |

## Overlap & prior work
Existing ideas / plans / tracker rows / shipped features / ARCH rules it
duplicates, extends, or conflicts with — each cited. "None found" lists what
was searched.

## System fit (whole project)
The eight completeness dimensions — contract ripple · data · config & flags ·
security · tests · observability · UI · docs — each a concrete `file:line`
impact or `N/A(reason)`. Then second-order effects: what this makes harder,
slower, or more complex elsewhere.

## Research
Prior art, library/approach options, known failure modes — each with its
source URL or `file:line`. Mark anything unverified as such.

## Critique
- **Steelman** — the strongest honest case for it.
- **Strongest case against** — the best argument to not do it.
- **Hidden assumptions** — each with how to test it.
- **Failure modes** — how it breaks in production / under scale / over time.
- **Kill criteria** — observable conditions under which to abandon it.
- **Cheaper alternatives** — incl. doing nothing and the smallest useful slice.

## Disputed
Every critic finding root dropped or softened, with the counter-evidence. Empty
is fine; silent omission is not.

## Recommendations
Concrete improvements to the idea itself, ordered by impact.

## Open questions
Questions only the user can answer, with their answers once given.

## Next step
`/architect <slug>` (pursue) · a narrower `/idea` (pursue-with-changes needing
rework) · nothing (defer/reject — say what would reopen it).
````
