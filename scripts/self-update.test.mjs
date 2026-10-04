import { test } from "node:test";
import assert from "node:assert/strict";
import { selfUpdate } from "./self-update.mjs";

const ID = "craftsman@craftsman-marketplace";
const before = [
  { id: ID, scope: "user", version: "2.1.0" },
  { id: ID, scope: "project", projectPath: "/p/a", version: "2.1.0" },
  { id: ID, scope: "project", projectPath: "/p/gone", version: "2.1.0" },
  { id: "other@elsewhere", scope: "user", version: "1.0.0" },
];

function fakeRun(after, calls, failFor = null) {
  let listed = 0;
  return (args, cwd) => {
    calls.push([args.join(" "), cwd]);
    if (args[1] === "list") return JSON.stringify(listed++ ? after : before);
    if (args[1] === "update" && cwd === failFor) throw Object.assign(new Error("x"), { stderr: "network down\nmore" });
    return "";
  };
}

test("selfUpdate: refreshes the marketplace once, then updates each install from its own directory", () => {
  const calls = [];
  const after = [
    { id: ID, scope: "user", version: "3f2a9c1d0b4e" },
    { id: ID, scope: "project", projectPath: "/p/a", version: "3f2a9c1d0b4e" },
  ];
  const out = selfUpdate({ run: fakeRun(after, calls), exists: (p) => p !== "/p/gone", home: "/h" });
  assert.deepEqual(out.marketplaces, ["craftsman-marketplace"]);
  assert.deepEqual(calls.filter(([c]) => c.startsWith("plugin marketplace")), [["plugin marketplace update craftsman-marketplace", "/h"]]);
  assert.deepEqual(calls.filter(([c]) => c.startsWith("plugin update")), [
    [`plugin update ${ID} --scope user`, "/h"],
    [`plugin update ${ID} --scope project`, "/p/a"],
  ]);
  assert.deepEqual(out.results.map((r) => [r.scope, r.project, r.status, r.after ?? null]), [
    ["user", null, "updated", "3f2a9c1d0b4e"],
    ["project", "/p/a", "updated", "3f2a9c1d0b4e"],
    ["project", "/p/gone", "skipped", null],
  ]);
});

test("selfUpdate: an unchanged version reads as current, a failure is reported not thrown", () => {
  const calls = [];
  const out = selfUpdate({ run: fakeRun(before, calls, "/p/a"), exists: () => true, home: "/h" });
  const byWhere = Object.fromEntries(out.results.map((r) => [r.project || r.scope, r]));
  assert.equal(byWhere.user.status, "current");
  assert.equal(byWhere["/p/a"].status, "failed");
  assert.equal(byWhere["/p/a"].reason, "network down");
});

test("selfUpdate --dry-run touches nothing", () => {
  const calls = [];
  const out = selfUpdate({ run: fakeRun(before, calls), dryRun: true, exists: () => true, home: "/h" });
  assert.deepEqual(calls.map(([c]) => c), ["plugin list --json"]);
  assert.ok(out.results.every((r) => r.status === "would-update"));
});
