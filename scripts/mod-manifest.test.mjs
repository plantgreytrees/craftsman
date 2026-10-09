import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const manifest = read("docs/mod-manifest.txt");
const source = read("hooks/register.js");
const FORBIDDEN = ["tool.call", "tool.check", "agent.spawn"];

test("ARCH-MOD-01: the committed validate manifest hooks no tool.call, tool.check or agent.spawn", () => {
  const hooks = /register\.js hooks: (.+)/.exec(manifest);
  assert.ok(hooks, "docs/mod-manifest.txt carries the validate output's hooks line");
  const events = hooks[1].split(",").map((s) => s.trim());
  for (const event of FORBIDDEN) assert.ok(!events.includes(event), `manifest hooks ${event}`);
  for (const event of FORBIDDEN) assert.doesNotMatch(source, new RegExp(`on\\(\\s*["']${event.replace(".", "\\.")}["']`), `register.js hooks ${event}`);
});

test("ARCH-MOD-01: the manifest is current — it lists exactly the events and $ calls register.js makes", () => {
  const events = [...new Set([...source.matchAll(/\bon\(\s*"([a-z.]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(/register\.js hooks: (.+)/.exec(manifest)[1].split(", ").sort(), events, "regenerate docs/mod-manifest.txt with claude plugin validate .");
  const calls = [...new Set([...source.matchAll(/\$\.([a-z]+\.[a-zA-Z]+)\(/g)].map((m) => `$.${m[1]}`))].sort();
  assert.deepEqual(/register\.js calls: (.+)/.exec(manifest)[1].split(", ").sort(), calls);
});

test("the mod is declared by hooks.json modules and plugin.json parses", () => {
  assert.deepEqual(JSON.parse(read("hooks/hooks.json")).modules, ["./register.js"]);
  assert.equal(JSON.parse(read(".claude-plugin/plugin.json")).name, "craftsman");
  assert.match(source, /^export function register\(on\)/m);
  assert.equal([...source.matchAll(/^export /gm)].length, 1, "a hooks module exports register alone");
});

test("ARCH-MOD-05: CI runs claude plugin test, skipping with a notice below claude 2.1.287", () => {
  const ci = read(".github/workflows/ci.yml");
  const step = /- name: Mod tests[\s\S]*?claude plugin test \.\n/.exec(ci);
  assert.ok(step, "ci.yml has the mod-test step");
  assert.match(step[0], /need="2\.1\.287"/);
  assert.match(step[0], /::notice::.*skipping mod tests/);
  assert.match(step[0], /exit 0/);
});

test("ARCH-MOD-04: the mod feature-detects by trying calls, never by version string", () => {
  assert.doesNotMatch(source, /\bversion\b|semver|\d+\.\d+\.\d+/i);
  assert.doesNotMatch(source, /process\.env|\$\.(?:env|settings|config)\b|settings\.json/, "the mod reads no env or settings");
});
