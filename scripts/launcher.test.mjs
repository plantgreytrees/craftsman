// hooks/run.sh is the one launcher every hook goes through. With node missing, a safety hook
// must fail closed (exit 2) and an advisory hook must say it is off, once per session
// (ARCH-SAFETY-02, ARCH-SAFETY-04).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN_SH = path.join(ROOT, "hooks", "run.sh");
const SAFETY = ["pre-guard.mjs", "agent-mode-guard.mjs", "orchestrate-scope-guard.mjs"];
const ADVISORY = ["quality-gate.mjs", "stop-gate.mjs", "session-context.mjs", "tracker-sync.mjs", "telemetry.mjs", "builtin-skill-context.mjs"];

// A PATH holding sh and the few tools run.sh may call, and no node.
function pathWithoutNode() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-nonode-"));
  for (const tool of ["sh", "mkdir", "tr", "id", "dirname", "cat", "rm", "uname"]) {
    const found = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
    if (found) fs.symlinkSync(found, path.join(bin, tool));
  }
  return bin;
}

function launch(script, { env = {}, input = "{}", sh = "sh" } = {}) {
  return spawnSync(sh, [RUN_SH, script], { encoding: "utf8", input, env: { ...env } });
}

const skipWindows = process.platform === "win32" ? "run.sh is POSIX sh; the node-less PATH case is covered on Linux and macOS in CI" : false;

test("run.sh: node missing, every safety hook exits 2 and names the failure", { skip: skipWindows }, () => {
  const bin = pathWithoutNode();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-launch-"));
  try {
    for (const script of SAFETY) {
      const r = launch(`scripts/${script}`, { env: { PATH: bin, TMPDIR: tmp, CLAUDE_CODE_SESSION_ID: "s-safety" } });
      assert.equal(r.status, 2, `${script}: ${r.stderr}`);
      assert.match(r.stderr, /craftsman: node not found, guards cannot run/);
    }
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run.sh: node missing, an advisory hook exits 0 and warns once per session", { skip: skipWindows }, () => {
  const bin = pathWithoutNode();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-launch-"));
  try {
    const env = (sid) => ({ PATH: bin, TMPDIR: tmp, CLAUDE_CODE_SESSION_ID: sid });
    const text = (r) => r.stdout + r.stderr;
    for (const [i, script] of ADVISORY.entries()) {
      const sid = `s-advisory-${i}`;
      const first = launch(`scripts/${script}`, { env: env(sid) });
      assert.equal(first.status, 0, `${script}: ${first.stderr}`);
      assert.equal(text(first).split("craftsman disabled: node not found").length - 1, 1, `${script}: one warning on the first call`);
      const second = launch(`scripts/${script}`, { env: env(sid) });
      assert.equal(second.status, 0);
      assert.equal(text(second), "", `${script}: nothing on the second call`);
    }
    const other = launch("scripts/stop-gate.mjs", { env: env("another-session") });
    assert.match(other.stdout + other.stderr, /craftsman disabled: node not found/, "a new session warns again");
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run.sh: node present, runs the script with stdin forwarded and its exit code kept", () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plugin-"));
  try {
    fs.mkdirSync(path.join(plugin, "scripts"));
    fs.writeFileSync(path.join(plugin, "scripts", "echo-input.mjs"),
      'let s = ""; for await (const c of process.stdin) s += c; process.stdout.write("got:" + s); process.exit(3);\n');
    const r = launch("scripts/echo-input.mjs", { env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin }, input: '{"a":1}' });
    assert.equal(r.status, 3);
    assert.equal(r.stdout, 'got:{"a":1}');
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test("run.sh: a bare script name works too, and anything that is not a plain .mjs name is refused with exit 2", () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plugin-"));
  try {
    fs.mkdirSync(path.join(plugin, "scripts"));
    fs.writeFileSync(path.join(plugin, "scripts", "ok.mjs"), "process.exit(0);\n");
    const env = { ...process.env, CLAUDE_PLUGIN_ROOT: plugin };
    assert.equal(launch("ok.mjs", { env }).status, 0);
    for (const bad of ["", "../x.mjs", "scripts/../x.mjs", "a/b.mjs", "x.sh", "x.mjs;ls", ".hidden.mjs", "x y.mjs"]) {
      const r = launch(bad, { env });
      assert.equal(r.status, 2, `refused: ${JSON.stringify(bad)}`);
      assert.match(r.stderr, /invalid hook script/);
    }
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test("run.sh: POSIX sh only — parses under sh -n and uses no bash-only syntax", () => {
  assert.equal(spawnSync("sh", ["-n", RUN_SH], { encoding: "utf8" }).status, 0);
  const text = fs.readFileSync(RUN_SH, "utf8");
  assert.match(text, /^#!\/bin\/sh\n/);
  assert.doesNotMatch(text, /\[\[|\bfunction\s+\w+|<\(|\$\{[^}]*\/\/|\bsource\s/);
});
