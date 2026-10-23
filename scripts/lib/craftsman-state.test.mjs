// One definition of "this porcelain line is craftsman's own gitignored state", shared by Stop's secrets
// re-scan and the unpushed-work report (ARCH-STATE-04).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { isCraftsmanStateLine } from "./craftsman-state.mjs";

test("isCraftsmanStateLine: .craftsman and everything under it, in any status column, and nothing that merely starts that way", () => {
  for (const line of ["?? .craftsman/", "?? .craftsman", " M .craftsman/events.jsonl", "!! .craftsman/sessions/s1/dirty", "A  .craftsman/x"]) assert.equal(isCraftsmanStateLine(line), true, line);
  for (const line of ["?? .craftsmanship/x", " M docs/.craftsman/x", "?? src/.craftsman", " M a.txt", ""]) assert.equal(isCraftsmanStateLine(line), false, line);
});

test("the filter has one definition: no other script or library keeps its own copy", () => {
  const dir = new URL("../", import.meta.url);
  const copies = [];
  for (const where of ["./", "./lib/"]) {
    for (const name of fs.readdirSync(new URL(where, dir))) {
      if (!name.endsWith(".mjs") || name.endsWith(".test.mjs")) continue;
      const file = fileURLToPath(new URL(where + name, dir));
      if (/slice\(3\)[\s\S]{0,160}\.craftsman/.test(fs.readFileSync(file, "utf8"))) copies.push(file.split("/scripts/")[1]);
    }
  }
  assert.deepEqual(copies, ["lib/craftsman-state.mjs"]);
});
