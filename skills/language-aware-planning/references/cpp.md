# C/C++ design checklist

- Ownership: prefer RAII and smart pointers (`std::unique_ptr` default, `std::shared_ptr` only with genuine shared ownership) over raw `new`/`delete`. In C, pair every allocation with one clear, documented owner and free path — no ambiguous ownership handoff across a function boundary.
- Make illegal states unrepresentable: prefer `enum class` over plain `enum`/`#define` constants for closed variant sets; use `std::optional`/a tagged union over a sentinel value (`-1`, `NULL` overload) for "missing".
- Error model: exceptions or `std::expected`/error-code returns — pick one per module and don't mix. C has only error codes/`errno`; check every return that can fail, never ignore it silently.
- Memory/bounds safety: no raw buffer arithmetic where a bounds-checked container (`std::vector`, `std::span`, `std::string_view`) exists instead. In C, always pass and check buffer length; never `strcpy`/`sprintf`/`gets` — use the bounded variants.
- Const-correctness: parameters, methods, and pointers that don't mutate are `const`; pass by `const&` for non-trivial types instead of by value.
- Abstraction budget: don't reach for virtual dispatch/templates until a real second implementor or genuine compile-time polymorphism need exists — a single-implementor interface is pure overhead in a systems language.
- Concurrency: one synchronization discipline per shared resource (mutex, atomic, or message passing) — never partially lock a structure. Prefer RAII lock guards (`std::lock_guard`/`std::unique_lock`) over manual lock/unlock.
- Build hygiene: warnings-as-errors (`-Wall -Wextra -Werror` or equivalent) on new code; run under a sanitizer (ASan/UBSan) in CI/test if the project has memory-safety history.
- Test seams: dependency-inject collaborators (interfaces/function pointers) so unit tests substitute fakes at real I/O boundaries; keep core logic free of global state.
