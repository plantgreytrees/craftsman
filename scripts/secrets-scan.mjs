#!/usr/bin/env node
// Built-in secrets scanner — the dependency-free fallback stop-gate.mjs runs
// when the configured scanner (gitleaks by default) isn't on PATH, so a
// secrets check never degrades to "just install a tool" on a bare machine.
// Deliberately smaller than gitleaks's rule set: common high-signal patterns
// only, tuned for few false positives over exhaustive coverage.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const PATTERNS = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "AWS secret key", re: /aws_secret_access_key\s*[:=]\s*['"][A-Za-z0-9/+=]{40}['"]/gi },
  { name: "private key block", re: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: "Slack token", re: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
  { name: "Stripe live key", re: /sk_live_[0-9a-zA-Z]{16,}/g },
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "generic assigned secret", re: /(api[_-]?key|secret|token|password|passwd|pwd)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{16,}["']/gi },
];

const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".pdf", ".zip", ".gz", ".lock"]);
const SKIP_DIRS = new Set([".git", ".craftsman", "node_modules", "target", "dist", "build", "out", "coverage", "__pycache__", ".venv", "venv"]);
const MAX_BYTES = 2_000_000;

function redact(match) {
  return match.length <= 8 ? "****" : `${match.slice(0, 4)}****${match.slice(-2)}`;
}

export function scanContent(content, patterns = PATTERNS) {
  const findings = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { name, re } of patterns) {
      re.lastIndex = 0;
      const match = re.exec(lines[i]);
      if (match) findings.push({ rule: name, line: i + 1, redacted: redact(match[0]) });
    }
  }
  return findings;
}

function listFiles(root) {
  let tracked = [];
  try {
    tracked = execFileSync("git", ["-C", root, "ls-files", "--others", "--cached", "--exclude-standard"], { encoding: "utf8" })
      .split("\n").filter(Boolean);
  } catch { /* not a git repo — fall through to an empty tracked list */ }
  let ignored = [];
  try {
    ignored = execFileSync("git", ["-C", root, "ls-files", "--others", "--ignored", "--exclude-standard"], { encoding: "utf8" })
      .split("\n").filter(Boolean);
  } catch { /* not a git repo or no ignored files */ }
  return [...new Set([...tracked, ...ignored])].filter((rel) => {
    const parts = rel.split(/[\\/]/);
    return !parts.some((part) => SKIP_DIRS.has(part));
  });
}

export function scanTree(root) {
  const findings = [];
  for (const rel of listFiles(root)) {
    if (SKIP_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(root, rel);
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    let content;
    try { content = fs.readFileSync(abs, "utf8"); } catch { continue; }
    for (const finding of scanContent(content)) findings.push({ file: rel, ...finding });
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] || ".";
  const findings = scanTree(root);
  if (findings.length) {
    console.log(`craftsman built-in secrets scan (fallback for missing gitleaks): ${findings.length} finding(s)`);
    for (const f of findings.slice(0, 15)) console.log(`${f.file}:${f.line}: ${f.rule} — ${f.redacted}`);
    process.exitCode = 1;
  } else {
    console.log("craftsman built-in secrets scan (fallback for missing gitleaks): clean");
  }
}
