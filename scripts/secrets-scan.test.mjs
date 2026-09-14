import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scanContent, scanTree } from "./secrets-scan.mjs";

function git(cwd, args) {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

test("scanContent: flags a private key block and an AWS access key", () => {
  const content = "token = AKIAABCDEFGHIJKLMNOP\n-----BEGIN RSA PRIVATE KEY-----\n"; // gitleaks:allow — fixture, not a credential
  const findings = scanContent(content);
  assert.ok(findings.some((f) => f.rule === "AWS access key"));
  assert.ok(findings.some((f) => f.rule === "private key block"));
});

// Parity with gitleaks's inline escape hatch. Without it this very file blocks
// every Stop on a machine without gitleaks, since its fixtures must look like
// real credentials — and a path-level exemption would also hide a genuine
// secret that later lands here.
test("scanContent: honours an inline gitleaks:allow marker, per line only", () => {
  const marked = 'const k = "AKIAABCDEFGHIJKLMNOP"; // gitleaks:allow';
  assert.deepEqual(scanContent(marked), []);
  // Assembled, not written literally: an unmarked key on this source line would
  // (correctly) be flagged by the very scanners this file has to stay clean for.
  const unmarked = `const other = "AKIA${"ABCDEFGHIJKLMNOQ"}";`;
  const mixed = `${marked}\n${unmarked}`;
  const findings = scanContent(mixed);
  assert.equal(findings.length, 1, "the marker must not exempt neighbouring lines");
  assert.equal(findings[0].line, 2);
});

test("scanContent: redacts the matched value, never returns it verbatim", () => {
  const secret = "AKIAABCDEFGHIJKLMNOP"; // gitleaks:allow — fixture, not a credential
  const [finding] = scanContent(`key=${secret}`);
  assert.ok(!finding.redacted.includes(secret));
});

test("scanContent: plain prose does not false-positive", () => {
  assert.deepEqual(scanContent("this is just a normal readme about tokens and keys"), []);
});

test("scanTree: scans a gitignored .env file, not just tracked files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-secrets-"));
  try {
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "test"]);
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env\n");
    fs.writeFileSync(path.join(dir, ".env"), `aws_secret_access_key="${"A".repeat(40)}"\n`);
    const findings = scanTree(dir);
    assert.ok(findings.some((f) => f.file === ".env" && f.rule === "AWS secret key"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scanTree: scans nested ignored credential files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-secrets-"));
  try {
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "test"]);
    fs.writeFileSync(path.join(dir, ".gitignore"), "config/\n");
    fs.mkdirSync(path.join(dir, "config"));
    fs.writeFileSync(path.join(dir, "config", "secrets.json"), JSON.stringify({ apiKey: "A".repeat(24) }));
    const findings = scanTree(dir);
    assert.ok(findings.some((f) => f.file === "config/secrets.json" && f.rule === "generic assigned secret"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
