// ARCH-SAFETY-10: /craftsman:init offers to merge sandbox settings, never overwrite them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as sm from "./settings-merge.mjs";

const ASK = ["Bash(rm -r *)", "Bash(rm -rf *)", "Bash(sudo *)", "Bash(git push --force *)", "Bash(git reset --hard *)", "Bash(git clean *)"];

test("SANDBOX_BLOCK: sandbox on plus ask rules for rm -r(f), sudo, force push, reset --hard and clean", () => {
  assert.deepEqual(sm.SANDBOX_BLOCK, { sandbox: { enabled: true }, permissions: { ask: ASK } });
});

test("mergeSettings: no file at all gets the whole block", () => {
  for (const current of [null, "", "  \n"]) {
    const r = sm.mergeSettings(current);
    assert.equal(r.ok, true);
    assert.equal(r.changed, true);
    assert.deepEqual(JSON.parse(r.next), sm.SANDBOX_BLOCK);
    assert.ok(r.next.endsWith("\n"));
  }
});

test("mergeSettings: existing keys, other arrays and key order are preserved; ask rules are unioned", () => {
  const current = JSON.stringify({
    model: "opus", env: { A: "1" },
    permissions: { allow: ["Bash(npm test)"], ask: ["Bash(sudo *)", "Read(.env)"], deny: ["Read(~/.ssh/**)"] },
    sandbox: { network: { allowedDomains: ["example.com"] } },
    hooks: { Stop: [{ hooks: [] }] },
  }, null, 2);
  const r = sm.mergeSettings(current);
  const next = JSON.parse(r.next);
  assert.equal(next.model, "opus");
  assert.deepEqual(next.env, { A: "1" });
  assert.deepEqual(next.hooks, { Stop: [{ hooks: [] }] });
  assert.deepEqual(next.permissions.allow, ["Bash(npm test)"]);
  assert.deepEqual(next.permissions.deny, ["Read(~/.ssh/**)"]);
  assert.deepEqual(next.permissions.ask, ["Bash(sudo *)", "Read(.env)", "Bash(rm -r *)", "Bash(rm -rf *)", "Bash(git push --force *)", "Bash(git reset --hard *)", "Bash(git clean *)"]);
  assert.deepEqual(next.sandbox, { network: { allowedDomains: ["example.com"] }, enabled: true });
  assert.deepEqual(Object.keys(next).slice(0, 5), ["model", "env", "permissions", "sandbox", "hooks"], "existing key order is kept");
});

test("mergeSettings: a rule already present is not added twice, and a second merge changes nothing", () => {
  const once = sm.mergeSettings("{}").next;
  const twice = sm.mergeSettings(once);
  assert.equal(twice.changed, false);
  assert.equal(twice.next, once);
  assert.deepEqual(twice.added, []);
  assert.equal(JSON.parse(once).permissions.ask.filter((r) => r === "Bash(sudo *)").length, 1);
});

test("mergeSettings: a deliberate sandbox.enabled false is kept, and reported", () => {
  const r = sm.mergeSettings(JSON.stringify({ sandbox: { enabled: false } }));
  assert.equal(JSON.parse(r.next).sandbox.enabled, false);
  assert.deepEqual(r.kept, ["sandbox.enabled stays false (set in your file)"]);
});

test("mergeSettings: invalid JSON, or JSON that is not an object, aborts and offers no text to write", () => {
  for (const bad of ["{ not json", "[]", "42", '"x"']) {
    const r = sm.mergeSettings(bad);
    assert.equal(r.ok, false, bad);
    assert.match(r.error, /settings\.json/);
    assert.equal(r.next, undefined);
  }
});

test("renderSettingsDiff: lists each addition, and says so when there is nothing to add", () => {
  const diff = sm.renderSettingsDiff(sm.mergeSettings(JSON.stringify({ permissions: { ask: ["Bash(sudo *)"] } })));
  assert.match(diff, /\+ sandbox\.enabled: true/);
  assert.match(diff, /\+ permissions\.ask: Bash\(rm -rf \*\)/);
  assert.doesNotMatch(diff, /permissions\.ask: Bash\(sudo \*\)/);
  assert.match(sm.renderSettingsDiff(sm.mergeSettings(sm.mergeSettings("{}").next)), /nothing to add/);
});

// sandboxEnabledAnywhere reads real scopes, so every case points it at a temp tree.
function scopes() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-sandbox-scopes-"));
  const dirs = { user: path.join(base, "user"), root: path.join(base, "proj"), managed: path.join(base, "managed") };
  for (const d of [dirs.user, path.join(dirs.root, ".claude"), dirs.managed]) fs.mkdirSync(d, { recursive: true });
  const put = (file, value) => fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  const check = () => sm.sandboxEnabledAnywhere({ root: dirs.root, userDir: dirs.user, managedDirs: [dirs.managed] });
  return { base, dirs, put, check };
}

test("sandboxEnabledAnywhere: false with no scope, true when any one of user, project, local or managed enables it", () => {
  const s = scopes();
  try {
    assert.equal(s.check(), false);
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: false } });
    assert.equal(s.check(), false, "enabled:false is not enabled");
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true } });
    assert.equal(s.check(), true, "user");
    fs.rmSync(path.join(s.dirs.user, "settings.json"));
    s.put(path.join(s.dirs.root, ".claude", "settings.json"), { sandbox: { enabled: true } });
    assert.equal(s.check(), true, "project");
    fs.rmSync(path.join(s.dirs.root, ".claude", "settings.json"));
    s.put(path.join(s.dirs.root, ".claude", "settings.local.json"), { sandbox: { enabled: true } });
    assert.equal(s.check(), true, "local");
    fs.rmSync(path.join(s.dirs.root, ".claude", "settings.local.json"));
    s.put(path.join(s.dirs.managed, "managed-settings.json"), { sandbox: { enabled: true } });
    assert.equal(s.check(), true, "managed file");
    fs.rmSync(path.join(s.dirs.managed, "managed-settings.json"));
    fs.mkdirSync(path.join(s.dirs.managed, "managed-settings.d"));
    s.put(path.join(s.dirs.managed, "managed-settings.d", "10-sandbox.json"), { sandbox: { enabled: true } });
    assert.equal(s.check(), true, "managed drop-in");
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

test("sandboxEnabledAnywhere: an unreadable or malformed scope file counts as not enabled, never throws", () => {
  const s = scopes();
  try {
    s.put(path.join(s.dirs.user, "settings.json"), "{ broken");
    assert.equal(s.check(), false);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});
