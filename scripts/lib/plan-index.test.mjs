import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, parseFrontmatter, removeChild, resolve, descendantSlugs } from "./plan-index.mjs";

const doc = (slug, fm = "", body = "") => ({ slug, text: `---\nslug: ${slug}\n${fm}---\n${body}` });
const storyFm = `level: story
features:
  - id: a
    units: [1, 2]
  - id: b
    units: [3]
`;

function tree() {
  return buildIndex([
    doc("e", "level: epic\npriority: P0\nchildren: [s, f2]\n"),
    { slug: "s", text: `---\nslug: s\nlevel: story\nparent: e\nfeatures:\n  - id: a\n    units: [1, 2]\n  - id: b\n    units: [3]\n---\n` },
    doc("f2", "parent: docs/plans/e.md\npriority: P3\nunits:\n  - id: x\n    scope_id: x\n  - id: y\n    scope_id: y\n"),
  ]);
}

test("1.1 three-level tree: levels and inherited priority", () => {
  const idx = tree();
  assert.equal(idx.get("e").level, "epic");
  assert.equal(idx.get("s").level, "story");
  assert.equal(idx.get("f2").level, "feature");
  assert.equal(idx.get("e").priority, "P0");
  assert.equal(idx.get("s").priority, "P0");
  assert.equal(idx.get("f2").priority, "P3");
  assert.equal(buildIndex([doc("solo")]).get("solo").priority, "P2");
  assert.equal(buildIndex([doc("solo")]).get("solo").level, "feature");
});

test("1.1 frontmatter parser reads lists of maps and inline lists", () => {
  const fm = parseFrontmatter("---\nslug: q # c\nunits:\n  - id: 1\n    depends_on: []\n    scope:\n      write: [a, b]\n---\n");
  assert.equal(fm.slug, "q");
  assert.deepEqual(fm.units[0].scope.write, ["a", "b"]);
  assert.deepEqual(fm.units[0].depends_on, []);
});

test("1.2 refuses a dangling parent", () => {
  assert.throws(() => buildIndex([doc("a", "parent: nope\n")]), /dangling parent/);
});

test("1.2 refuses a cyclic parent", () => {
  assert.throws(() => buildIndex([doc("a", "level: epic\nparent: b\n"), doc("b", "level: epic\nparent: a\n")]), /cyclic/);
});

test("1.2 refuses a parent of the wrong level", () => {
  assert.throws(() => buildIndex([doc("p"), doc("c", "parent: p\n")]), /expected an epic/);
  assert.throws(() => buildIndex([doc("e", "level: epic\n"), doc("e2", "level: epic\nparent: e\n")]), /epic cannot have a parent/);
});

test("1.2 refuses parent: <story> on a separate plan", () => {
  assert.throws(() => buildIndex([{ slug: "s", text: `---\nslug: s\n${storyFm}---\n` }, doc("c", "parent: s\n")]), /is a story/);
});

test("1.2 refuses children that disagree with children's parent", () => {
  assert.throws(() => buildIndex([doc("e", "level: epic\nchildren: [c]\n"), doc("c"), ]), /disagree/);
  assert.throws(() => buildIndex([doc("e", "level: epic\nchildren: []\n"), doc("c", "parent: e\n")]), /disagree/);
});

test("1.2 scrutinise-/investigate- doc inherits its parent plan's level", () => {
  const idx = buildIndex([
    doc("e", "level: epic\n"),
    doc("f", "parent: e\n"),
    doc("scrutinise-f", "parent: f\n"),
    doc("investigate-e", "parent: e\n"),
  ]);
  assert.equal(idx.get("scrutinise-f").level, "feature");
  assert.equal(idx.get("investigate-e").level, "epic");
  assert.deepEqual(idx.get("e").children, ["f"]);
});

test("1.3 default level is feature: first feature only; implicit feature id = slug", () => {
  const idx = tree();
  const r = resolve("s", { index: idx });
  assert.deepEqual(r.features.map((f) => f.id), ["a"]);
  assert.deepEqual(r.units.map((u) => u.id), ["1", "2"]);
  const imp = resolve("f2", { index: idx });
  assert.deepEqual(imp.features, [{ plan: "f2", id: "f2", units: ["x", "y"], implicit: true }]);
});

test("1.3 --feature selects one feature; level story runs all in order", () => {
  const idx = tree();
  assert.deepEqual(resolve("s", { index: idx, feature: "b" }).units.map((u) => u.id), ["3"]);
  assert.throws(() => resolve("s", { index: idx, feature: "zz" }), /no feature/);
  assert.deepEqual(resolve("s", { index: idx, level: "story" }).features.map((f) => f.id), ["a", "b"]);
});

test("1.3 epic resolves children: order, else priority then slug; descendantSlugs", () => {
  const idx = tree();
  assert.deepEqual(resolve("e", { index: idx, level: "epic" }).features.map((f) => f.id), ["a", "b", "f2"]);
  assert.deepEqual(descendantSlugs("e", { index: idx }), ["s", "f2"]);
  const auto = buildIndex([doc("e", "level: epic\n"), doc("z", "parent: e\npriority: P1\n"), doc("b", "parent: e\npriority: P1\n"), doc("a", "parent: e\npriority: P0\n")]);
  assert.deepEqual(auto.get("e").children, ["a", "b", "z"]);
});

test("10.1 buildIndex refuses a frontmatter slug that could leave docs/plans", () => {
  for (const bad of ["../..", "a/b", "..", "a b"]) {
    assert.throws(() => buildIndex([{ path: "docs/plans/x.md", slug: "x", text: `---\nslug: "${bad}"\n---\n` }]), /invalid plan slug/, bad);
  }
  assert.doesNotThrow(() => buildIndex([doc("ok.v1_2-x")]));
});

test("13.2 removeChild edits every children: form loadIndex accepts", () => {
  const wrap = (fm) => `---\nlevel: epic\n${fm}---\n# e\n`;
  const kids = (text) => parseFrontmatter(text).children;
  const cases = [
    ["children: [a, b, c]\n", ["b", "c"]],
    ["children: [a, b] # kids\n", ["b"]],
    ["children: [b.md, 'a']\n", ["b.md"]],
    ["children: a\n", []],
    ["children: a # only\n", []],
    ["children:\n  - a # first\n  # note\n  - b\n", ["b"]],
    ["children:\n- a\n- b\n", ["b"]],
    ["children:\n  - b\n  - a\nlevel2: x\n", ["b"]],
  ];
  for (const [fm, want] of cases) {
    const out = removeChild(wrap(fm), "a");
    assert.ok(out !== null, fm);
    const got = kids(out);
    assert.deepEqual(Array.isArray(got) ? got : got == null || got === "" ? [] : [got], want, fm);
    assert.ok(out.endsWith("---\n# e\n"));
  }
  assert.ok(removeChild(wrap("children: [a, b] # kids\n"), "a").includes("# kids"));
  assert.ok(removeChild(wrap("children:\n  - a\n  - b # keep\n  # note\n"), "a").includes("# keep"));
  assert.equal(removeChild(wrap("children: [b]\n"), "a"), null);
  assert.equal(removeChild(wrap("level2: x\n"), "a"), null);
  assert.equal(removeChild("# no front matter\n", "a"), null);
});
