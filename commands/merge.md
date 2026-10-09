---
description: Land a finished branch on base yourself — commit leftovers, merge, push, and clean up the worktree and the local and remote branch. Run it whenever the user says "merge"; never hand back git commands.
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

**It is also the loop's closing step:** PLAN → ORCHESTRATE → SCRUTINISE →
SYNC-DOCS → MERGE. `/orchestrate` lands each unit's branch itself; this step
lands what's left: the session's own branch or worktree, which carries the plan
doc, tracker and `/scrutinise`/`/sync-docs` edits, and any branch for the slug
that is still unlanded. A `/goal` prompt from `/instruction` that lists this
step is the user's go-ahead, the same as saying "merge".

## 1. Pick the target

- **`$ARGUMENTS` names a branch or worktree path** → that one.
- **Empty** → the worktree this session is in (`git rev-parse --show-toplevel`
  is a linked worktree). Otherwise use the current branch if it isn't the base.
  If the target is still ambiguous, `git worktree list` and ask which one.
- **Run as the loop's last step** → the session's worktree or branch, as above,
  then every worktree or branch named for the slug that isn't merged into base
  yet (`git branch --no-merged <base>`), one at a time.
- **Already on the base branch in the main checkout** → there is no branch to
  land. Commit this session's doc and tracker edits with a real message, then
  `git pull --ff-only && git push`. Never force-push. Report it and skip to step 6.

Resolve its absolute worktree path, its branch, and the **main checkout**: the
first entry of `git worktree list`. If the branch has no worktree, add one from
the main checkout: `git -C <main> worktree add .claude/worktrees/<branch> <branch>`.

## 2. Make it landable

- **Uncommitted changes in the worktree** → if they're this session's work,
  commit them with a real message. If not, stop and ask.
- **The main checkout has uncommitted changes** → stop and report. Never stash or
  discard the user's work.
- **As the loop's last step, check both contracts first.** Acceptance: no
  unticked `- [ ]` line in `.craftsman/acceptance.md` for the slug's
  `[unit:<id>]` lines or untagged ones. Architecture: the last `/architect
  --update` or `/scrutinise` left no `decided` rule VIOLATED and no open
  Architecture finding. Either one fails → not landable: go back to
  `/scrutinise <slug>` and its fix round. Never tick a criterion or edit a rule
  to get past this.

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

## 5a. Under /auto

- **Standing approval.** Invoking `/craftsman:auto` is standing approval to
  commit, branch, merge base in, push, land and clean up worktrees and branches
  across every registered workspace project — no per-repo confirmation
  (ARCH-LAND-01).
- **One repo at a time, in plan-graph order.** Each repo lands through its own
  `repo-exec.mjs` `merge` (`direct` or `pr`), in the order `plan-graph.mjs`
  returns for the plan's units; never one merge spanning repos (ARCH-LAND-02).
- **Submodules.** A parent repo's submodule pointer bump is an explicit
  dependent unit in the parent, landed after the submodule's own unit;
  `repo-exec` stays single-repo (ARCH-LAND-03).
- **Only registered projects.** Touch only projects in `craftsman.workspace.json`
  plus the submodules `git submodule status` reports on those roots — never
  find repos by scanning directories (ARCH-LAND-04).
- **No force.** `pre-guard.mjs` blocks force pushes (flags, `+refspec` or
  `--mirror`), `reset --hard` and `worktree remove --force` while `/auto` is
  active (ARCH-LAND-05). It fails closed: a command over 16 KB, or one
  `scripts/lib/force-block.mjs` cannot read inside its deadline, is blocked
  too. A conflict, ff-only failure, rejected push or PR auto-merge
  error PARKs the unit with a decision for `/auto`'s Phase C (ARCH-LAND-06).

## 6. Report

From the JSON result, report:
- the base branch and its new HEAD (`git -C <main> log --oneline -1 <base>`);
- whether base was pushed;
- `cleaned`, `branch_deleted` and `remote_branch_deleted`.

In `pr` mode, report the PR URL and that it merges once checks pass. A
`cleanup_error` means the merge landed but cleanup didn't: give the leftover
path or branch.
