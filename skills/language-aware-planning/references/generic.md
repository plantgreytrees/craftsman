# Generic design checklist (language-neutral fallback)

- Parse at the boundary: validate and convert all external input (network, disk, env, user, other services) into trusted domain types at the edge; inner code assumes valid data and never re-checks.
- Make illegal states unrepresentable: wherever the type system allows, encode invariants in types — closed variant sets over free-form strings/flags, distinct types over primitives, constructors that reject bad input so a half-built value can't exist.
- One error strategy per module: choose a single convention (thrown errors OR returned result/error values) and apply it consistently within a boundary; convert at the seams. Distinguish expected failures (model them) from bugs (fail loud). Never swallow errors silently; always preserve context/cause.
- Nullability/absence: make "missing" explicit and handle it at the boundary; don't let null/None/undefined propagate deep into logic.
- Abstraction needs a second implementor: don't introduce an interface/trait/protocol/base class until a real second implementation or a genuine test seam exists. Prefer concrete types and plain functions until then; keep abstractions small and consumer-shaped.
- Dependencies point inward: core domain logic depends on nothing; I/O, frameworks, and external services sit at the edges and are injected. Pass collaborators in rather than reaching for globals/singletons, so behavior is substitutable.
- One concurrency model per resource: pick a single ownership/synchronization discipline for each piece of shared state (single owner, message passing, or a lock) and don't mix. Make cancellation/timeouts explicit; avoid unbounded parallelism and leaked workers; never block a shared event loop with heavy work.
- Immutability by default: prefer immutable values and pure functions; return new data instead of mutating inputs. Keep the public surface minimal and explicit.
- Test without mocking the world: keep logic pure and inject dependencies so tests substitute fakes at real boundaries only. Mock external systems, not the code under test; favor fast, deterministic unit tests.
