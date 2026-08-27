#!/usr/bin/env node
// /craftsman:scrutinise's cheap pre-filter — is a diff whitespace-only?
// Usage: node diff-triviality.mjs [<git-range>]
// TRIVIAL (exit 0): the diff, ignoring whitespace/blank-line changes, is empty.
// SUBSTANTIVE (exit 1): real content changed, or the git invocation itself
// failed for any reason (never silently report TRIVIAL on a tool failure).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const range = process.argv[2];
const args = ["diff", "-w", "--ignore-blank-lines"];
if (range) args.push(range);

try {
  const { stdout } = await execFileAsync("git", args, { maxBuffer: 8 * 1024 * 1024 });
  if (stdout.trim() === "") {
    console.log("TRIVIAL");
    process.exit(0);
  }
  console.log("SUBSTANTIVE");
  process.exit(1);
} catch (err) {
  process.stderr.write(`[craftsman] diff-triviality: ${err.message}\n`);
  console.log("SUBSTANTIVE");
  process.exit(1);
}
