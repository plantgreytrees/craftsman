#!/usr/bin/env node
// Grants doc-write authority. Run ONLY by the doc writers — /plan, /orchestrate,
// /sync-docs, /idea (docs/ideas/) and /architect (docs/architecture/) — as
// their first action — and by /builtin-check, only just before it writes its
// ledger (docs/builtins.md). Writes a short-lived global "grant"; the PreToolUse guard
// (which alone knows the session id) claims it into a per-session marker on that
// session's first docs/ write. This indirection exists because command-run
// scripts get no session_id from the hook (only hooks do), but a Bash-run script gets it as
// CLAUDE_CODE_SESSION_ID; authority must be per-session so concurrent sessions never clear
// each other's. Everything else is blocked by pre-guard.mjs (doc-authority check).
//
// ARCH-SAFETY-05: the script checks its own authority. `on` refuses unless one of the doc-writing
// commands was typed or called in THIS session (the record orchestrate-scope-guard keeps), so no spelling
// of the command line that pre-guard's text check misses can reach the grant. `off` stays open.
import fs from "node:fs";
import path from "node:path";
import { STATE_DIR, DOC_WRITER_COMMANDS, commandInvoked, consumeNonce, sidOf } from "./lib/core.mjs";

const arg = (process.argv[2] || "on").toLowerCase();
const pending = path.join(STATE_DIR, "doc-write-pending");

if (arg === "off") {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  try { fs.unlinkSync(pending); } catch {}
  console.log("doc-write grant cleared.");
} else {
  const refuse = (why) => { process.stderr.write(`craftsman: doc-write.mjs on refused: ${why}\n`); process.exit(2); };
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sid) refuse("no session id (CLAUDE_CODE_SESSION_ID is not set), so no command record can be tied to this session");
  if (!commandInvoked(sidOf({ session_id: sid }), DOC_WRITER_COMMANDS, { context: { stateDir: STATE_DIR } })) {
    refuse(`none of /${DOC_WRITER_COMMANDS.join(", /")} ran in this session; only a doc-writing command may grant doc authority`);
  }
  if (!consumeNonce(sidOf({ session_id: sid }), "doc-write", { context: { stateDir: STATE_DIR } })) {
    refuse("no nonce from pre-guard for this session: run it as a plain `node …/doc-write.mjs on` Bash command, not through another program");
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(pending, `granted ${new Date().toISOString()}\n`);
  console.log("doc-write authority granted for this session — files under docs/ are now editable this turn.");
}
