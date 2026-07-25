---
name: language-aware-planning
description: Use before implementing any non-trivial change — new module, new public API, multi-file change, concurrency, or persistence. Produces an implementation plan in the target language's own idioms and checks it against that language's design checklist. Not needed for small edits or bug fixes.
---

# Language-Aware Planning

Plan in the target language from the first sentence. Do not design in
language-neutral pseudocode and translate afterwards: the error model, data
modeling, abstraction mechanism and concurrency model ARE language decisions,
and a neutral plan systematically produces lowest-common-denominator designs
that then get transliterated badly.

## Procedure

1. **Name the target language** — detect from repo markers, never assume:
   `package.json`→JS/TS, `pyproject.toml`/`requirements.txt`→Python, `go.mod`→Go,
   `Cargo.toml`→Rust, `pom.xml`/`build.gradle`→Java/Kotlin, `Gemfile`→Ruby,
   `*.sln`/`*.csproj`→C#, `composer.json`→PHP. Then Grep for two or three modules
   that already solve a similar problem — **consistency with this codebase
   outranks textbook patterns.**
2. Make these five decisions explicit, in the language's own vocabulary:
   - Error model — one strategy, stated
   - Data model — make illegal states unrepresentable where the language allows
   - Public API — real signatures, not descriptions
   - Abstraction budget — list what you are NOT abstracting, and why
   - Test seams — how this is tested without mocking the world
3. Read `references/<language>.md` and verify the plan against it. **Load only the
   one language you need** — `python.md`, `typescript.md`, `javascript.md`,
   `go.md`, `rust.md`, `java.md`, `csharp.md`, `ruby.md`, or `generic.md` for
   anything else. The emitted plan follows `references/plan-template.md`.

## Universal constraints

- Simplest design that satisfies the stated requirement. An abstraction needs a
  second concrete implementor or a stated extension requirement — otherwise omit
  it. Many classic patterns are workarounds for limitations the target language
  may not have.
- One pattern per problem. Never mix error strategies within a module; never mix
  sync and async access to one resource without an explicit boundary.
- Dependencies point inward: domain logic must not import I/O, framework, or
  transport concerns.
- Validate external input at the boundary, parse into typed values, and let the
  interior assume validity.
