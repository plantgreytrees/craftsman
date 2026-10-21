#!/bin/sh
# The launcher every craftsman hook runs through: run.sh scripts/<name>.mjs (hook JSON on stdin).
# POSIX sh only. With node missing a hook cannot run, so it must not look like a pass:
#   a safety hook (the fixed list below) exits 2, which blocks the call (ARCH-SAFETY-02), except on
#   UserPromptSubmit, where exit 2 would erase the user's prompt: that event says so and exits 0;
#   any other hook exits 0 and says once per session that craftsman is off (safety.rules.md).
# A safety hook that exits with anything but 0 or 2 (an import-time throw exits 1) is a denial too.
SAFETY_HOOKS=" pre-guard.mjs agent-mode-guard.mjs orchestrate-scope-guard.mjs "
script=${1#scripts/}
case $script in
  ''|.*|*[!A-Za-z0-9_.-]*) echo "craftsman: run.sh given an invalid hook script: '$1'" >&2; exit 2 ;;
  *.mjs) ;;
  *) echo "craftsman: run.sh given an invalid hook script: '$1'" >&2; exit 2 ;;
esac
root=${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}

# ARCH-SAFETY-11: pre-guard has nothing to do for a Read, Glob or Grep unless a unit scope (or the
# scope-required flag) is on disk for the session, the call names something protected-looking, or the
# project sets its own protectedPaths. Where it cannot act, skip the node start. Anything this cannot
# read with certainty (another tool, an odd session id, no input) returns 1 and runs the guard.
guard_cannot_act() {
  case $1 in
    *'"tool_name":"Read"'*|*'"tool_name":"Glob"'*|*'"tool_name":"Grep"'*) ;;
    *) return 1 ;;
  esac
  rest=${1#*'"session_id":"'}
  [ "$rest" = "$1" ] && return 1
  sid=${rest%%'"'*}
  case $sid in ''|*[!A-Za-z0-9_-]*) return 1 ;; esac
  [ "${#sid}" -gt 64 ] && return 1
  tin=${1#*'"tool_input":'}
  [ "$tin" = "$1" ] && return 1
  case $tin in
    *.env*|*node_modules*|*vendor*|*target*|*dist*|*build*|*.next*|*.nuxt*|*.output*|*.svelte-kit*|*generated*|*.pb.go*|*_pb2.py*|*.min.js*|*lock*) return 1 ;;
  esac
  d=${CLAUDE_PROJECT_DIR:-$PWD}
  while :; do
    for f in "$d/.craftsman/sessions/$sid"/scope*; do [ -e "$f" ] && return 1; done
    if [ -f "$d/craftsman.config.json" ]; then
      while IFS= read -r line || [ -n "$line" ]; do case $line in *protectedPaths*) return 1 ;; esac; done < "$d/craftsman.config.json"
    fi
    case $d in /|'') break ;; esac
    d=${d%/*}
    [ -z "$d" ] && d=/
  done
  return 0
}

is_prompt() {
  case $1 in *'"hook_event_name":"UserPromptSubmit"'*|*'"hook_event_name": "UserPromptSubmit"'*) return 0 ;; esac
  return 1
}

if command -v node >/dev/null 2>&1; then
  case $SAFETY_HOOKS in
    *" $script "*)
      input=$(cat)
      if [ "$script" = pre-guard.mjs ] && guard_cannot_act "$input"; then exit 0; fi
      printf '%s' "$input" | node "$root/scripts/$script"
      rc=$?
      case $rc in 0|2) exit $rc ;; esac
      if is_prompt "$input"; then
        printf '%s\n' "{\"systemMessage\":\"craftsman: $script failed (exit $rc), so this prompt was not checked\"}"
        exit 0
      fi
      echo "craftsman: $script failed (exit $rc), guards cannot run" >&2
      exit 2 ;;
  esac
  exec node "$root/scripts/$script"
fi
case $SAFETY_HOOKS in
  *" $script "*)
    if [ "$script" = orchestrate-scope-guard.mjs ] && is_prompt "$(cat)"; then
      printf '%s\n' '{"systemMessage":"craftsman: node not found, so this prompt was not checked"}'
      exit 0
    fi
    echo "craftsman: node not found, guards cannot run" >&2; exit 2 ;;
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
