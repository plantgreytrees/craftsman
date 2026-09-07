# Swift design checklist

- Optionals over sentinels: model absence with `Optional`, never a magic value (`-1`, empty string meaning "none"); unwrap with `guard let`/`if let` at the boundary, not force-unwrap (`!`) outside tests/previews.
- Value types by default: `struct`/`enum` for data; reach for `class` only when reference semantics or Objective-C interop is actually needed. Enums with associated values model closed variant sets exhaustively (`switch` without `default` catches new cases at compile time).
- Error model: `throws`/`Result<Success, Failure>` for expected, recoverable failures; `fatalError`/precondition only for programmer errors that should never happen in a correct build. Never silently swallow a `catch`.
- Concurrency: prefer `async`/`await` and structured concurrency (`TaskGroup`) over completion-handler callbacks in new code; mark shared mutable state `actor`-isolated rather than guarding it with manual locks.
- Memory: `weak`/`unowned` on back-references (delegate, closure capturing `self` in a long-lived closure) to avoid retain cycles — check every `[weak self]` actually needs it vs. defensive habit hiding a real cycle elsewhere.
- API surface: `private`/`fileprivate` by default; mark a type `final` unless subclassing is a real, intended use case.
- Test seams: protocol-based dependency injection so unit tests substitute fakes for network/persistence; keep view logic (SwiftUI view bodies, view controllers) thin and push logic into testable view models.
