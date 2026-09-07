# Dockerfile / container design checklist

- Minimal base image: prefer a slim/distroless/alpine base over a full OS image unless a specific dependency requires it; multi-stage builds so build-only tooling never ships in the final image.
- Non-root by default: create and switch to a non-root `USER` before the final `CMD`/`ENTRYPOINT` unless the process genuinely needs root (rare, and should be commented why).
- Layer/cache hygiene: copy dependency manifests (`package.json`, `requirements.txt`, `go.mod`) and install dependencies *before* copying the rest of the source, so dependency layers cache across builds that only change application code.
- No secrets baked into layers: credentials never appear in a `RUN`/`ENV`/`ARG` that ends up in the image history — use build secrets (`--mount=type=secret`) or runtime injection instead.
- Pin versions: base image tags and installed package versions are pinned (not `latest`/unpinned) so a build is reproducible and a base-image CVE doesn't silently roll forward.
- Explicit `EXPOSE`/resource expectations: document the ports the container listens on; if the project's orchestration (k8s manifests, compose file) sets resource requests/limits, a new container should follow the same convention rather than running unbounded.
- Signal handling: the entrypoint process should be PID 1 or use a proper init (`tini`/`--init`) so it receives and forwards signals correctly on shutdown — a shell wrapper that doesn't `exec` swallows `SIGTERM`.
- `.dockerignore` present and matches the repo's real build context — no `node_modules`/`.git`/build artifacts silently bloating the context or layer.
