# C# design checklist

- Data modeling: use `record`/`record struct` for immutable data with value equality; `required` members plus `init` setters so objects can't be constructed half-built. Model closed variants with an abstract/sealed hierarchy or records and exhaustive `switch` expressions with pattern matching (rely on the exhaustiveness warning).
- Make illegal states unrepresentable: prefer distinct types and enums over stringly-typed flags; validate invariants in constructors; consider a lightweight `Result` type for expected variant outcomes.
- Error model: decide and state it per layer — throw exceptions for exceptional/unexpected conditions; return a `Result<T>`/`OneOf` for expected, frequent failures (validation, not-found). Don't use exceptions for control flow, don't catch-and-swallow, always preserve stack traces (`throw;` not `throw ex;`).
- Typing/nullability: enable nullable reference types (`<Nullable>enable</Nullable>`) project-wide and honor the warnings — no `!` null-forgiving operator to silence them. Make absence explicit via `T?` and guard.
- Async/concurrency: async all the way — no `.Result`/`.Wait()`/`.GetAwaiter().GetResult()` (deadlock/blocking risk). Add `ConfigureAwait(false)` in library code; accept and propagate a `CancellationToken` on every async API. Use `Task`-based parallelism; avoid `async void` except event handlers.
- Abstraction/DI: constructor injection via the built-in DI container; register interfaces only when a second implementation or a test seam exists — don't create an `IFoo` for every `Foo` reflexively. Keep services focused, not God objects.
- API surface/immutability: `sealed` classes by default (open only deliberately); prefer immutable records and `IReadOnlyList`/`IReadOnlyDictionary` on the surface; keep members `private`/`internal` unless they must be public.
- Test seams: xUnit; inject interfaces so tests supply fakes/mocks. Mock external boundaries only — keep domain logic pure and directly testable.
