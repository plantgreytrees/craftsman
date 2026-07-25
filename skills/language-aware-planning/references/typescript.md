# TypeScript design checklist

- Data modeling: model variants as a discriminated union with a literal `kind`/`type` tag; switch over it and add a `default: assertNever(x: never)` so a new variant is a compile error. Prefer many precise types over one wide interface full of optionals.
- Make illegal states unrepresentable: use unions instead of `boolean` flags that can contradict; brand primitive IDs (`type UserId = string & { readonly _brand: unique symbol }`) so they don't mix.
- Boundaries: parse, don't assert. Treat all external input as `unknown` and validate with zod/valibot into a domain type — never `any`, never a bare `as` cast to launder untyped data.
- Error model: decide per layer and state it — domain/core returns `Result<T, E>` (a discriminated union) for expected failures; throw only for truly exceptional/programmer errors. Don't mix both silently; never `throw` a non-Error.
- Typing/nullability: `strict: true` (incl. `strictNullChecks`, `noUncheckedIndexedAccess`); no `any`, no non-null `!` — narrow instead. Prefer `unknown` at edges.
- Async/concurrency: no floating promises (`no-floating-promises`); every promise is awaited or explicitly handled. Don't mix `await` with unhandled `.then`; parallelize with `Promise.all` and pass `AbortSignal` for cancellation.
- Abstraction/DI: prefer plain modules and functions over classes; a service is a function or a small object of closures. Introduce an `interface` only when a second implementation/test double exists — inject it as a parameter, avoid DI-container ceremony.
- API surface/immutability: prefer `readonly` fields, `ReadonlyArray`, and `as const` for literal data; return new objects over mutation. Keep exported types narrow and explicit.
- Test seams: inject collaborators as params/interfaces so tests pass fakes; vitest/jest. Avoid deep module mocking — design for substitution instead.
