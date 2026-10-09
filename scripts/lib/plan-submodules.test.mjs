import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { orderSteps, validateSteps } from "../plan-graph.mjs";
import { gitlinkAt, submoduleParents } from "./plan-submodules.mjs";

// ARCH-LAND-03 enforced: a registered project nested in another's root, with a
// gitlink in that parent, is a submodule; its parent needs a `bumps` step that
// lands after all its steps.
const nested = { projects: {
  app: { id: "app", root: "/w/app" },
  lib: { id: "lib", root: "/w/app/vendor/lib" },
  deep: { id: "deep", root: "/w/app/vendor/lib/third/deep" },
  other: { id: "other", root: "/w/other" },
} };
const linked = () => true;
const check = (steps, isGitlink = linked) => validateSteps(steps, { workspace: nested, isGitlink });
const step = (id, depends_on, project) => ({ id, scope_id: id, project, depends_on });
const bump = (id, bumps, depends_on, project) => ({ ...step(id, depends_on, project), bumps });

test("submoduleParents: the nearest enclosing registered root is the parent; a sibling prefix is not", () => {
  const parents = submoduleParents({ projects: { ...nested.projects, appx: { id: "appx", root: "/w/appx" } } }, linked);
  assert.deepEqual(Object.fromEntries(parents), { lib: "app", deep: "lib" });
});

test("submoduleParents: nesting without a gitlink is not a submodule (R13-W1, ARCH-LAND-04)", () => {
  assert.deepEqual(Object.fromEntries(submoduleParents(nested, () => false)), {});
  // A nested independent clone needs no bump.
  assert.equal(check([step("lib-change", [], "lib"), step("consumer", ["lib-change"], "app")], () => false).length, 2);
  // A project rooted at the workspace root encloses every other project.
  const rooted = { projects: { top: { id: "top", root: "/w" }, app: { id: "app", root: "/w/app" } } };
  assert.equal(validateSteps([step("a", [], "app")], { workspace: rooted, isGitlink: () => false }).length, 1);
  const seen = [];
  submoduleParents(nested, (parent, child) => { seen.push([parent, child]); return false; });
  assert.deepEqual(seen.find(([, child]) => child === "/w/app/vendor/lib/third/deep"), ["/w/app/vendor/lib", "/w/app/vendor/lib/third/deep"]);
});

test("gitlinkAt: reads a mode-160000 entry from the parent's index, nothing else", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-gitlink-"));
  try {
    const git = (...args) => execFileSync("git", ["-C", parent, ...args], { stdio: "ignore" });
    git("init", "-q");
    git("update-index", "--add", "--cacheinfo", `160000,${"a".repeat(40)},vendor/lib`);
    fs.mkdirSync(path.join(parent, "vendor", "plain"), { recursive: true });
    fs.writeFileSync(path.join(parent, "vendor", "plain", "f.txt"), "x\n");
    git("add", "vendor/plain/f.txt");
    assert.equal(gitlinkAt(parent, path.join(parent, "vendor", "lib")), true);
    assert.equal(gitlinkAt(parent, path.join(parent, "vendor", "plain")), false);
    assert.equal(gitlinkAt(parent, path.join(parent, "vendor")), false);
    // A `:`-prefixed name is a literal path, not pathspec magic (R14-S3).
    git("update-index", "--add", "--cacheinfo", `160000,${"b".repeat(40)},:odd`);
    assert.equal(gitlinkAt(parent, path.join(parent, ":odd")), true);
    // An unreadable index fails closed (R14-S2).
    assert.throws(() => gitlinkAt(path.join(parent, "missing"), path.join(parent, "missing", "x")), /cannot read the git index/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("validateSteps: a gitlink in an unregistered workspace-root superproject is refused, not skipped (R14-W1)", () => {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-super-"));
  try {
    execFileSync("git", ["-C", top, "init", "-q"], { stdio: "ignore" });
    execFileSync("git", ["-C", top, "update-index", "--add", "--cacheinfo", `160000,${"c".repeat(40)},lib`], { stdio: "ignore" });
    const workspace = { workspaceRoot: top, projects: {
      lib: { id: "lib", root: path.join(top, "lib") },
      app: { id: "app", root: path.join(top, "app") },
    } };
    assert.throws(() => validateSteps([step("lib-change", [], "lib")], { workspace }), /superproject, which is not registered/);
    // app has no gitlink in the superproject: no bump needed.
    assert.equal(validateSteps([step("a", [], "app")], { workspace }).length, 1);
    // Registering the workspace root makes it the parent that carries the bump.
    const registered = { ...workspace, projects: { ...workspace.projects, top: { id: "top", root: top } } };
    assert.throws(() => validateSteps([step("lib-change", [], "lib")], { workspace: registered }), /need a bump step in top/);
    assert.equal(validateSteps([step("lib-change", [], "lib"), bump("bump-lib", "lib", ["lib-change"], "top")], { workspace: registered }).length, 2);
  } finally { fs.rmSync(top, { recursive: true, force: true }); }
});

test("validateSteps: a submodule's steps need a bump step in its parent (ARCH-LAND-03)", () => {
  assert.throws(() => check([step("lib-change", [], "lib"), step("consumer", ["lib-change"], "app")]),
    /submodule lib need a bump step in app/);
});

test("validateSteps: the bump step must depend on every submodule step, directly or transitively (ARCH-LAND-03)", () => {
  assert.throws(() => check([
    step("lib-a", [], "lib"), step("lib-b", [], "lib"), bump("bump-lib", "lib", ["lib-a"], "app"),
  ]), /bump step bump-lib must depend on submodule step lib-b/);
  const steps = check([
    step("lib-a", [], "lib"), step("lib-b", ["lib-a"], "lib"), bump("bump-lib", "lib", ["lib-b"], "app"),
  ]);
  assert.equal(steps.length, 3);
});

test("validateSteps: bumps must name a submodule of the step's own project (ARCH-LAND-03)", () => {
  const sub = step("lib-change", [], "lib");
  assert.throws(() => check([sub, bump("bump-lib", "lib", ["lib-change"], "other")]), /not a submodule of its project other/);
  assert.throws(() => check([bump("bump-app", "app", [], "other")]), /not a submodule/);
  assert.throws(() => check([bump("bump-x", 7, [], "app")]), /not a submodule/);
  // deep's nearest enclosing project is lib, not app.
  assert.throws(() => check([step("d", [], "deep"), bump("bump-deep", "deep", ["d"], "app")]), /not a submodule of its project app/);
  const ok = check([
    step("d", [], "deep"), bump("bump-deep", "deep", ["d"], "lib"), bump("bump-lib", "lib", ["bump-deep"], "app"),
  ]);
  assert.deepEqual(orderSteps(ok).map(({ id }) => id), ["d", "bump-deep", "bump-lib"]);
});

test("orderSteps: sub step, then the parent's bump, then the consumer; no manifest means no submodule check", () => {
  const steps = check([
    step("consumer", ["bump-lib"], "app"), bump("bump-lib", "lib", ["lib-change"], "app"), step("lib-change", [], "lib"),
  ]);
  assert.deepEqual(orderSteps(steps).map(({ id }) => id), ["lib-change", "bump-lib", "consumer"]);
  assert.equal(validateSteps([step("lib-change", [], "lib")], { workspace: null }).length, 1);
});
