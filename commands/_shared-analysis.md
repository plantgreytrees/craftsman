> Canonical protocol shared by every command whose job is READ-ONLY analysis —
> tracing, diagnosing, or reviewing code before a plan exists (`/understand`,
> `/investigate`, `/plan`'s Phase 0, `/scrutinise`, `/scrutinise --deep`). Each
> links here and `Read`s it once instead of restating the same MCP
> conventions, fan-out discipline, and completeness checklist in five places —
> one edit, one source of truth. Not user-invocable on its own.
>
> Mirrors `_shared-machinery.md`'s split for execution commands: light enough
> to read unconditionally at the start of Phase 0/1, so this read is cheap.

## Agent mode

Check `craftsman.config.json`'s `execution.agentMode` (also asserted every session by the SessionStart context line). Default `root-only`: perform every "dispatch"/"fan out" below **yourself, sequentially, in this session** — never via Task/Agent, never in parallel — using the named agent's `.md` brief as the spec for what to check. `execution.agentMode: "subagents"` is the only setting that restores literal parallel Task dispatch. **Mechanically enforced:** `agent-mode-guard.mjs` (`PreToolUse` on `Task|Agent`) hard-blocks any Task call under root-only mode except the named exceptions below — this isn't a convention the model can accidentally slip past.

**The standing exceptions, regardless of `agentMode`** — each stated explicitly in its own command, not inferred here: (1) `/plan`'s Phase 0 step 0 (decomposition) delegates to `craftsman:plan-strategist` on `opus`; (2) one isolated fresh-context agent per invocation of `/scrutinise` (`craftsman:scrutineer`), `/idea` (`craftsman:idea-critic`) and `/architect --deep` (`craftsman:architect-analyst`) — the guard allows each only against a grant that invoking its command writes for the session, spent on use, so none can run twice or in parallel; (3) Claude Code's read-only built-in agents listed in `execution.builtinAgents` (default `["Explore"]`) — read-only by design (no file-edit tools; any Bash still passes craftsman's guards; see `docs/builtins.md`), so they can't take over implementer/specialist/reviewer work, and this is how this doc's `Explore` dispatches pass under root-only (`general-purpose` is not read-only and stays blocked; do that tracing yourself). Under `agentMode: "subagents"`, every Task dispatch must likewise use the plugin-namespaced type (`craftsman:<agent>`, e.g. `craftsman:implementer`) — bare agent names are not registered and fail with "Agent type not found". Root-only mode constrains every *unstated* "delegate/dispatch" in this shared doc and the commands that read it; it does not silently cancel an exception a command names in its own text.

## Optional MCP conventions (analysis phases)

Use where it earns tokens, skip otherwise; each degrades gracefully if the server is absent:
- **context7** — confirm a library/framework's current API before trusting training data on it (a suspected misuse, a planned call against an external API).
- **memory** — recall prior findings for this area at the start (gotchas, past root causes, past review findings, prior understanding); record what was learned at the end.
- **sequential-thinking** — structure a genuinely complex hypothesis tree, decomposition, or multi-lens review. Skip for a small, single-file target.

## Bounded fan-out (cap large targets instead of unbounded dispatch)

Read-only dispatch (`Explore` / `general-purpose` / a domain specialist) is parallel and evidence-carrying (conclusions + `file:line`, never a file dump) — but **capped**, not unbounded, once a target's true size is known:
- **Default cap: ~15** units of dispatch, where "unit" is whatever the calling command is fanning out over (path segments for `/investigate`, modules for `/understand`, rows for `/sync-docs --tracker`). A command may state a tighter cap for its own fan-out shape (e.g. `/scrutinise --deep`'s module × defect-class matrix caps at the **top 12 modules by changed-line count**, since that matrix grows unbounded otherwise) — state the cap explicitly, don't leave it implicit.
- Once the true count crosses the cap, the remainder is **listed by name only**, not dispatched-and-traced — say so explicitly in the output (which units got full tracing vs which were only named), so a large target degrades **visibly**, not silently or via unbounded token spend.
- A loop-until-dry pass (`/scrutinise --deep` only) re-fans-out only on findings at or above a stated severity floor, with a hard round ceiling — log what each round added and whether the ceiling or genuine dryness stopped it.

## Completeness-dimension checklist

Every analysis command sweeps the **same eight dimensions** so a plan built from its output can't silently skip one — silence on a dimension is itself a finding, not an omission:

**contract ripple** (consumers of a changed API / exported type / event) · **data layer** (tables/migrations) · **config & flags** · **security** (auth/tenancy/secrets/crypto/external-I/O gates) · **tests** (coverage that exists vs. what a change needs) · **observability** (metrics/logs on the path) · **UI** (call sites / states, if user-facing) · **docs** (which doc owns this area).

Each dimension resolves to either a concrete file/finding or an explicit `N/A(reason)` — never a blank. `/plan`'s `coverage:` header and `/understand`'s hand-off checklist are both this same list, populated at different points in the loop.

## Plan memory use

Use `scripts/plan-memory.mjs` for bounded, project- and plan-keyed recall when
prior decisions or findings can replace repeated discovery. **Always query by
the current area, change class, and unit** — never call recall without one:
an empty query returns nothing (no "grab whatever's there" fallback), and a
real query only ever surfaces records that actually match its terms. Cap the
result and verify cited files before relying on it. Record only verified
findings, rejected hypotheses, and unresolved risks at the end of analysis,
each with **required `tags`** (at least one) and a **summary capped at 220
characters** — one terse fact, never a paragraph. Memory cannot replace
repository evidence, broaden the analysis scope, or become a planning
authority.
