---
description: Multi-framework structured analysis — surfaces hidden assumptions, generates competing solutions, stress-tests each with adversarial reasoning, and delivers confidence-calibrated recommendations.
argument-hint: "[problem or question to analyze]"
model: opus
allowed-tools: Read, Grep, Glob, Bash, TodoWrite
---

# Ultra-Think — deep analysis and problem solving

Analyze the problem or question provided: **$ARGUMENTS**

Up front, identify: the core challenge, key constraints, implicit assumptions, and who is affected by the outcome.

**Before beginning**, check whether `$ARGUMENTS` gives enough context:
- Specific problem, clear domain → proceed immediately.
- Critical context missing (the domain, the constraints, or the decision-maker's goals) → ask up to three targeted questions first. No unnecessary questions.

## Ground the analysis (when it's about this codebase)

When the question is about *this* project, the analysis is only as good as its grounding — **the repo's `docs/` and code are the source of truth, not memory or assumption.** Before generating options, pull the relevant references and cite them (`file:line` or doc section): how the system actually fits together, what's in / out of scope, the error-handling / fail-closed rules, and any design docs for UI questions. Detect the stack from repo markers, never assume from a name. An option that violates a locked / signed-off invariant is dead on arrival — say so explicitly. For a purely generic (non-project) question, skip this grounding — don't invent citations. If available, `memory` recalls prior related analyses.

## Required analysis elements

Address all of these; order and depth are yours to determine from the problem:
- **Problem framing** — what is actually being asked? What assumptions are embedded in the question?
- **Competing solutions** — at least 3 meaningfully different approaches, not variations of one idea.
- **Multi-lens evaluation** — assess each across the lenses that apply (technical, economic, human, systemic, temporal — select and justify which).
- **Adversarial testing** — for each leading solution, argue against it. What would have to be true for it to fail badly? Invert: ask what you'd do to guarantee failure, then ensure the recommendation avoids those paths.
- **Cross-domain insight** — at least one non-obvious parallel from a different field or discipline.
- **Second-order effects** — what does each approach make more or less likely in 6 months, 2 years, 10 years?
- **Synthesis** — which approach or combination is recommended, and why given the specific trade-offs?
- **Confidence calibration** — for each key claim, note where uncertainty is high and what would change the recommendation.

## Output structure

```
## Problem Analysis
- Core challenge · Key constraints · Critical success factors

## Solution Options
### Option N: [Name]
- Description · Pros / Cons · Implementation approach · Risk assessment

## Recommendation
- Recommended approach · Rationale · Implementation roadmap · Success metrics · Risk mitigation

## Alternative Perspectives
- Contrarian view · Future considerations · Areas for further research
```

## Output expectations

- Every option evaluated on its own merits, not just relatively.
- Reasoning chains explicit — conclusions reference the evidence or logic that produced them.
- Uncertainty surfaced, not hidden. Insufficient data → say so and specify what would resolve it.
- The recommendation is actionable: next steps specific enough to begin on immediately.
- Length matches problem complexity. Avoid padding.

> Tip: for the hardest decisions, enable extended thinking in your settings — this command's structure pairs with deeper native reasoning for stronger results.
