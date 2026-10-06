---
description: Land a finished branch on the base branch yourself — commit leftovers, leave its worktree, merge, push, and clean up the worktree and the local and remote branch. Run it whenever the user says "merge"; never hand them git commands instead.
argument-hint: "[branch | worktree path]"
allowed-tools: Bash, Read, Edit, ExitWorktree
---

# Merge — land a branch end to end

The user saying "merge" is the go-ahead to land on the base branch and push it.
Finish the whole job in this session. Never end with "run this to merge".
Landing goes through `repo-exec.mjs merge`, the same path `/orchestrate` uses
for units. It re-runs the project's tests in the worktree, takes the merge lock,
merges with `--no-ff` and pushes base. It then removes the worktree and deletes
the branch locally and on `origin`. With `repoExec.land: "pr"` it opens an
auto-merging PR/MR instead.

## 1. Pick the target

- **`$ARGUMENTS` names a branch or worktree path** → that one.
- **Empty** → the worktree this session is in (`git rev-parse --show-toplevel`
  is a linked worktree). Otherwise use the current branch if it isn't the base.
  If the target is still ambiguous, `git worktree list` and ask which one.

Resolve its absolute worktree path, its branch, and the **main checkout**: the
first entry of `git worktree list`. If the branch has no worktree, add one from
the main checkout: `git -C <main> worktree add .claude/worktrees/<branch> <branch>`.

## 2. Make it landable

- **Uncommitted changes in the worktree** → if they're this session's work,
  commit them with a real message. If not, stop and ask.
- **The main checkout has uncommitted changes** → stop and report. Never stash or
  discard the user's work.

## 3. Step out of the worktree

If this session is inside the target worktree, call **ExitWorktree with
`action: "keep"`**. Landing removes the worktree, and it must run from the main
checkout: from inside a linked worktree the repo root resolves to the worktree
itself.

## 4. Land

From the main checkout:

```bash
printf '%s' '{"action":"merge","worktree_path":"<abs worktree>","branch":"<branch>","session_id":"<session_id>"}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/repo-exec.mjs"
```

Add `"base_branch":"<base>"` only when the base can't be inferred (the script
says so).

## 5. On failure — fix and retry, don't hand back

- **`pre-merge gate failed`** → fix the failure in the worktree, commit, and
  rerun step 4.
- **Merge conflict** (the merge is aborted, so base is untouched) → in the
  worktree, `git fetch origin && git merge origin/<base>`, resolve, re-run the
  tests, commit, and rerun step 4. Stop and ask only when a conflict needs a
  judgement call on intent.
- **`pull --ff-only` fails** (local base has commits origin doesn't) → report it.
  Never force-push.
- **Merge lock busy** → another session is landing. Wait briefly, then retry.
- **Push rejected or protected branch** → report it, and suggest
  `repoExec.land: "pr"` in `craftsman.config.json`.

Never use `--no-verify`, `--force` or `git worktree remove --force`.

## 6. Report

From the JSON result, report:
- the base branch and its new HEAD (`git -C <main> log --oneline -1 <base>`);
- whether base was pushed;
- `cleaned`, `branch_deleted` and `remote_branch_deleted`.

In `pr` mode, report the PR URL and that it merges once checks pass. A
`cleanup_error` means the merge landed but cleanup didn't: give the leftover
path or branch.
