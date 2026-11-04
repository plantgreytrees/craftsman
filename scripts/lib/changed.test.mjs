// ARCH-STATE-21: the session change list (sessions/<sid>/changed, one POSIX root-relative path per line, appended by
// quality-gate beside `dirty`) and the `{changed}` / `{changedDirs}` placeholders that expand from it - whole argv
// tokens only, no shell, no joining. A missing list is unknown (null), an empty one is empty ([]).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { recordChanged, readChanged, hasChangePlaceholder, embeddedChangePlaceholder, isScoped, expandChangePlaceholders } from "./changed.mjs";

const QUALITY_GATE = fileURLToPath(new URL("../quality-gate.mjs", import.meta.url));

const scratch = (prefix = "changed-") => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
function put(root, rel, text = "x\n") {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

// ------------------------------------------------------- recordChanged / readChanged ---

test("recordChanged appends one path per line, creating the session directory", () => {
  const dir = path.join(scratch(), "sessions", "s1");
  assert.equal(recordChanged(dir, "a.js"), true);
  assert.equal(fs.readFileSync(path.join(dir, "changed"), "utf8"), "a.js\n");
  recordChanged(dir, "svc/src/b.js");
  assert.equal(fs.readFileSync(path.join(dir, "changed"), "utf8"), "a.js\nsvc/src/b.js\n", "appended, not rewritten");
});

test("readChanged dedupes and keeps the first-seen order, while the file stays append-only", () => {
  const dir = scratch();
  for (const p of ["a.js", "b.js", "a.js", "svc/c.js", "b.js"]) recordChanged(dir, p);
  assert.deepEqual(readChanged(dir), ["a.js", "b.js", "svc/c.js"]);
  assert.equal(fs.readFileSync(path.join(dir, "changed"), "utf8").split("\n").filter(Boolean).length, 5, "every append is kept");
});

test("readChanged: a missing file is unknown (null), an empty file is the empty list", () => {
  const dir = scratch();
  assert.equal(readChanged(dir), null, "no file yet");
  assert.equal(readChanged(path.join(dir, "no", "such", "dir")), null, "no directory either");
  fs.writeFileSync(path.join(dir, "changed"), "");
  assert.deepEqual(readChanged(dir), []);
  fs.writeFileSync(path.join(dir, "changed"), "\n\n");
  assert.deepEqual(readChanged(dir), [], "blank lines are not paths");
});

test("readChanged: a changed list that cannot be read is unknown, not empty", () => {
  const dir = scratch();
  fs.mkdirSync(path.join(dir, "changed"));
  assert.equal(readChanged(dir), null);
});

test("recordChanged keeps a path with spaces whole", () => {
  const dir = scratch();
  recordChanged(dir, "svc/my dir/a b.js");
  assert.deepEqual(readChanged(dir), ["svc/my dir/a b.js"]);
});

test("recordChanged refuses a path it cannot hold on one line, and writes nothing", () => {
  const dir = scratch();
  for (const bad of ["a\nb.js", "a\r.js", "", undefined, null, 7]) assert.equal(recordChanged(dir, bad), false, JSON.stringify(bad));
  assert.equal(readChanged(dir), null, "no file was created for the refusals");
});

// ------------------------------------------- hasChangePlaceholder / embeddedChangePlaceholder ---

test("hasChangePlaceholder: true when a whole token is {changed} or {changedDirs}", () => {
  assert.equal(hasChangePlaceholder("eslint {changed}"), true);
  assert.equal(hasChangePlaceholder("go test {changedDirs}"), true);
  assert.equal(hasChangePlaceholder("{changed}"), true);
  assert.equal(hasChangePlaceholder("tool --flag {changedDirs} --other {changed}"), true);
  assert.equal(hasChangePlaceholder('tool "{changed}"'), true, "quotes around a whole token do not make it embedded");
  assert.equal(hasChangePlaceholder("tool '{changedDirs}'"), true);
});

test("hasChangePlaceholder: an embedded placeholder is not a whole token", () => {
  assert.equal(hasChangePlaceholder("tool --files={changed}"), false);
  assert.equal(hasChangePlaceholder("tool {changed}.bak"), false);
  assert.equal(hasChangePlaceholder("tool pre{changedDirs}"), false);
});

test("embeddedChangePlaceholder: true when the text sits inside a longer token", () => {
  assert.equal(embeddedChangePlaceholder("tool --files={changed}"), true);
  assert.equal(embeddedChangePlaceholder("tool {changed}.bak"), true);
  assert.equal(embeddedChangePlaceholder("tool pre{changedDirs}post"), true);
  assert.equal(embeddedChangePlaceholder('tool "--dirs={changedDirs}"'), true);
  assert.equal(embeddedChangePlaceholder("tool {changed} --files={changed}"), true, "one whole and one embedded is still embedded");
});

test("neither helper fires on a command with no placeholder, a whole token alone, or look-alikes", () => {
  for (const cmd of ["npm test", "node --test", "tool {file} {dir}", "tool {changedX}", "tool {change}", "tool changed", ""]) {
    assert.equal(hasChangePlaceholder(cmd), false, cmd);
    assert.equal(embeddedChangePlaceholder(cmd), false, cmd);
  }
  assert.equal(embeddedChangePlaceholder("eslint {changed}"), false, "a whole token is not embedded");
  assert.equal(embeddedChangePlaceholder("go test {changedDirs}"), false);
  for (const v of [undefined, null, 7, ["{changed}"]]) {
    assert.equal(hasChangePlaceholder(v), false);
    assert.equal(embeddedChangePlaceholder(v), false);
  }
});

// -------------------------------------------------------- expandChangePlaceholders ---

const root = path.resolve("/work/repo");
const svc = path.join(root, "svc");

test("expand: a whole {changed} token becomes one argv entry per file, spaces kept, POSIX, relative to cwd", () => {
  const files = ["svc/src/a.js", "svc/my dir/b c.js", "svc/top.js"];
  assert.deepEqual(expandChangePlaceholders("eslint --max-warnings 0 {changed}", files, { cwd: svc, root }), {
    argv: ["eslint", "--max-warnings", "0", "src/a.js", "my dir/b c.js", "top.js"],
  });
  assert.deepEqual(expandChangePlaceholders("tool {changed}", ["svc/src/a.js", "other/x.js", "r.js"], { cwd: svc, root }), {
    argv: ["tool", "src/a.js", "../other/x.js", "../r.js"],
  }, "a file above the cwd is still a correct relative path");
});

test("expand: with cwd at the root the paths stay root-relative; cwd defaults to the root", () => {
  assert.deepEqual(expandChangePlaceholders("t {changed}", ["svc/a.js", "b.js"], { cwd: root, root }), { argv: ["t", "svc/a.js", "b.js"] });
  assert.deepEqual(expandChangePlaceholders("t {changed}", ["svc/a.js"], { root }), { argv: ["t", "svc/a.js"] });
});

test("expand: {changedDirs} is the sorted unique dirnames, '.' for a top-level file", () => {
  const files = ["svc/b/x.js", "svc/a/y.js", "svc/a/z.js", "svc/top.js", "svc/b/w.js", "svc/a/deep/q.js"];
  assert.deepEqual(expandChangePlaceholders("go test {changedDirs}", files, { cwd: svc, root }), {
    argv: ["go", "test", ".", "a", "a/deep", "b"],
  });
  assert.deepEqual(expandChangePlaceholders("go test {changedDirs}", ["z/a.go", "a.go", "z/b.go"], { cwd: root, root }), {
    argv: ["go", "test", ".", "z"],
  });
});

test("expand: both placeholders in one command, each as its own tokens, and the rest untouched", () => {
  const r = expandChangePlaceholders('tool --label "two words" {changedDirs} -- {changed}', ["svc/b/x.js", "svc/a/y.js"], { cwd: svc, root });
  assert.deepEqual(r, { argv: ["tool", "--label", "two words", "a", "b", "--", "b/x.js", "a/y.js"] });
});

test("expand: a file named like a placeholder is one literal argument, never expanded again", () => {
  assert.deepEqual(expandChangePlaceholders("t {changed}", ["{changedDirs}"], { cwd: root, root }), { argv: ["t", "{changedDirs}"] });
});

test("expand: an empty file set skips a placeholder command with no-changes", () => {
  assert.deepEqual(expandChangePlaceholders("eslint {changed}", [], { cwd: svc, root }), { skip: "no-changes" });
  assert.deepEqual(expandChangePlaceholders("go test {changedDirs}", [], { cwd: svc, root }), { skip: "no-changes" });
});

test("expand: an unknown file set (null) skips with changes-unknown, never as if it were empty", () => {
  assert.deepEqual(expandChangePlaceholders("eslint {changed}", null, { cwd: svc, root }), { skip: "changes-unknown" });
  assert.deepEqual(expandChangePlaceholders("eslint {changed}", undefined, { cwd: svc, root }), { skip: "changes-unknown" });
});

test("expand: a command with no placeholder is just split, whatever the file set", () => {
  assert.deepEqual(expandChangePlaceholders('npm test -- "a b"', [], { cwd: root, root }), { argv: ["npm", "test", "--", "a b"] });
  assert.deepEqual(expandChangePlaceholders("npm test", ["a.js"], { cwd: root, root }), { argv: ["npm", "test"] });
  assert.deepEqual(expandChangePlaceholders("npm test", null, { cwd: root, root }), { argv: ["npm", "test"] });
});

test("expand: an embedded placeholder stays literal, runs nothing and warns", () => {
  const files = ["svc/a.js"];
  assert.deepEqual(expandChangePlaceholders("tool --files={changed}", files, { cwd: svc, root }), { warn: "embedded-placeholder" });
  assert.deepEqual(expandChangePlaceholders("tool pre{changedDirs}post", files, { cwd: svc, root }), { warn: "embedded-placeholder" });
  assert.deepEqual(expandChangePlaceholders("tool {changed} --files={changed}", files, { cwd: svc, root }), { warn: "embedded-placeholder" }, "a whole token beside an embedded one does not rescue it");
  assert.deepEqual(expandChangePlaceholders("tool --files={changed}", [], { cwd: svc, root }), { warn: "embedded-placeholder" }, "a config fault is a fault whatever the file set");
});

test("expand: a relative path that starts with '-' gets './' so a tool never reads it as an option", () => {
  assert.deepEqual(expandChangePlaceholders("tool {changed}", ["-rf.js"], { cwd: root, root }), { argv: ["tool", "./-rf.js"] });
  assert.deepEqual(expandChangePlaceholders("tool {changed}", ["svc/-a.js", "svc/ok.js", "svc/-x/b.js", "svc/--force"], { cwd: svc, root }), {
    argv: ["tool", "./-a.js", "ok.js", "./-x/b.js", "./--force"],
  }, "the prefix lands wherever the relative path starts with a dash, and nowhere else");
  assert.deepEqual(expandChangePlaceholders("tool {changed}", ["svc/a-b.js", "other/-c.js"], { cwd: svc, root }), {
    argv: ["tool", "a-b.js", "../other/-c.js"],
  }, "a dash inside a path, or after a '..', is not a leading dash");
});

test("expand: {changedDirs} prefixes a directory named with a leading '-', and '.' stays '.'", () => {
  assert.deepEqual(expandChangePlaceholders("go test {changedDirs}", ["-rf.js", "-x/a.js", "svc/b.js"], { cwd: root, root }), {
    argv: ["go", "test", ".", "./-x", "svc"],
  });
  assert.deepEqual(expandChangePlaceholders("go test {changedDirs}", ["svc/-x/a.js", "svc/-x/deep/b.js", "svc/c.js"], { cwd: svc, root }), {
    argv: ["go", "test", ".", "./-x", "./-x/deep"],
  });
});

test("expand: a command with no whole placeholder is left alone, dashes in its own arguments included", () => {
  assert.deepEqual(expandChangePlaceholders("tool -rf --force", ["-rf.js"], { cwd: root, root }), { argv: ["tool", "-rf", "--force"] });
});

// ------------------------------------------------------------------------- isScoped ---

test("isScoped: a whole token, an embedded placeholder, or both, makes a command scoped", () => {
  for (const cmd of ["eslint {changed}", "go test {changedDirs}", "{changed}", "tool --files={changed}", "tool {changed}.bak", "tool pre{changedDirs}post",
    "tool {changed} --files={changed}", 'tool "{changed}"', 'tool "--dirs={changedDirs}"']) {
    assert.equal(isScoped(cmd), true, cmd);
  }
});

test("isScoped: a plain command, a look-alike and a non-string are not scoped", () => {
  for (const cmd of ["npm test", "node --test", "tool {file} {dir}", "tool {changedX}", "tool {change}", "tool changed", ""]) {
    assert.equal(isScoped(cmd), false, cmd);
  }
  for (const v of [undefined, null, 7, ["{changed}"]]) assert.equal(isScoped(v), false);
});

test("isScoped is exactly: has a whole placeholder token, or has an embedded one", () => {
  for (const cmd of ["eslint {changed}", "tool --files={changed}", "tool {changed} --files={changed}", "npm test", "tool {changedX}"]) {
    assert.equal(isScoped(cmd), hasChangePlaceholder(cmd) || embeddedChangePlaceholder(cmd), cmd);
  }
});

// ------------------------------------------------------- quality-gate records the path ---

// A git repo with a `fixture` language (".fx" files) whose check always passes.
function gateRepo() {
  const root = scratch("changed-gate-");
  for (const a of [["init", "-q"], ["config", "user.email", "t@e.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"]])
    spawnSync("git", a, { cwd: root });
  put(root, "README.md", "fixture\n");
  put(root, "craftsman.config.json", JSON.stringify({
    security: { enabled: false },
    stopGate: { requireAcceptanceCriteria: false },
    languages: { fixture: { extensions: [".fx"], check: ["node -e 0"] } },
  }));
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  return root;
}

function edit(root, sid, rel, content = "x\n", { absolute = false } = {}) {
  const file = absolute ? put(path.dirname(rel), path.basename(rel), content) : put(root, rel, content);
  const env = { ...process.env };
  for (const k of ["CLAUDE_CODE_SESSION_ID", "CLAUDE_PROJECT_DIR", "CRAFTSMAN_WORKSPACE_MANIFEST"]) delete env[k];
  return spawnSync(process.execPath, [QUALITY_GATE], {
    cwd: root, encoding: "utf8", env,
    input: JSON.stringify({ session_id: sid, tool_name: "Edit", tool_input: { file_path: file } }),
  });
}

const sdirOf = (root, sid) => path.join(root, ".craftsman", "sessions", sid);

test("quality-gate: after one source edit the session change list holds its root-relative POSIX path", () => {
  const root = gateRepo();
  const r = edit(root, "chg-src", "svc/src/a.fx");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(sdirOf(root, "chg-src"), "dirty")), "the dirty marker is set as ever");
  assert.equal(fs.readFileSync(path.join(sdirOf(root, "chg-src"), "changed"), "utf8"), "svc/src/a.fx\n");
});

test("quality-gate: a second edit of the same file and an edit of another both land in the list, deduped on read", () => {
  const root = gateRepo();
  edit(root, "chg-two", "svc/src/a.fx", "1\n");
  edit(root, "chg-two", "svc/my dir/b.fx", "1\n");
  edit(root, "chg-two", "svc/src/a.fx", "2\n");
  assert.deepEqual(readChanged(sdirOf(root, "chg-two")), ["svc/src/a.fx", "svc/my dir/b.fx"]);
});

test("quality-gate: a docs-only edit sets no dirty marker and leaves the change list absent", () => {
  const root = gateRepo();
  const r = edit(root, "chg-doc", "docs/notes.md", "# notes\n");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(sdirOf(root, "chg-doc"), "dirty")), false);
  assert.equal(fs.existsSync(path.join(sdirOf(root, "chg-doc"), "changed")), false);
  assert.equal(readChanged(sdirOf(root, "chg-doc")), null, "still unknown, not empty");
});

test("quality-gate: a file outside the project root has no root-relative path, so it stays out of the list", () => {
  const root = gateRepo();
  const outside = path.join(scratch("changed-outside-"), "stray.fx");
  edit(root, "chg-out", outside, "x\n", { absolute: true });
  edit(root, "chg-out", "svc/in.fx");
  assert.deepEqual(readChanged(sdirOf(root, "chg-out")), ["svc/in.fx"]);
});

test("quality-gate: a source edit after a docs edit records only the source path", () => {
  const root = gateRepo();
  edit(root, "chg-mix", "README.md", "# changed\n");
  edit(root, "chg-mix", "svc/a.fx");
  assert.deepEqual(readChanged(sdirOf(root, "chg-mix")), ["svc/a.fx"]);
});
