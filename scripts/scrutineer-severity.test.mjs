import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ARCH-SAFETY-17: craftsman's text guards are accident prevention, so /scrutinise reports a bypass
// spelling a model would not write in ordinary work as a Suggestion, not a Warning.
const ROOT = path.resolve(import.meta.dirname, "..");
const scrutineer = fs.readFileSync(path.join(ROOT, "agents/scrutineer.md"), "utf8").replace(/\s+/g, " ");

test("scrutineer names ARCH-SAFETY-17 for text-guard bypasses", () => {
  assert.match(scrutineer, /\*\*Text guards\*\* \(ARCH-SAFETY-17\)/);
});

test("a bypass a model would not write in ordinary work is a Suggestion with its reproduction", () => {
  assert.match(scrutineer, /a bypass a model would not write in ordinary work is a Suggestion with its reproduction/);
});

test("a text-guard Warning is kept for the three ordinary-work cases only", () => {
  assert.match(scrutineer, /Warning only for an ordinary-work spelling, a false block on an ordinary command, or a regressed pinned refusal/);
});
