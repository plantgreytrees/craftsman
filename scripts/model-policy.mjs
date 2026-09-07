#!/usr/bin/env node
// Validate model frontmatter before a plugin release.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const allowed = new Set(["haiku", "sonnet", "opus", "inherit"]);
const targets = ["commands", "agents"];
const findings = [];

function markdownFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

for (const target of targets) {
  const dir = path.join(ROOT, target);
  for (const file of markdownFiles(dir)) {
    const text = fs.readFileSync(file, "utf8");
    const match = text.match(/^model:\s*([^\s]+)\s*$/m);
    if (!match) continue;
    if (!allowed.has(match[1])) findings.push(`${path.relative(ROOT, file)}: unsupported model ${match[1]}`);
  }
}

if (findings.length) {
  process.stderr.write(findings.join("\n") + "\n");
  process.exit(1);
}

console.log("model policy: PASS");
