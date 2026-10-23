import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findGateCommand } from "./lib/gate-command.mjs";
import { deepMerge } from "./lib/core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "craftsman.config.json"), "utf8"));

const lookup = (dir, config = cfg, just = ["check"]) => findGateCommand(dir, config, { onPath: () => true, justTargets: () => just });

test("tool-slots: justfile is the first marker so `just check` wins when a check recipe exists", () => {
  assert.equal(Object.keys(cfg.stopGate.commands)[0], "justfile");
  assert.equal(cfg.stopGate.commands.justfile, "just check");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-slots-"));
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  assert.equal(lookup(dir), "npm test --silent");
  fs.writeFileSync(path.join(dir, "justfile"), "check:\n\ttrue\n");
  assert.equal(lookup(dir), "just check");
});

test("tool-slots: a deepMerge'd project config falls past a justfile with no check recipe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-slots-"));
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  fs.writeFileSync(path.join(dir, "justfile"), "build:\n\ttrue\n");
  const merged = deepMerge(cfg, { stopGate: { commands: { "package.json": "pnpm -s test" } } });
  assert.equal(lookup(dir, merged, ["build"]), "pnpm -s test");
});

test("tool-slots: a project drops the justfile marker by setting it to null", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-slots-"));
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  fs.writeFileSync(path.join(dir, "justfile"), "check:\n\ttrue\n");
  const merged = deepMerge(cfg, { stopGate: { commands: { justfile: null } } });
  assert.equal(lookup(dir, merged), "npm test --silent");
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
