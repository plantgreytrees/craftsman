// ARCH-SLIM-08: [Unreleased] stays under 8 KB; cut a release before it grows past that.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_UNRELEASED_BYTES = 8 * 1024;

test("CHANGELOG [Unreleased] is under 8 KB", () => {
  const text = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  const m = text.match(/^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[)/m);
  assert.ok(m, "[Unreleased] section not found");
  assert.ok(Buffer.byteLength(m[1]) <= MAX_UNRELEASED_BYTES, `[Unreleased] is ${Buffer.byteLength(m[1])} bytes`);
});

const changelog = () => fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
const newestRelease = () => changelog().match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

test("a dated release follows [Unreleased]", () => {
  const release = newestRelease();
  assert.ok(release, "no `## [x.y.z]` heading in CHANGELOG.md");
  assert.match(changelog(), new RegExp(`^## \\[${release.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m"));
});

// One release identity: the changelog is the source of truth, plugin.json follows it, and no manifest pins a
// `version` (a pinned version freezes every install until someone bumps it).
test("plugin.json metadata.release equals the newest CHANGELOG release", () => {
  assert.equal(json(".claude-plugin/plugin.json").metadata.release, newestRelease());
});

test("neither plugin.json nor marketplace.json carries a version field", () => {
  assert.equal("version" in json(".claude-plugin/plugin.json"), false);
  assert.equal("version" in json(".claude-plugin/marketplace.json"), false);
  for (const entry of json(".claude-plugin/marketplace.json").plugins) assert.equal("version" in entry, false, entry.name);
});

test("CONTRIBUTING says the release is derived from the changelog", () => {
  const text = fs.readFileSync(path.join(ROOT, "CONTRIBUTING.md"), "utf8");
  assert.match(text, /release is derived from the changelog/);
  assert.match(text, /metadata\.release/);
  assert.match(text, /changelog\.test\.mjs/);
});
