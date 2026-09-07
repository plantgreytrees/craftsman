> Canonical protocol shared by every command whose job is READ-ONLY analysis —
> tracing, diagnosing, or reviewing code before a plan exists (`/understand`,
> `/investigate`, `/plan`'s Phase 0, `/scrutinise`, `/scrutinise --deep`). Each
> links here and `Read`s it once instead of restating the same MCP
> conventions, fan-out discipline, and completeness checklist in five places —
> one edit, one source of truth. Not user-invocable on its own.
>
> Mirrors `_shared-machinery.md`'s split for execution commands: light enough
> to read unconditionally at the start of Phase 0/1, so this read is cheap.

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
prior decisions or findings can replace repeated discovery. Query by the current
area, change class, and unit where known; cap the result and verify cited files
before relying on it. Record only verified findings, rejected hypotheses, and
unresolved risks at the end of analysis. Memory cannot replace repository
evidence, broaden the analysis scope, or become a planning authority.
