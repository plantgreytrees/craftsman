# Shell (Bash/POSIX sh) design checklist

- Fail fast: `set -euo pipefail` (Bash) at the top of every script; a `sh`-only script should at least `set -eu` since `pipefail` isn't POSIX. Know which shell you're targeting and say so in the shebang (`#!/usr/bin/env bash` vs `#!/bin/sh`) — don't use bashisms in a `sh` script.
- Quote everything: `"$var"` not `$var`; `"$@"` not `$*` when forwarding arguments. Unquoted expansion is the single most common shell bug class (word-splitting, globbing).
- Prefer `[[ ]]` (Bash) over `[ ]` for conditionals — safer with unquoted/empty variables and supports pattern matching without a subshell.
- Error handling: check exit codes explicitly for anything that can fail and you need to react to (not just `set -e`, which skips some contexts — pipelines, `&&`/`||` chains, function calls in a condition). Never swallow a non-zero exit silently.
- No parsing `ls`/relying on word-splitting for filenames — use globs, `find -print0` + `xargs -0`, or arrays (Bash) for anything that might contain spaces/newlines.
- Idempotency: a script that creates/modifies state should be safe to re-run (check-then-act or `mkdir -p`-style idempotent operations) unless it's explicitly a one-shot migration.
- Scope: prefer local functions and `local` variables over global mutable state; a script that's grown past ~100 lines of real logic is a candidate to become a proper program in the repo's primary language instead.
- Portability: if the script needs to run on both GNU and BSD/macOS userland, don't assume GNU-only flags (`sed -i` without a backup-suffix arg, `date -d`) without checking.
