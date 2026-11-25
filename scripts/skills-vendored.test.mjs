// ARCH-SLIM-19: vendored workflow skills carry MIT attribution, a short
// description, and no dependency on the third-party plugin.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// None vendored today: the three superpowers skills failed ARCH-EVALS-09 and were
// removed (ARCH-EVALS-10, 2026-11-25). Name a skill here when one is vendored.
const SKILLS = [];

for (const name of SKILLS) {
  test(`${name} is vendored with attribution and a short description`, () => {
    const text = fs.readFileSync(path.join(ROOT, "skills", name, "SKILL.md"), "utf8");
    const desc = text.match(/^description:\s*(.*)$/m)?.[1].trim();
    assert.ok(desc && desc.length <= 110, `description ${desc?.length} chars`);
    assert.match(text, /obra\/superpowers \(MIT/);
    assert.doesNotMatch(text, /superpowers:|Skill\(|install/i);
  });
}
