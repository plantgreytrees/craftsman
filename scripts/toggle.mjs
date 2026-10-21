#!/usr/bin/env node
// /craftsman:toggle — on/off switch via a flag file in .craftsman/.
// (CRAFTSMAN=off in the env does the same for the quality side; only CRAFTSMAN_SAFETY=off turns the safety guards off.)
import fs from "node:fs";
import path from "node:path";
import { STATE_DIR } from "./lib/core.mjs";

const flag = path.join(STATE_DIR, "off");
fs.mkdirSync(STATE_DIR, { recursive: true });

const arg = (process.argv[2] || "").toLowerCase();
let target;
if (arg === "on") target = false;
else if (arg === "off") target = true;
else target = !fs.existsSync(flag); // no arg => flip

if (target) { fs.writeFileSync(flag, `off since ${new Date().toISOString()}\n`); console.log("craftsman: OFF (gates disabled). Re-enable with /craftsman:toggle on"); }
else { try { fs.unlinkSync(flag); } catch {} console.log("craftsman: ON (gates enabled)."); }
