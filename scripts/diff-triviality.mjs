#!/usr/bin/env node
// /craftsman:scrutinise's cheap pre-filter — is a diff whitespace-only?
// Usage: node diff-triviality.mjs [<git-range>]
// TRIVIAL (exit 0): the diff, ignoring whitespace/blank-line changes, is empty,
// AND no changed file is in a language where whitespace is itself semantic
// (Python, YAML, Makefiles — `git diff -w` would wrongly call a broken
// indentation change "no diff" there, so those always count as SUBSTANTIVE).
// SUBSTANTIVE (exit 1): real content changed, a whitespace-significant file
// was touched, or the git invocation itself failed for any reason (never
// silently report TRIVIAL on a tool failure).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

// Extensions/basenames where indentation/whitespace carries meaning, so a
// `-w` (whitespace-insensitive) diff cannot be trusted to call it trivial.
const WHITESPACE_SIGNIFICANT_EXT = new Set([".py", ".pyi", ".yml", ".yaml"]);
const WHITESPACE_SIGNIFICANT_BASENAME = new Set(["makefile", "gnumakefile"]);

function isWhitespaceSignificant(file) {
  const base = path.basename(file).toLowerCase();
  if (WHITESPACE_SIGNIFICANT_BASENAME.has(base)) return true;
  return WHITESPACE_SIGNIFICANT_EXT.has(path.extname(file).toLowerCase());
}

const range = process.argv[2];

function substantive(reason) {
  if (reason) process.stderr.write(`[craftsman] diff-triviality: ${reason}\n`);
  console.log("SUBSTANTIVE");
  process.exit(1);
}

try {
  const nameArgs = ["diff", "--name-only"];
  if (range) nameArgs.push(range);
  const { stdout: names } = await execFileAsync("git", nameArgs, { maxBuffer: 8 * 1024 * 1024 });
  const files = names.split("\n").map((l) => l.trim()).filter(Boolean);
  if (files.some(isWhitespaceSignificant)) substantive();

  const diffArgs = ["diff", "-w", "--ignore-blank-lines"];
  if (range) diffArgs.push(range);
  const { stdout } = await execFileAsync("git", diffArgs, { maxBuffer: 8 * 1024 * 1024 });
  if (stdout.trim() === "") {
    console.log("TRIVIAL");
    process.exit(0);
  }
  substantive();
} catch (err) {
  substantive(err.message);
}
