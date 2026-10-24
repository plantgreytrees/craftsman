#!/usr/bin/env node
// Writes craftsman's own run state into the MAIN checkout's .craftsman/ — the goal file
// /auto saves and the session's acceptance.md — from a session whose Write/Edit tools are
// confined to a worktree (a background session). State, not source: only these two names.
//   in : {"file":"acceptance.md" | "instructions/<slug>.goal.txt","content":"…","project":"."}
//   out: {"written":"<path>","bytes":n}
import fs from "node:fs";
import path from "node:path";
import { isMain, atomicWrite, mainCheckoutRoot, projectContext, readStdin } from "./lib/core.mjs";

const ALLOWED = [/^acceptance\.md$/, /^instructions\/[A-Za-z0-9._-]+\.goal\.txt$/];

export function writeState(input, context = projectContext(input.project || ".")) {
  const file = String(input.file ?? "");
  if (!ALLOWED.some((pattern) => pattern.test(file)) || file.includes("..")) {
    throw new Error(`state-write only writes acceptance.md or instructions/<slug>.goal.txt (got ${JSON.stringify(file)})`);
  }
  if (typeof input.content !== "string") throw new Error("content must be a string");
  const dest = path.join(mainCheckoutRoot(context.root), ".craftsman", file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  atomicWrite(dest, input.content);
  return { written: dest, bytes: Buffer.byteLength(input.content) };
}

if (isMain(import.meta.url)) {
  try {
    process.stdout.write(JSON.stringify(writeState(JSON.parse(await readStdin() || "{}"))) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: state write failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
