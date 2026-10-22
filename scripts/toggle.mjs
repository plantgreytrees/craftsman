#!/usr/bin/env node
// /craftsman:toggle — on/off switch via a flag file in .craftsman/.
// (CRAFTSMAN=off in the env does the same for the quality side; only CRAFTSMAN_SAFETY=off turns the safety guards off.)
//
// ARCH-SAFETY-05: turning it off checks its own authority. It refuses unless the USER typed /craftsman:toggle
// in this session (the "prompt" record orchestrate-scope-guard keeps; a model Skill call is not enough), so
// no spelling of the command line can switch the quality side off. `on` stays open.
import fs from "node:fs";
import path from "node:path";
import { STATE_DIR, commandInvoked, consumeNonce, sidOf } from "./lib/core.mjs";

const flag = path.join(STATE_DIR, "off");

const arg = (process.argv[2] || "").toLowerCase();
let target;
if (arg === "on") target = false;
else if (arg === "off") target = true;
else target = !fs.existsSync(flag); // no arg => flip

if (target) {
  const refuse = (why) => { process.stderr.write(`craftsman: toggle off refused: ${why}\n`); process.exit(2); };
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sid) refuse("no session id (CLAUDE_CODE_SESSION_ID is not set), so no command record can be tied to this session");
  if (!commandInvoked(sidOf({ session_id: sid }), ["toggle"], { context: { stateDir: STATE_DIR }, via: "prompt" })) {
    refuse("the user did not type /craftsman:toggle in this session");
  }
  if (!consumeNonce(sidOf({ session_id: sid }), "toggle", { context: { stateDir: STATE_DIR } })) {
    refuse("no nonce from pre-guard for this session: run it as a plain `node …/toggle.mjs off` Bash command, not through another program");
  }
}
fs.mkdirSync(STATE_DIR, { recursive: true });
if (target) { fs.writeFileSync(flag, `off since ${new Date().toISOString()}\n`); console.log("craftsman: OFF (gates disabled). Re-enable with /craftsman:toggle on"); }
else { try { fs.unlinkSync(flag); } catch {} console.log("craftsman: ON (gates enabled)."); }
