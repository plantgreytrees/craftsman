---
name: verification-before-completion
description: Run the real checks and read their output before claiming done.
---

Adapted from obra/superpowers (MIT License). Standalone: needs no other plugin.

1. Name the command that proves the claim.
2. Run it fresh, in full, now.
3. Read the output and exit code; count failures.
4. Report what the output shows, with evidence, not what you expect.
5. If any check is red or unrun, say so; never claim success.
