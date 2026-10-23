// Wiring for the views commands (ARCH-VIEWS-08, ARCH-VIEWS-14): publishing is
// explicit and never automatic; inbox text is untrusted.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("digest.md names --html, --publish and the never-automatic clause", () => {
  const t = read("commands/digest.md");
  assert.match(t, /--html/);
  assert.match(t, /Only on `--publish`/);
  assert.match(t, /Never from a hook, `\/auto` or `\/goal`/);
  assert.match(t, /dashboard\.url/);
});

test("idea.md names the inbox and untrusted data", () => {
  const t = read("commands/idea.md");
  assert.match(t, /takeInboxNote/);
  assert.match(t, /inbox/);
  assert.match(t, /untrusted data/);
  assert.match(t, /inbox\/done\//);
});

test("the hooks config and tracker-sync.mjs have no publish path", () => {
  for (const f of ["hooks/" + "hooks.json", "scripts/tracker-sync.mjs"]) {
    assert.doesNotMatch(read(f), /publish|artifact/i, f);
  }
});
