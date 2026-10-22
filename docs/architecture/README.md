# Architecture

Human index (the loop never reads this file). Each area is a pair:
`<area>.md` for people and `<area>.rules.md` for what the loop enforces.

- [state](./state.md): project-root pinning, session- and worktree-keyed guard state, `Workflow` guarding
- [engine](./engine.md): unit execution engines (workflow by default, sub-agent fallback, root opt-in)
- [auto](./auto.md): `/craftsman:auto`, the single entry with question phases before and after an unattended run
- [mod](./mod.md): the launcher, telemetry and progress-band mod
- [tracker](./tracker.md): the ledger, the derived run manifest, and parked decisions
- [landing](./landing.md): git authority, multi-repo landing order, and submodule bumps
- [plan](./plan.md): epic > story > feature > unit, plan-index, rollups, `--level`, waves and progress publishing
- [docs](./docs.md): plan-doc retirement, `/sync-docs --archive` / `--prune`, and the commit-id archive index
- [slim](./slim.md): byte caps per file and per invocation, the ratchet, and how a trim keeps gate strength
- [views](./views.md): the local visual dashboard (`/digest --html`) and the `NEXT.md` session queue
