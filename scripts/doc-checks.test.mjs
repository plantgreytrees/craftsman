import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runDocChecks } from "./doc-checks.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doc-checks-"));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const tool = (name, code) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho ran >> "${root}/${name}.log"\nexit ${code}\n`, { mode: 0o755 });
  };
  return { root, bin, tool };
}
const withPath = (bin, fn) => {
  const old = process.env.PATH;
  process.env.PATH = bin;
  try { return fn(); } finally { process.env.PATH = old; }
};

test("doc-checks: a present passing tool runs and passes", () => {
  const f = fixture();
  f.tool("lychee", 0);
  const r = withPath(f.bin, () => runDocChecks({ root: f.root, checks: ["lychee --offline ."] }));
  assert.deepEqual(r, { ok: true, checks: [{ cmd: "lychee --offline .", status: "pass" }] });
  assert.ok(fs.existsSync(path.join(f.root, "lychee.log")));
});

test("doc-checks: an absent binary is skipped silently and does not fail", () => {
  const f = fixture();
  const r = withPath(f.bin, () => runDocChecks({ root: f.root, checks: ["markdownlint-cli2 **/*.md"] }));
  assert.deepEqual(r, { ok: true, checks: [{ cmd: "markdownlint-cli2 **/*.md", status: "skipped" }] });
});

test("doc-checks: a failing tool is reported with output and ok false", () => {
  const f = fixture();
  f.tool("markdownlint-cli2", 1);
  const r = withPath(f.bin, () => runDocChecks({ root: f.root, checks: ["markdownlint-cli2 a.md"] }));
  assert.equal(r.ok, false);
  assert.equal(r.checks[0].status, "fail");
});

test("doc-checks: pre-commit runs only with --verify, a config file and the binary", () => {
  const f = fixture();
  f.tool("pre-commit", 0);
  const log = path.join(f.root, "pre-commit.log");
  withPath(f.bin, () => runDocChecks({ root: f.root, verify: true }));
  assert.ok(!fs.existsSync(log), "no config file: skipped");
  fs.writeFileSync(path.join(f.root, ".pre-commit-config.yaml"), "repos: []\n");
  withPath(f.bin, () => runDocChecks({ root: f.root }));
  assert.ok(!fs.existsSync(log), "no verify: not run");
  const r = withPath(f.bin, () => runDocChecks({ root: f.root, verify: true }));
  assert.equal(r.checks[0].status, "pass");
  assert.ok(fs.existsSync(log));
  fs.rmSync(log);
  const none = withPath(f.root, () => runDocChecks({ root: f.root, verify: true }));
  assert.equal(none.checks[0].status, "skipped");
});

test("doc-checks: a relative binary path resolves against the spawn cwd", () => {
  const f = fixture();
  f.tool("lychee", 0);
  const r = runDocChecks({ root: f.root, checks: ["./bin/lychee ."] });
  assert.equal(r.checks[0].status, "pass");
  assert.ok(fs.existsSync(path.join(f.root, "lychee.log")));
});
// ARCH-STATE-19: `{workspaceRoot}` in a docs check is the checkout the check runs in when a context names a unit worktree
// (or detached tree) of the root's own repository; without a context it is the root, as ever. The check runs in a child
// whose PROJECT_ROOT is a scratch repository, because the root is fixed when core.mjs loads.
const DOC_CHECKS = fileURLToPath(new URL("./doc-checks.mjs", import.meta.url));
test("doc-checks: a {workspaceRoot} check runs the detached tree's script with a context, the root's without", () => {
  const sh = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8" });
  const repo = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "doc-checks-repo-")),
  );
  sh(repo, "init", "-q", "-b", "main");
  sh(repo, "config", "user.email", "t@t");
  sh(repo, "config", "user.name", "t");
  const script = (who) =>
    `require("node:fs").appendFileSync(process.env.WHO_LOG, ${JSON.stringify(who)} + "\\n");\n`;
  fs.writeFileSync(path.join(repo, "docs.cjs"), script("main"));
  sh(repo, "add", "-A");
  sh(repo, "commit", "-qm", "docs script");
  const tree = path.join(
    fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "doc-checks-tree-"))),
    "tree",
  );
  assert.equal(sh(repo, "worktree", "add", "-q", "--detach", tree).status, 0);
  fs.writeFileSync(path.join(tree, "docs.cjs"), script("tree"));
  const log = path.join(repo, "who.log");
  const run = (withContext) => {
    const code = `import { runDocChecks } from ${JSON.stringify(DOC_CHECKS)};
const tree = ${JSON.stringify(tree)};
const r = runDocChecks({ root: tree, checks: ["node {workspaceRoot}/docs.cjs"], ...(${withContext} ? { context: { root: tree } } : {}) });
process.stdout.write(JSON.stringify(r));`;
    const env = { ...process.env, CLAUDE_PROJECT_DIR: repo, WHO_LOG: log };
    delete env.CLAUDE_CODE_SESSION_ID;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: repo,
      encoding: "utf8",
      env,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).checks[0].status, "pass");
    const who = fs.readFileSync(log, "utf8").trim();
    fs.writeFileSync(log, "");
    return who;
  };
  assert.equal(
    run(true),
    "tree",
    "a context names the detached tree: its own script ran",
  );
  assert.equal(
    run(false),
    "main",
    "no context: the root's script ran, unchanged",
  );
});
