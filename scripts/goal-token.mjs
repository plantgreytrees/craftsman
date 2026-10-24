#!/usr/bin/env node
// Records that craftsman wrote a goal file in THIS session (ARCH-SAFETY-09). /instruction and /auto run it
// right after saving .craftsman/instructions/<slug>.goal.txt; the mod (hooks/register.js) launches a goal
// file only when its name and mtime match a token recorded here, so a goal written by anything else (a
// prompt-injected tool call, a stray file) is shown to the user, never submitted as them.
//
//   node goal-token.mjs .craftsman/instructions/<slug>.goal.txt
//
// Refuses unless /instruction or /auto ran in this session (the command marker orchestrate-scope-guard
// writes), the file is a *.goal.txt directly under this checkout's or the main checkout's .craftsman/instructions, and a session id is known
// (Bash-run scripts get it as CLAUDE_CODE_SESSION_ID). pre-guard never lets a tool call write the token file.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PROJECT_ROOT, STATE_DIR, atomicWrite, commandInvoked, consumeNonce, mainCheckoutRoot, safetyEnabled, sessionDir, sidOf } from "./lib/core.mjs";

export function mintGoalToken({ file, sid, root = PROJECT_ROOT, stateDir = STATE_DIR, nonce = false }) {
  if (nonce && !safetyEnabled()) throw new Error("CRAFTSMAN_SAFETY=off: no guard is running, so a goal token needs a session with safety on");
  if (!sid) throw new Error("no session id (CLAUDE_CODE_SESSION_ID is not set), so no token can be tied to this session");
  if (!commandInvoked(sid, ["instruction", "auto"], { context: { stateDir } })) {
    throw new Error("goal tokens are minted only inside /instruction or /auto, and neither ran in this session");
  }
  // The command line asks for pre-guard's one-shot nonce (ARCH-SAFETY-05); a library caller has already passed its own checks.
  if (nonce && !consumeNonce(sidOf({ session_id: sid }), "goal-token", { context: { stateDir } })) {
    throw new Error("no nonce from pre-guard for this session: run it as a plain `node …/goal-token.mjs <file>` Bash command, not through another program");
  }
  // state-write.mjs saves the goal file in the MAIN checkout's .craftsman, the Write tool at the relative path lands in this
  // root's own; from a linked worktree both are accepted, each checked against its own directory's realpath.
  const main = mainCheckoutRoot(root);
  const instructionDirs = new Set();
  for (const base of [root, main]) {
    try { instructionDirs.add(fs.realpathSync(path.join(base, ".craftsman", "instructions"))); } catch { /* that checkout has none */ }
  }
  let absolute = path.resolve(root, file);
  if (!fs.existsSync(absolute)) absolute = path.resolve(main, file);
  let real;
  try { real = fs.realpathSync(absolute); } catch { throw new Error(`no such goal file: ${file}`); }
  if (!instructionDirs.has(path.dirname(real)) || !/\.goal\.txt$/.test(real)) {
    throw new Error(`${file} is not a *.goal.txt directly under .craftsman/instructions`);
  }
  const name = path.basename(real);
  const tokensFile = path.join(sessionDir(sidOf({ session_id: sid }), { stateDir }), "goal-tokens.json");
  let tokens = {};
  try { tokens = JSON.parse(fs.readFileSync(tokensFile, "utf8")); } catch { /* first token this session */ }
  // Name and mtime say which file; the digest says what it held. Restoring an mtime after a rewrite (`touch -r`) is cheap,
  // matching a SHA-256 of different content is not.
  const mtimeMs = fs.statSync(real).mtimeMs;
  tokens[name] = { mtimeMs, sha256: createHash("sha256").update(fs.readFileSync(real)).digest("hex") };
  atomicWrite(tokensFile, JSON.stringify(tokens) + "\n");
  return { name, mtimeMs, sha256: tokens[name].sha256 };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error("usage: goal-token.mjs <path to .craftsman/instructions/<slug>.goal.txt>");
    const { name } = mintGoalToken({ file, sid: process.env.CLAUDE_CODE_SESSION_ID, nonce: true });
    process.stdout.write(`goal token recorded for ${name}\n`);
  } catch (error) {
    process.stderr.write(`craftsman: goal-token ${error.message}\n`);
    process.exitCode = 2;
  }
}
