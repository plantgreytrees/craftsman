# Kotlin design checklist

- Null safety: use the type system (`String` vs `String?`) instead of sentinel values; avoid `!!` outside tests — a `!!` in production code is an unhandled `NullPointerException` waiting to happen. Prefer `?.`/`?:`/`requireNotNull` at the boundary.
- Data modeling: `data class` for immutable value types; `sealed class`/`sealed interface` for closed variant sets so `when` can be exhaustive without an `else` branch (the compiler enforces it).
- Error model: exceptions for unexpected/programmer errors; a `Result<T>`/sealed "outcome" type for expected, frequent failures (validation, not-found) — don't use exceptions for control flow, and never catch `Exception` broadly and swallow it.
- Coroutines/concurrency: structured concurrency (`coroutineScope`, `viewModelScope`) over raw `Thread`/callback-based async; every suspend function that can be cancelled should cooperate with cancellation, not swallow `CancellationException`.
- Immutability: `val` over `var` by default; prefer immutable collections (`List`, not `MutableList`) on a public API surface unless mutation is the point.
- Abstraction budget: don't introduce an `interface` until a second implementation or a real test seam (mocking framework substitution) exists — Kotlin's default visibility and extension functions often remove the need entirely.
- Null-object/Elvis over defensive `if (x != null)` chains where the language's `?.`/`?:` operators express the same intent more directly.
- Test seams: constructor injection for testability; `kotlinx-coroutines-test` for suspend-function tests instead of real delays/threads.
