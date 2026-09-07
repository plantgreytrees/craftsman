# PHP design checklist

- Typing: declare `strict_types=1` in every new file; use scalar/return type hints and readonly properties for immutable data. Prefer enums (PHP 8.1+) over class constants for closed variant sets.
- Error model: exceptions for exceptional/unexpected failures; a typed result (a small union/`match`-friendly value object) for expected, frequent failures (validation, not-found) rather than exceptions for control flow. Never `@`-suppress errors; never catch `Throwable` and swallow it.
- Make illegal states unrepresentable: constructor property promotion with validation in the constructor so a half-built object can't exist; avoid public mutable properties on domain objects.
- Nullability: make absence explicit via `?Type` and a guard at the boundary; don't let `null` propagate deep into business logic unchecked.
- Abstraction budget: don't introduce an interface until a second implementation or a real test seam exists — a framework service class doesn't need one just to "be testable" if constructor injection already allows a fake.
- Dependency injection: use the framework's container/constructor injection; avoid static facades and singletons in new code — they hide dependencies and block substitution in tests.
- Array vs. object: prefer typed objects/DTOs over associative arrays for structured data crossing a function boundary — arrays give up type safety and IDE support for no benefit once the shape is fixed.
- Test seams: PHPUnit/Pest with constructor-injected fakes at real boundaries (DB, HTTP, filesystem); keep domain logic framework-free and directly testable.
