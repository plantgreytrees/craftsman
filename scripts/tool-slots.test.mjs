import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "craftsman.config.json"), "utf8"));

// Mirrors repo-exec's findGateCommand: first marker present, in config order.
function lookup(dir) {
  for (const [marker, cmd] of Object.entries(cfg.stopGate.commands)) {
    if (fs.existsSync(path.join(dir, marker))) return cmd;
  }
  return null;
}

test("tool-slots: justfile is the first marker so `just check` wins when present", () => {
  assert.equal(Object.keys(cfg.stopGate.commands)[0], "justfile");
  assert.equal(cfg.stopGate.commands.justfile, "just check");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-slots-"));
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  assert.equal(lookup(dir), "npm test --silent");
  fs.writeFileSync(path.join(dir, "justfile"), "check:\n\ttrue\n");
  assert.equal(lookup(dir), "just check");
});

test("tool-slots: docs.checks defaults to an empty list", () => {
  assert.deepEqual(cfg.docs.checks, []);
});

test("tool-slots: pre-commit has no per-unit call site", () => {
  const hits = [];
  for (const d of ["scripts", "hooks", "workflows", "agents", "commands"]) {
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.(mjs|js|md|json|sh)$/.test(e.name) && /pre-commit run/.test(fs.readFileSync(f, "utf8"))) hits.push(path.relative(ROOT, f));
      }
    };
    if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  }
  const allowed = new Set(["scripts/doc-checks.mjs", "scripts/doc-checks.test.mjs", "scripts/tool-slots.test.mjs"]);
  assert.deepEqual(hits.filter((h) => !allowed.has(h)), []);
});
