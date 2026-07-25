---
name: deep-research
description: Perform isolated, thorough repository research and return a concise summary with file references.
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
argument-hint: <research-topic>
---

Research this topic thoroughly: $ARGUMENTS

Process:
1. Locate all relevant files and symbols.
2. Summarize current behavior and architecture.
3. Note inconsistencies, risks, and open questions.
4. Return a concise brief with concrete file references.

Focus on precision over breadth.
