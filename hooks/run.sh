#!/bin/sh
# The launcher every craftsman hook runs through: run.sh scripts/<name>.mjs (hook JSON on stdin).
# POSIX sh only. With node missing a hook cannot run, so it must not look like a pass:
#   a safety hook (the fixed list below) exits 2, which blocks the call (ARCH-SAFETY-02);
#   any other hook exits 0 and says once per session that craftsman is off (safety.rules.md).
SAFETY_HOOKS=" pre-guard.mjs agent-mode-guard.mjs orchestrate-scope-guard.mjs "
script=${1#scripts/}
case $script in
  ''|.*|*[!A-Za-z0-9_.-]*) echo "craftsman: run.sh given an invalid hook script: '$1'" >&2; exit 2 ;;
  *.mjs) ;;
  *) echo "craftsman: run.sh given an invalid hook script: '$1'" >&2; exit 2 ;;
esac
root=${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
if command -v node >/dev/null 2>&1; then
  exec node "$root/scripts/$script"
fi
case $SAFETY_HOOKS in
  *" $script "*) echo "craftsman: node not found, guards cannot run" >&2; exit 2 ;;
esac
sid=${CLAUDE_CODE_SESSION_ID:-shared}
case $sid in *[!A-Za-z0-9_-]*) sid=shared ;; esac
dir=${TMPDIR:-/tmp}/craftsman-launcher-$(id -u)
marker=$dir/node-missing-$sid
# A directory is the marker: mkdir is atomic and never follows a planted symlink. If it cannot be
# made the warning repeats, which is loud rather than silent.
if [ ! -d "$marker" ]; then
  umask 077
  mkdir -p "$dir" 2>/dev/null
  mkdir "$marker" 2>/dev/null
  printf '%s\n' '{"systemMessage":"craftsman disabled: node not found, so its hooks are not running"}'
fi
exit 0
