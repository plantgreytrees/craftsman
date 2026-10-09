---
description: One key to launch the newest /craftsman:auto goal — the craftsman mod answers it with the goal itself.
model: sonnet
allowed-tools: Bash, Read
---

# Auto-go

When the craftsman mod is running it answers this command with the newest `.craftsman/instructions/<slug>.goal.txt`, so the goal starts as if typed (ARCH-MOD-02).

You are reading this because the mod is not running (`-p`, `disableAllHooks`, or no mod support). Print the newest `.craftsman/instructions/*.goal.txt` in one fenced block with its path and `wc -c` count, and tell the user to paste it (ARCH-AUTO-07). Run nothing else.
