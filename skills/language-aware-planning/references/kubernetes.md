# Kubernetes manifest design checklist

- Resource requests/limits set on every container — an unbounded pod can starve its node's other workloads; a missing `resources` block is a finding, not a style nit.
- Liveness/readiness probes present for any long-running service — without them Kubernetes can't tell a hung process from a healthy one, or route traffic away from a pod still starting up.
- No `:latest` image tags — pin a specific tag/digest so a rollout is reproducible and a rollback actually rolls back to a known image.
- Least privilege: no `privileged: true`, no running as root (`runAsNonRoot: true`) unless the workload genuinely needs host-level access; no broader `ClusterRole`/`Role` permissions than the workload's own resources require.
- Secrets via `Secret`/external secret manager references, never plaintext values in a `ConfigMap` or inlined `env` value.
- Replica count / `PodDisruptionBudget` — a stateless service that should tolerate a node drain has more than one replica and, where the project convention includes it, a PDB.
- Namespace/label consistency — resources follow the repo's existing labeling convention (app, environment, owner) so they're selectable by the existing tooling/dashboards; grep for the pattern before inventing a new one.
- Config vs. code: environment-specific values come from a `ConfigMap`/overlay (Kustomize/Helm values), not hardcoded into a shared base manifest that then needs copy-pasting per environment.
