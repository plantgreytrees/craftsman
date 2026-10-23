import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
