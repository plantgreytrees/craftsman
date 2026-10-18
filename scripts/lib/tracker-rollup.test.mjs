import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIndex } from "./plan-index.mjs";
import { rollupPath, renderRollup, rollupBlock, rollupStatus, rollupSlugs, writeRollups } from "./tracker-rollup.mjs";

const idx = () => buildIndex([
  { slug: "e", text: "---\nslug: e\nlevel: epic\nchildren: [s, f2]\n---\n" },
  { slug: "s", text: "---\nslug: s\nlevel: story\nparent: e\nfeatures:\n  - id: a\n    units: [1, 2]\n  - id: b\n    units: [3]\n---\n" },
  { slug: "f2", text: "---\nslug: f2\nparent: e\nunits:\n  - id: x\n---\n" },
]);
const row = (plan, unit, status) => ({ plan: `docs/plans/${plan}.md`, unit, status });
const rows = [row("s", "1", "COMPLETE"), row("s", "2", "MERGED"), row("s", "3", "COMPLETE"), row("f2", "x", "COMPLETE")];

test("10.1 epic rollup snapshot on a fixture ledger", () => {
  assert.equal(renderRollup("e", idx(), rows), `<!-- craftsman:rollup:begin -->
<!-- Generated from the tracker ledger by scripts/lib/tracker-rollup.mjs. Do not edit by hand. -->

# e (epic)

Plan: [e](../e.md)

**Status: IN_PROGRESS** — 3/4 rows COMPLETE (75%)

Counts: MERGED 1, COMPLETE 3

| child | status | complete | percent | link |
|---|---|---|---|---|
| s | IN_PROGRESS | 2/3 | 66% | [s](../s/TRACKER.md) |
| f2 | COMPLETE | 1/1 | 100% | [f2](../f2.md) |

<!-- craftsman:rollup:end -->`);
});

test("10.1 story rollup snapshot and COMPLETE only when every row is COMPLETE", () => {
  assert.equal(renderRollup("s", idx(), rows), `<!-- craftsman:rollup:begin -->
<!-- Generated from the tracker ledger by scripts/lib/tracker-rollup.mjs. Do not edit by hand. -->

# s (story)

Plan: [s](../s.md)

**Status: IN_PROGRESS** — 2/3 rows COMPLETE (66%)

Counts: MERGED 1, COMPLETE 2

| feature | unit | status |
|---|---|---|
| a | 1 | COMPLETE |
| a | 2 | MERGED |
| b | 3 | COMPLETE |

<!-- craftsman:rollup:end -->`);
  assert.equal(rollupStatus([row("s", "1", "COMPLETE")]), "COMPLETE");
  assert.equal(rollupStatus([row("s", "1", "COMPLETE"), row("s", "2", "MERGED")]), "IN_PROGRESS");
  assert.equal(rollupStatus([]), "PENDING");
  const done = rows.map((r) => ({ ...r, status: "COMPLETE" }));
  assert.match(renderRollup("e", idx(), done), /Status: COMPLETE\*\*/);
});

test("10.1 writeRollups writes epics and stories only, idempotently, keeping text outside the fence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-rollup-"));
  try {
    assert.deepEqual(rollupSlugs(idx()), ["e", "s"]);
    assert.equal(writeRollups(root, idx(), rows).length, 2);
    assert.equal(writeRollups(root, idx(), rows).length, 0);
    const file = path.join(root, "docs", "plans", "s", "TRACKER.md");
    fs.appendFileSync(file, "\nNotes.\n");
    writeRollups(root, idx(), rows.map((r) => ({ ...r, status: "COMPLETE" })));
    const text = fs.readFileSync(file, "utf8");
    assert.match(rollupBlock(text), /Status: COMPLETE/);
    assert.match(text, /Notes\./);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("10.1 rollupPath and writeRollups never write outside docs/plans for slug ../..", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-rollup-"));
  try {
    assert.throws(() => rollupPath(root, "../.."), /outside docs\/plans/);
    assert.throws(() => rollupPath(root, ".."), /outside docs\/plans/);
    assert.throws(() => buildIndex([{ slug: "x", text: "---\nslug: ../..\nlevel: epic\n---\n" }]), /invalid plan slug/);
    const evil = { nodes: new Map([["../..", { slug: "../..", level: "epic", derived: false, children: [], features: [] }]]), get: (s) => (s === "../.." ? { slug: s, level: "epic", children: [], features: [] } : undefined) };
    assert.throws(() => writeRollups(root, evil, []), /outside docs\/plans/);
    assert.deepEqual(fs.readdirSync(root), []);
    assert.match(rollupPath(root, "ok"), /docs\/plans\/ok\/TRACKER\.md$/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
