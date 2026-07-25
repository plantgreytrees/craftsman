# JavaScript design checklist

- Data modeling: same spirit as typed langs without a compiler — represent variants as objects with an explicit `type`/`kind` tag and `switch` on it; keep a factory per variant so shapes stay consistent. Avoid contradictory boolean-flag combinations; use a single status field.
- Documentation of shape: add JSDoc `@param`/`@returns`/`@typedef` where it earns its keep (public functions, tricky data) so editors and `tsc --checkJs` can catch mistakes; don't over-annotate trivial locals.
- Boundaries: validate at every boundary (network, disk, env, user input) before trusting data — guard required fields, coerce types deliberately. Don't assume JSON matches your mental model.
- Error model: throw `Error` subclasses with meaningful messages; catch narrowly and rethrow with context. Don't swallow in empty `catch {}`; don't reject promises with non-Error values; don't use return-code sentinels.
- Async/concurrency: no floating promises — await or `.catch()` every one; a fire-and-forget must be explicit and logged. Use `Promise.all` for parallel work, `AbortController` for cancellation; never block the event loop with sync CPU work.
- Abstraction/DI: small single-purpose modules and plain functions; pass dependencies as arguments (functions/objects). Avoid class hierarchies, and avoid `this`/prototype tricks that surprise callers — prefer closures over `this`-bound methods.
- API surface/immutability: return new objects/arrays instead of mutating inputs; `Object.freeze` config/constants; prefer `const`. Keep exports minimal and named.
- Environment boundary: keep Node-only (fs, process, path) and browser-only (DOM, window) code in separate modules; isolate platform APIs behind a thin adapter so shared logic stays portable.
- Test seams: inject collaborators so tests supply fakes; vitest/jest with minimal module mocking. Keep pure logic pure and unit-testable without I/O.
