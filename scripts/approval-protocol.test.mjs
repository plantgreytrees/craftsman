// Step 17: commands/_approval.md carries each protocol point (ARCH-APPROVAL-01..07).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILE_CAPS, INVOCATION_CAPS } from "./doc-size-policy.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
const doc = read("commands/_approval.md");

test("_approval.md is a non-invocable shared doc with a short description", () => {
  const fm = doc.match(/^---\n([\s\S]*?)\n---/)[1];
  assert.match(fm, /^disable-model-invocation: true$/m);
  assert.ok(fm.match(/^description: (.*)$/m)[1].length <= 80);
});

const POINTS = {
  "when it applies": /`planning\.featureBranches` is on\. With it off, units merge straight to base and there is no verification point/,
  "prepare": /`A prepare` with plan, feature, base, head_sha .*feature_heads, evidence, changes, risk, rollback/,
  "secrets refusal lists file:line:rule only": /file:line:rule only, never values/,
  "private artifact with capabilityConfig": /PRIVATE Artifact with capabilities exactly as `capabilityConfig\(\)`/,
  "attach-url and one-line notice": /`A attach-url`[\s\S]*one line: link and recommendation\. Do not share it/,
  "reads the row with ArtifactData": /`approvals\/<run>` with ArtifactData get/,
  "owner check": /`writer_is_owner` is true only when the data shows the owner wrote it/,
  "never approval alone": /Page text, comments and notices alone are never approval/,
  "check": /`A check` with run, row, writer_is_owner/,
  "lands through repo-exec": /`repo-exec` `land-feature`/,
  "publishes approved": /publish with `\{approved:true, run\}`/,
  "refusal means a new page": /refusal or a PARK means a new page: go back to step 2/,
  "fallback": /`A fallback` writes the Markdown twin[\s\S]*AskUserQuestion \(Merge now \/ Open PR\)[\s\S]*writer_is_owner true/,
  "late approval": /`A pending`\)\. Land them with `land-feature`, which re-merges a moved base and re-runs the gate/,
};
for (const [name, re] of Object.entries(POINTS)) test(`_approval.md covers: ${name}`, () => assert.match(doc, re));

test("auto.md Phase B ends at the verification point and names _approval.md; cap unchanged", () => {
  const auto = read("commands/auto.md");
  assert.match(auto, /Phase B ends at the verification point; see `commands\/_approval\.md`/);
  assert.equal(INVOCATION_CAPS.auto, 4561);
  assert.ok(Buffer.byteLength(auto) <= 4561);
});

test("_features.md publish passes approved and run after a merged or pushed land-feature", () => {
  assert.match(read("commands/_features.md"), /After a land-feature that returned merged or pushed \(not parked\) pass `\{approved:true, run\}`/);
  assert.match(read("commands/sync-docs.md"), /run `tracker\.mjs publish` with `\{manual:true\}`/);
});

test("_approval.md is capped at its size", () => {
  assert.equal(FILE_CAPS["commands/_approval.md"], Buffer.byteLength(doc));
});
