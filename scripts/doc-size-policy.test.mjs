import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  FILE_CAPS, INVOCATION_CAPS, INVOCATION_DOCS, checkDocSizes, invocationTotals, raisedCaps,
} from "./doc-size-policy.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsp-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

test("repo passes its own caps", () => {
  assert.deepEqual(checkDocSizes(ROOT), []);
});

test("an unmatched skill reference fails (ARCH-SLIM-01)", () => {
  const root = fixture({ "skills/x/references/new.md": "hello" });
  try {
    const f = checkDocSizes(root, {}, {});
    assert.equal(f.length, 1);
    assert.match(f[0], /skills\/x\/references\/new\.md: no per-file cap/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test("a file exactly at its cap passes, 1 byte over fails", () => {
  const root = fixture({ "agents/a.md": "x".repeat(10) });
  try {
    assert.deepEqual(checkDocSizes(root, { "agents/a.md": 10 }, {}), []);
    const f = checkDocSizes(root, { "agents/a.md": 9 }, {});
    assert.equal(f.length, 1);
    assert.match(f[0], /10 bytes exceeds its 9-byte cap \(over by 1\)/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test("a command total over its per-invocation cap fails (ARCH-SLIM-03)", () => {
  const root = fixture({ "commands/orchestrate.md": "a".repeat(5), "commands/_shared-machinery.md": "b".repeat(5), "commands/_shared-execution.md": "c".repeat(5) });
  const caps = { "commands/orchestrate.md": 5, "commands/_shared-machinery.md": 5, "commands/_shared-execution.md": 5 };
  try {
    assert.equal(invocationTotals(root).orchestrate, 15);
    assert.deepEqual(checkDocSizes(root, caps, { orchestrate: 15 }), []);
    const f = checkDocSizes(root, caps, { orchestrate: 14 });
    assert.equal(f.length, 1);
    assert.match(f[0], /orchestrate: per-invocation total 15 bytes exceeds its 14-byte cap/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test("raisedCaps flags a rise, ignores falls and new entries", () => {
  assert.deepEqual(raisedCaps({ a: 5, b: 5 }, { a: 6, b: 4, c: 99 }), ["a: 5 -> 6"]);
  assert.deepEqual(raisedCaps({ a: 5 }, { a: 5 }), []);
});

test("every INVOCATION_DOCS entry names a capped file", () => {
  for (const docs of Object.values(INVOCATION_DOCS)) for (const d of docs) assert.ok(d in FILE_CAPS, d);
});

test("ratchet: no cap rises versus the merge-base (skips without git)", async (t) => {
  let baseSrc;
  try {
    const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    let base;
    for (const ref of ["origin/main", "main"]) {
      try { base = git("merge-base", "HEAD", ref); break; } catch { /* try next */ }
    }
    if (!base) return t.skip("no git merge-base");
    baseSrc = git("show", `${base}:scripts/doc-size-policy.mjs`);
  } catch { return t.skip("no git"); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsp-base-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts"));
    const file = path.join(dir, "scripts", "doc-size-policy.mjs");
    fs.writeFileSync(file, baseSrc);
    const base = await import(pathToFileURL(file).href);
    if (!base.FILE_CAPS) return t.skip("merge-base predates per-file caps");
    assert.deepEqual(raisedCaps(base.FILE_CAPS, FILE_CAPS), [], "per-file cap raised");
    assert.deepEqual(raisedCaps(base.INVOCATION_CAPS || {}, INVOCATION_CAPS), [], "per-invocation cap raised");
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test("CLI entry runs from a path with a space, via a symlink (ARCH-SLIM-01)", () => {
  const root = fixture({ "agents/zz-uncapped.md": "hello" });
  try {
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(path.join(import.meta.dirname, "doc-size-policy.mjs"), path.join(root, "scripts", "doc-size-policy.mjs"));
    fs.mkdirSync(path.join(root, "a b"));
    const link = path.join(root, "a b", "dsp-link.mjs");
    fs.symlinkSync(path.join(root, "scripts", "doc-size-policy.mjs"), link);
    for (const script of [link, path.join(root, "scripts", "doc-size-policy.mjs")]) {
      let err;
      try { execFileSync(process.execPath, [script], { stdio: "pipe" }); } catch (e) { err = e; }
      assert.ok(err, `expected non-zero exit for ${script}`);
      assert.equal(err.status, 1);
      assert.match(String(err.stderr), /zz-uncapped\.md: no per-file cap/);
    }
  } finally { fs.rmSync(root, { recursive: true }); }
});
