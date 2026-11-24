---
name: hook-guards-line
description: craftsman's SessionStart hook reaches a live session (ARCH-EVALS-04).
tags: [hook]
runs: 3
max_turns: 3
allowed_tools: []
expected_outcome: 'The reply quotes "craftsman guards: on." from the session context.'
---
Your session context was given a line by a plugin's SessionStart hook that begins with `craftsman guards:`. Reply with that one line, quoted exactly as it appears. Do not use any tools. If no such line is in your context, reply exactly `NO GUARDS LINE`.
