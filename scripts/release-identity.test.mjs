import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../.claude-plugin/${f}`, import.meta.url), "utf8"));

test("neither manifest carries a version key, so installs track commits (ARCH-MOD-06)", () => {
  const plugin = read("plugin.json");
  const market = read("marketplace.json");
  assert.equal(plugin.name, "craftsman");
  assert.equal("version" in plugin, false);
  assert.equal("version" in market, false);
  for (const entry of market.plugins) assert.equal("version" in entry, false);
});

test("metadata.release names the newest released CHANGELOG heading (ARCH-MOD-06)", () => {
  const changelog = fs.readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const newest = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1];
  assert.ok(newest, "CHANGELOG has a released heading");
  assert.equal(read("plugin.json").metadata.release, newest);
});

test("userConfig declares exactly the four knobs with only allowed fields (ARCH-MOD-06)", () => {
  const plugin = read("plugin.json");
  assert.deepEqual(Object.keys(plugin.userConfig).sort(), ["autonomyLevel", "budgetsEnforce", "modelTier", "reviewDepth"]);
  for (const [key, opt] of Object.entries(plugin.userConfig)) {
    assert.deepEqual(Object.keys(opt).sort(), ["default", "description", "title", "type"], key);
    assert.equal("options" in opt, false);
  }
  assert.equal(plugin.userConfig.budgetsEnforce.type, "boolean");
  assert.equal(plugin.userConfig.budgetsEnforce.default, true);
  for (const k of ["autonomyLevel", "reviewDepth", "modelTier"]) assert.equal(plugin.userConfig[k].type, "string");
  assert.equal("version" in plugin, false);
});
