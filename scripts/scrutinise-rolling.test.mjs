import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("scrutinise keeps one rolling summary plus the latest round", () => {
  const s = fs.readFileSync(path.join(root, "commands/scrutinise.md"), "utf8");
  assert.match(s, /one rolling summary plus the latest round; older rounds stay in git history/);
  assert.doesNotMatch(s, /a later round extends that doc with new steps/);
});
