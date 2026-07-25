#!/usr/bin/env node
// Stop: final gate. Blocks "done" only for regressions caused THIS session, plus
// secrets, project guards, and unticked acceptance criteria. ALL state is read
// per-session (sessions/<sid>/…), so concurrent sessions never block on each
// other's baseline, authority, or acceptance criteria.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, enabled, STATE_DIR, sidOf, sessionDir, sha1, logEvent, readStdin } from "./lib/core.mjs";

const pexec = promisify(execFile);
const cfg = loadConfig();
if (!enabled(cfg) || cfg.stopGate?.enabled === false) process.exit(0);

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
// Loop guard: we already blocked once this turn — let it end.
if (input.stop_hook_active === true) process.exit(0);

const sid = sidOf(input);
const sdir = sessionDir(sid);

// Clear THIS session's doc-write authority (never touch another session's).
try { fs.unlinkSync(path.join(sdir, "doc-write")); } catch {}

const problems = [];

// 1. Secrets — always a hard block, never baselined.
if (cfg.security?.enabled) {
  for (const cmd of cfg.security.check || []) {
    const [bin, ...args] = cmd.split(" ");
    try { await pexec(bin, args, { timeout: 60000, maxBuffer: 8e6 }); }
    catch (e) {
      if (e.code === "ENOENT") continue; // tool absent: skip silently
      problems.push(`SECRETS: ${bin} flagged content in the working tree:\n${
        ((e.stdout || "") + (e.stderr || "")).split("\n").slice(0, 15).join("\n")}`);
    }
  }
}

// 2. Tests — only if they were green when THIS session began.
let start = null;
try { start = JSON.parse(fs.readFileSync(path.join(sdir, "session-start.json"), "utf8")); } catch {}
if (start?.testsGreenAtStart && start.cmd) {
  const [bin, ...args] = start.cmd.split(" ");
  try { await pexec(bin, args, { timeout: cfg.stopGate?.testTimeoutMs ?? 300000, maxBuffer: 8e6 }); }
  catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).split("\n").slice(-30).join("\n");
    problems.push(`REGRESSION: tests passed at session start but fail now (${start.cmd}):\n${out}`);
  }
}

// 2b. Project guards / extra checks (e.g. run-all-guards.py, contract-drift).
for (const cmd of cfg.stopGate?.extraChecks || []) {
  const [bin, ...args] = cmd.split(" ");
  try { await pexec(bin, args, { timeout: cfg.stopGate?.testTimeoutMs ?? 300000, maxBuffer: 8e6 }); }
  catch (e) {
    if (e.code === "ENOENT") continue;
    const out = ((e.stdout || "") + (e.stderr || "")).split("\n").slice(-20).join("\n");
    problems.push(`GUARD FAILED (${cmd}):\n${out}`);
  }
}

// 3. Acceptance criteria — enforce ONLY if THIS session owns the current
//    acceptance.md content (its recorded hash matches). A concurrent session
//    that overwrote the file owns it instead, so this session is not blocked by
//    someone else's criteria.
const acPath = path.join(STATE_DIR, "acceptance.md");
if (cfg.stopGate?.requireAcceptanceCriteria && fs.existsSync(acPath)) {
  const ac = fs.readFileSync(acPath, "utf8");
  let owns = false;
  try {
    const ref = JSON.parse(fs.readFileSync(path.join(sdir, "acceptance.ref"), "utf8"));
    owns = ref.hash === sha1(ac.trim());
  } catch {}
  if (owns) {
    const unchecked = ac.split("\n").filter((l) => /^\s*[-*]\s*\[ \]/.test(l));
    if (unchecked.length) {
      problems.push(
        `ACCEPTANCE CRITERIA not yet satisfied (from the approved plan). Verify each ` +
        `against the code you wrote; tick it in .craftsman/acceptance.md only if the ` +
        `code genuinely satisfies it, otherwise implement it:\n${unchecked.join("\n")}`
      );
    }
  }
}

if (!problems.length) { logEvent({ ev: "stop", sid, result: "pass" }); process.exit(0); }

logEvent({ ev: "stop", sid, result: "block", count: problems.length });
process.stdout.write(JSON.stringify({
  decision: "block",
  reason: `craftsman blocked completion:\n\n${problems.join("\n\n")}`,
}));
