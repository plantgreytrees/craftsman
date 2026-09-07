# Terraform / IaC design checklist

- State discipline: remote state with locking (S3+DynamoDB, Terraform Cloud, etc.) for anything beyond a solo throwaway — never commit `.tfstate` or leave it local for a shared environment.
- Make illegal states unrepresentable: use `variable` type constraints (`object({...})`, not bare `any`) and `validation` blocks for inputs with real constraints (allowed regions, non-empty lists); a bad value should fail `plan`, not `apply`.
- Modules over copy-paste: a repeated resource block across environments belongs in a module with explicit inputs/outputs — but don't introduce a module for a single call site "just in case."
- Least privilege: IAM/policy resources scope to the specific actions and resources needed, not `*:*`; a new policy should name its principals and resources explicitly.
- No hardcoded secrets: credentials, tokens, and keys come from a secrets manager or provider-native mechanism (env-injected, `sensitive = true` variables) — never a literal in `.tf`/`.tfvars` committed to the repo.
- Plan before apply: every change should be reviewable via `terraform plan` output; a module that can't be planned deterministically (unpinned provider/module versions) is a bug — pin versions.
- Destructive-change awareness: flag any resource replacement (not just update) implied by a diff — a forced replace on a stateful resource (database, volume) is a data-loss risk that needs explicit sign-off.
- Naming/tagging consistency: resources follow the repo's existing naming and tagging convention (environment, owner, cost-center) — grep for the existing pattern before inventing a new one.
