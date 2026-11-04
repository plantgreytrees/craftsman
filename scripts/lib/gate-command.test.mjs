import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { binOnPath, findGateCommand, gateUsable } from "./gate-command.mjs";
import { deepMerge } from "./core.mjs";

const defaults = { stopGate: { commands: { justfile: "just check", "package.json": "npm test --silent", "go.mod": "go test ./..." } } };
const tree = (...files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-cmd-"));
  for (const f of files) fs.writeFileSync(path.join(dir, f), "{}");
  return dir;
};
const has = (...targets) => ({ onPath: () => true, justTargets: () => targets });

test("gate-command: a project config declaring only package.json still resolves past a justfile with no check recipe", () => {
  const cfg = deepMerge(defaults, { stopGate: { commands: { "package.json": "pnpm -s test" } } });
  const dir = tree("package.json", "justfile");
  assert.equal(findGateCommand(dir, cfg, has("build")), "pnpm -s test");
});

test("gate-command: a missing just binary falls through", () => {
  const dir = tree("package.json", "justfile");
  assert.equal(findGateCommand(dir, defaults, { onPath: (b) => b !== "just", justTargets: () => ["check"] }), "npm test --silent");
});

test("gate-command: a null or empty marker is skipped, not returned", () => {
  const dir = tree("package.json", "go.mod");
  assert.equal(findGateCommand(dir, deepMerge(defaults, { stopGate: { commands: { justfile: null, "package.json": null } } }), has()), "go test ./...");
  assert.equal(findGateCommand(dir, deepMerge(defaults, { stopGate: { commands: { "package.json": "" } } }), has()), "go test ./...");
  assert.equal(findGateCommand(tree("package.json"), deepMerge(defaults, { stopGate: { commands: { "package.json": null } } }), has()), null);
});

test("gate-command: a justfile whose just --summary lists check resolves to just check", () => {
  const dir = tree("package.json", "justfile");
  assert.equal(findGateCommand(dir, defaults, has("build", "check")), "just check");
});

test("gate-command: nothing detected is null", () => {
  assert.equal(findGateCommand(tree(), defaults, has("check")), null);
});

// ARCH-ENGINE-22: a project tool is skipped silently when its program is absent. `onPath` is injected so no real PATH is read.
const cfgOf = (command, marker = "package.json") => ({ stopGate: { commands: { [marker]: command } } });
const only = (...names) => ({ onPath: (bin) => names.includes(bin), justTargets: () => [] });

test("gate-command: a command whose program is neither on PATH nor a file is not usable", () => {
  const dir = tree("package.json");
  assert.equal(gateUsable(dir, "package.json", "craftsman-no-such-program --check", only("node")), false);
  assert.equal(findGateCommand(dir, cfgOf("craftsman-no-such-program --check"), only("node")), null);
  // The real PATH agrees: nothing by this name is on it.
  assert.equal(gateUsable(dir, "package.json", "craftsman-no-such-program --check"), false);
});

test("gate-command: a missing program falls through to the next marker's usable command", () => {
  const dir = tree("package.json", "go.mod");
  const cfg = { stopGate: { commands: { "package.json": "pnpm -s test", "go.mod": "go test ./..." } } };
  assert.equal(findGateCommand(dir, cfg, only("go")), "go test ./...");
  assert.equal(findGateCommand(dir, cfg, only("pnpm", "go")), "pnpm -s test");
});

test("gate-command: a program on PATH is usable", () => {
  const dir = tree("package.json");
  assert.equal(gateUsable(dir, "package.json", "pnpm -s test", only("pnpm")), true);
  assert.equal(findGateCommand(dir, cfgOf("pnpm -s test"), only("pnpm")), "pnpm -s test");
  // binOnPath reads the real PATH: an executable put on it is found, an absent name is not.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "gate-cmd-bin-"));
  fs.writeFileSync(path.join(bin, "craftsman-gate-probe"), "#!/bin/sh\n", { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    assert.equal(binOnPath("craftsman-gate-probe"), true);
    assert.equal(gateUsable(dir, "package.json", "craftsman-gate-probe --run"), true);
    assert.equal(binOnPath("craftsman-gate-absent"), false);
  } finally { process.env.PATH = saved; }
});

test("gate-command: a program with a slash is an existing file relative to the worktree, never looked up on PATH", () => {
  const dir = tree("package.json");
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(path.join(dir, "bin", "x"), "#!/bin/sh\n", { mode: 0o755 });
  fs.mkdirSync(path.join(dir, "my tools"));
  fs.writeFileSync(path.join(dir, "my tools", "run"), "#!/bin/sh\n", { mode: 0o755 });
  const none = only();
  assert.equal(gateUsable(dir, "package.json", "./bin/x --flag", none), true);
  assert.equal(gateUsable(dir, "package.json", "bin/x", none), true);
  assert.equal(gateUsable(dir, "package.json", '"./my tools/run" --flag', none), true);
  assert.equal(gateUsable(dir, "package.json", "./bin/missing --flag", none), false);
  assert.equal(gateUsable(dir, "package.json", "./bin/x", { onPath: () => true }), true);
  // PATH holding the bare name does not stand in for a missing relative file.
  assert.equal(gateUsable(dir, "package.json", "./bin/missing", { onPath: () => true }), false);
  // It is relative to the worktree it is asked about, not the process's directory.
  assert.equal(gateUsable(tree("package.json"), "package.json", "./bin/x", none), false);
  assert.equal(gateUsable(dir, "package.json", `${path.join(dir, "bin", "x")} --flag`, none), true);
});

test("gate-command: just behaves as before, its program being just and its target in the summary", () => {
  const dir = tree("justfile");
  assert.equal(gateUsable(dir, "justfile", "just check", { onPath: () => true, justTargets: () => ["check"] }), true);
  assert.equal(gateUsable(dir, "justfile", "just check", { onPath: () => true, justTargets: () => ["build"] }), false);
  assert.equal(gateUsable(dir, "justfile", "just check", { onPath: () => false, justTargets: () => ["check"] }), false);
  assert.equal(gateUsable(dir, "justfile", "just", { onPath: () => true, justTargets: () => ["default"] }), true);
  // A file named just in the worktree is not consulted: just is a PATH program.
  fs.writeFileSync(path.join(dir, "just"), "#!/bin/sh\n", { mode: 0o755 });
  assert.equal(gateUsable(dir, "justfile", "just check", { onPath: (b) => b !== "just", justTargets: () => ["check"] }), false);
});
