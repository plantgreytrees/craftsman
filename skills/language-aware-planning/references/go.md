# Go design checklist

- Data modeling: small structs; make the zero value useful so callers can use a struct without a constructor. Go has no sum types — model closed variants with a sealed interface (unexported marker method) or a tagged struct with a `kind` field and validate exhaustively.
- Make illegal states hard: prefer distinct types over stringly-typed fields; use typed constants (`iota`) for enums; keep constructors (`NewX`) that return an error when invariants must hold.
- Error model: return `error` as the last value and check it every time; wrap with `fmt.Errorf("doing X: %w", err)` to preserve the chain, inspect with `errors.Is`/`errors.As`. Don't `panic` for expected failures; don't discard errors with `_`. Reserve `panic` for truly unrecoverable programmer bugs.
- Typing/nullability: watch nil — nil maps are read-safe but write-panic; nil slices are fine to append; a nil interface holding a typed nil is a classic trap. Return concrete types, accept interfaces.
- Abstraction/DI: define small interfaces at the CONSUMER, not the producer, and keep them 1–3 methods (`io.Reader`-sized). Don't create an interface until a second implementation or a test fake needs it — accept the concrete type until then. Inject dependencies via struct fields/constructor args.
- Concurrency: establish clear ownership — the goroutine that owns a channel closes it; never close from the receiver side. Thread `context.Context` as the first arg and honor cancellation/deadlines. Don't leak goroutines; protect shared state with a mutex or a channel and run with `-race`.
- API surface/immutability: no `const` structs, so document what callers must not mutate; pass copies of small structs, avoid sharing mutable slices/maps across goroutines. Keep exported surface minimal.
- Test seams: table-driven tests with subtests (`t.Run`) and `t.Parallel()` where safe; substitute the consumer-defined interface with a fake. Avoid heavy mocking frameworks.
