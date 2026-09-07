---
description: Create or explicitly update a Craftsman workspace manifest for selected existing Git projects without scanning the workspace.
argument-hint: "<project-id=relative/path ...> [--manifest <path>] [--update]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Workspace Init — select existing projects

Create a `craftsman.workspace.json` for an existing multi-repository workspace. This
command changes workspace metadata only; it does not modify project code, configs,
branches, or remotes.

Arguments: `$ARGUMENTS`

## Safety contract

- Project mappings are explicit: `id=relative/path`. Never discover projects by
  recursively scanning the workspace, listing all directories, or guessing roots.
- Each root must exist, be inside the manifest directory, and resolve to its own
  Git repository. A parent repository containing nested folders is not silently
  treated as multiple projects.
- Existing manifests are protected. Pass `--update` only when intentionally
  merging the supplied mappings into the existing manifest.
- Use `--manifest /absolute/or/relative/path` when the manifest lives at a workspace
  root outside the current repository. Otherwise it is written as
  `craftsman.workspace.json` in the current project root.
- Keep the mapping small: include only repositories affected by the current work.
  Add another project later with `--update`; do not create a 60-project inventory
  merely because the workspace contains 60 projects.

## Examples

```text
/craftsman:workspace-init payments=services/payments search=tools/search
/craftsman:workspace-init payments=../payments --manifest ../craftsman.workspace.json
/craftsman:workspace-init --update catalog=apps/catalog --manifest ../craftsman.workspace.json
```

## Execution

1. Parse the explicit mappings and reject malformed or duplicate ids.
2. Run the deterministic helper with JSON on stdin:

```bash
printf '%s' '{"projects":{"payments":"services/payments"}}' \
  | node "${CLAUDE_PLUGIN_ROOT}/scripts/workspace-init.mjs"
```

For `--update`, include `"update":true`. For `--manifest`, include the resolved
`manifest_path`. Do not hand-edit a manifest after the helper reports an error.
3. Read back only the generated manifest and report its path, selected projects,
   and next action.
4. Set `CRAFTSMAN_WORKSPACE_MANIFEST` to the manifest path when it is outside the
   current project root. Then use `project: <id>` in plan scope steps.

## Next action

Run `/craftsman:plan` for the requested change. It must create one scope step per
selected project boundary, with explicit `depends_on` edges for cross-project
contracts. `/craftsman:orchestrate` will reject unknown project ids and enforce
selected-project boundaries at runtime.
