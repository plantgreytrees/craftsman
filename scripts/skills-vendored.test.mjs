// ARCH-SLIM-19: no third-party plugin is a dependency, and every skill vendored
// from obra/superpowers (found by its MIT attribution line, so one added later is
// checked without editing this file) keeps a short description and makes no call
// into the plugin it came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ATTRIBUTION = /obra\/superpowers \(MIT/;

// Names of skills/*/SKILL.md files that carry the obra/superpowers MIT attribution.
export function vendoredSkills(root) {
  const dir = path.join(root, "skills");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => {
      const file = path.join(dir, name, "SKILL.md");
      return fs.existsSync(file) && ATTRIBUTION.test(fs.readFileSync(file, "utf8"));
    })
    .sort();
}

test("plugin.json declares no dependencies key", () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  assert.ok(!("dependencies" in plugin), "plugin.json has a dependencies key");
});

for (const name of vendoredSkills(ROOT)) {
  test(`${name} is vendored with attribution and a short description`, () => {
    const text = fs.readFileSync(path.join(ROOT, "skills", name, "SKILL.md"), "utf8");
    const desc = text.match(/^description:\s*(.*)$/m)?.[1].trim();
    assert.ok(desc && desc.length <= 110, `description ${desc?.length} chars`);
    assert.doesNotMatch(text, /superpowers:|Skill\(|install/i);
  });
}

test("vendoredSkills finds an attributed skill and skips a plain one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-vendored-"));
  try {
    fs.mkdirSync(path.join(root, "skills", "borrowed"), { recursive: true });
    fs.mkdirSync(path.join(root, "skills", "own"), { recursive: true });
    fs.writeFileSync(path.join(root, "skills", "borrowed", "SKILL.md"), "---\nname: borrowed\n---\nAdapted from obra/superpowers (MIT License).\n");
    fs.writeFileSync(path.join(root, "skills", "own", "SKILL.md"), "---\nname: own\n---\nOurs.\n");
    assert.deepEqual(vendoredSkills(root), ["borrowed"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
