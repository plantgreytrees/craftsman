---
name: systematic-debugging
description: Use when a bug, error, crash or wrong output is reported, before proposing a fix: find the root cause.
---

Adapted from obra/superpowers (MIT License). Standalone: needs no other plugin.

1. Reproduce the failure and read the full error.
2. Trace the data back to where it first goes wrong.
3. State one hypothesis; test it with the smallest change or probe.
4. Fix the cause, not the symptom, and add a test that failed before.
5. After three failed hypotheses, stop and question the design.
