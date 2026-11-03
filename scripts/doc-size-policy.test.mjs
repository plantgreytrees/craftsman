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
import * as policy from "./doc-size-policy.mjs";

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

// ARCH-SLIM-16: a cap rises only through a recorded, paid CAP_TRADES entry. Called through the
// namespace so each case fails on its own while ratchetFindings does not exist.
const TRADE = { raise: "agents/a.md", lower: "commands/c.md", bytes: 5, rule: "ARCH-SLIM-16", decided: "2026-11-03" };
const BASE = { "agents/a.md": 100, "agents/b.md": 100, "commands/c.md": 500 };
const caps = (over) => ({ ...BASE, ...over });

test("ratchetFindings refuses a rise no CAP_TRADES entry names (ARCH-SLIM-16)", () => {
  const f = policy.ratchetFindings(BASE, caps({ "agents/a.md": 103 }), []);
  assert.equal(f.length, 1);
  assert.match(f[0], /agents\/a\.md: cap 100 -> 103 has no CAP_TRADES entry/);
  assert.equal(policy.ratchetFindings(BASE, caps({ "agents/b.md": 103, "commands/c.md": 495 }), [TRADE]).length, 1);
});

test("ratchetFindings refuses a rise larger than its trade's bytes", () => {
  const f = policy.ratchetFindings(BASE, caps({ "agents/a.md": 106, "commands/c.md": 494 }), [TRADE]);
  assert.equal(f.length, 1);
  assert.match(f[0], /agents\/a\.md: cap rose 6 bytes, more than its trade's 5/);
});

test("ratchetFindings refuses an unpaid trade: the lower cap fell by less than bytes", () => {
  const f = policy.ratchetFindings(BASE, caps({ "agents/a.md": 105, "commands/c.md": 496 }), [TRADE]);
  assert.equal(f.length, 1);
  assert.match(f[0], /commands\/c\.md: cap fell 4 bytes, short of the 5 its trades owe \(unpaid\)/);
  // One fall cannot pay two trades.
  const both = [TRADE, { ...TRADE, raise: "agents/b.md" }];
  const g = policy.ratchetFindings(BASE, caps({ "agents/a.md": 105, "agents/b.md": 105, "commands/c.md": 495 }), both);
  assert.equal(g.length, 1);
  assert.match(g[0], /short of the 10 its trades owe \(unpaid\)/);
});

test("ratchetFindings refuses a trade whose lower file no invocation loads", () => {
  const f = policy.ratchetFindings(BASE, caps({ "agents/a.md": 105, "agents/b.md": 95 }), [{ ...TRADE, lower: "agents/b.md" }]);
  assert.ok(f.some((x) => /CAP_TRADES\[0\]: lower agents\/b\.md is not loaded by any invocation/.test(x)), f.join("\n"));
});

test("ratchetFindings refuses a malformed entry or one whose raise equals its lower", () => {
  const bad = [
    { ...TRADE, rule: undefined },
    { ...TRADE, rule: "SLIM-16" },
    { ...TRADE, decided: "3 Nov 2026" },
    { ...TRADE, bytes: 0 },
    { ...TRADE, bytes: 2.5 },
    { ...TRADE, raise: "" },
    { ...TRADE, lower: undefined },
    { ...TRADE, raise: "commands/c.md" },
    null,
  ];
  const f = policy.ratchetFindings(BASE, BASE, bad);
  assert.equal(f.length, bad.length, f.join("\n"));
  f.forEach((x, i) => assert.match(x, new RegExp(`^CAP_TRADES\\[${i}\\]: malformed entry`)));
});

test("ratchetFindings returns [] for a covered, paid rise and for any fall", () => {
  assert.deepEqual(policy.ratchetFindings(BASE, caps({ "agents/a.md": 105, "commands/c.md": 495 }), [TRADE]), []);
  assert.deepEqual(policy.ratchetFindings(BASE, caps({ "agents/a.md": 103, "commands/c.md": 490 }), [TRADE]), []);
  assert.deepEqual(policy.ratchetFindings(BASE, caps({ "agents/a.md": 90, "commands/c.md": 400, "agents/new.md": 999 }), []), []);
  assert.deepEqual(policy.ratchetFindings(BASE, BASE, [TRADE]), []);
});

test("every shipped CAP_TRADES entry is well-formed", () => {
  assert.ok(Array.isArray(policy.CAP_TRADES));
  assert.deepEqual(policy.ratchetFindings({}, {}, policy.CAP_TRADES), []);
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
    assert.deepEqual(policy.ratchetFindings(base.FILE_CAPS, FILE_CAPS, policy.CAP_TRADES), [], "per-file cap raised without a paid CAP_TRADES entry");
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
