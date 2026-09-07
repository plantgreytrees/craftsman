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
  const content = "token = AKIAABCDEFGHIJKLMNOP\n-----BEGIN RSA PRIVATE KEY-----\n";
  const findings = scanContent(content);
  assert.ok(findings.some((f) => f.rule === "AWS access key"));
  assert.ok(findings.some((f) => f.rule === "private key block"));
});

test("scanContent: redacts the matched value, never returns it verbatim", () => {
  const secret = "AKIAABCDEFGHIJKLMNOP";
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
