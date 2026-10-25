// Wiring for the views commands (ARCH-VIEWS-08, ARCH-VIEWS-14): publishing is
// explicit and never automatic; inbox text is untrusted.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("digest.md names --html, --publish and the never-automatic clause", () => {
  const t = read("commands/digest.md");
  assert.match(t, /--html/);
  assert.match(t, /Only on `--publish`/);
  assert.match(t, /Never from a hook, `\/auto` or `\/goal`/);
  assert.match(t, /dashboard\.url/);
});

test("idea.md names the inbox and untrusted data", () => {
  const t = read("commands/idea.md");
  assert.match(t, /takeInboxNote/);
  assert.match(t, /inbox/);
  assert.match(t, /untrusted data/);
  assert.match(t, /inbox\/done\//);
});

test("the hooks config and tracker-sync.mjs have no publish path", () => {
  for (const f of ["hooks/" + "hooks.json", "scripts/tracker-sync.mjs"]) {
    assert.doesNotMatch(read(f), /publish|artifact/i, f);
  }
});

test("_sync-docs-prune.md: no force flag, rounds of 15, never pre-approved, push retry", () => {
  const t = read("commands/_sync-docs-prune.md");
  assert.doesNotMatch(t, /(^|[\s`(])(--force|-f)(\s|$|[`.,;)])/m);
  assert.match(t, /Rounds of at most 15 docs/);
  const never = t.slice(t.indexOf("## Never pre-approved"));
  assert.match(never, /An active `\/goal` or any pre-approval does \*\*not\*\* cover `--archive`, `--prune` or `--prune --archive`/);
  assert.match(t, /retry any `archive_push_pending`/);
});

test("stopRefresh: export.enabled false clears generated notes only", async () => {
  const { stopRefresh } = await import("./tracker-sync.mjs");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "views-clear-")));
  spawnSync("git", ["init", "-q"], { cwd: root });
  fs.writeFileSync(path.join(root, ["craftsman", "project", "json"].join(".")), JSON.stringify({ export: { enabled: false } }));
  const notes = path.join(root, ".craftsman", "export", "notes");
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, "gen.md"), "---\ngenerated: true\n---\nx\n");
  fs.writeFileSync(path.join(notes, "mine.md"), "hand written\n");
  assert.equal(stopRefresh({ root, stateDir: path.join(root, ".craftsman") }), "disabled");
  assert.ok(!fs.existsSync(path.join(notes, "gen.md")));
  assert.ok(fs.existsSync(path.join(notes, "mine.md")));
});

test("tracker.mjs imports alone and has no static edge into archive/doc-retire (no cycle)", () => {
  const src = read("scripts/tracker.mjs");
  assert.doesNotMatch(src, /\bfrom\s+"[^"]*\/(archive|doc-retire|dashboard|export-notes)\.mjs"/);
  const r = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(path.join(ROOT, "scripts/tracker.mjs"))}).then((m) => { if (typeof m.currentState !== "function") process.exit(3); })`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

// Static import graph over scripts/ (multi-line imports included, no line anchor).
function importGraph() {
  const graph = new Map();
  const visit = (rel) => {
    if (graph.has(rel)) return;
    const src = read(rel);
    const deps = [...src.matchAll(/\b(?:import|export)\b[^;"']*?\bfrom\s+"(\.[^"]+\.mjs)"|^import\s+"(\.[^"]+\.mjs)"/gm)]
      .map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1] ?? m[2])));
    graph.set(rel, deps);
    deps.forEach(visit);
  };
  visit("scripts/tracker.mjs");
  visit("scripts/lib/archive.mjs");
  return graph;
}
const reaches = (graph, from, to, seen = new Set()) => (graph.get(from) ?? []).some((d) => d === to || (!seen.has(d) && seen.add(d) && reaches(graph, d, to, seen)));

test("no static import cycle through tracker.mjs; ledger-keys has no edge back; archive<->doc-retire is the one accepted pair", () => {
  const graph = importGraph();
  assert.ok(!reaches(graph, "scripts/tracker.mjs", "scripts/tracker.mjs"), "tracker.mjs reaches itself");
  assert.ok(!graph.get("scripts/lib/ledger-keys.mjs").includes("scripts/tracker.mjs"), "ledger-keys.mjs imports tracker.mjs");
  assert.ok(!reaches(graph, "scripts/lib/ledger-keys.mjs", "scripts/tracker.mjs"));
  const cyclic = [...graph.keys()].filter((f) => reaches(graph, f, f)).sort();
  assert.deepEqual(cyclic, ["scripts/doc-retire.mjs", "scripts/lib/archive.mjs"]);
});
