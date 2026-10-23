// Tests for the Stop-time dashboard refresh in tracker-sync.mjs (ARCH-VIEWS-05/13).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inputFingerprint, stopRefresh, fingerprintPath } from "./tracker-sync.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYNC = path.join(HERE, "tracker-sync.mjs");
const mk = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tsync-")));
const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const ctxOf = (root) => ({ root, stateDir: path.join(root, ".craftsman") });
function fixture() {
  const root = mk();
  spawnSync("git", ["init", "-q"], { cwd: root });
  put(root, "docs/plans/alpha.md", "---\nslug: alpha\ngoal: A\n---\n");
  return root;
}
const events = (root) => {
  try { return fs.readFileSync(path.join(root, ".craftsman", "events.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
};
const hookEnv = (root) => ({ ...process.env, ["CLAUDE_PROJECT" + "_DIR"]: root });
const hook = (root, input) => spawnSync(process.execPath, [SYNC], { cwd: root, input, env: hookEnv(root), encoding: "utf8" });
const dash = (root) => path.join(root, ".craftsman", "export", "dashboard.html");

test("fingerprint: unchanged inputs match, a touched plan changes it", () => {
  const root = fixture();
  const a = inputFingerprint(ctxOf(root));
  assert.equal(inputFingerprint(ctxOf(root)), a);
  put(root, "docs/plans/alpha.md", "---\nslug: alpha\ngoal: A changed\n---\n");
  assert.notEqual(inputFingerprint(ctxOf(root)), a);
});

test("stopRefresh: renders once, then skips when inputs are unchanged and logs skipped", () => {
  const root = fixture();
  const c = ctxOf(root);
  assert.equal(stopRefresh(c), "rendered");
  assert.ok(fs.existsSync(dash(root)));
  assert.ok(fs.existsSync(fingerprintPath(c)));
  fs.rmSync(dash(root));
  assert.equal(stopRefresh(c), "skipped");
  assert.ok(!fs.existsSync(dash(root)));
  assert.ok(events(root).some((e) => e.ev === "dashboard_render" && e.skipped === true));
  put(root, "docs/plans/beta.md", "---\nslug: beta\ngoal: B\n---\n");
  assert.equal(stopRefresh(c), "rendered");
});

test("stopRefresh: a throwing renderer returns failed and stores no fingerprint", () => {
  const root = fixture();
  const bad = path.join(root, "bad.mjs");
  fs.writeFileSync(bad, "throw new Error('boom');\n");
  assert.equal(stopRefresh(ctxOf(root), { script: bad }), "failed");
  assert.ok(!fs.existsSync(fingerprintPath(ctxOf(root))));
});

test("stopRefresh: a renderer over budget is killed and reported failed", () => {
  const root = fixture();
  const slow = path.join(root, "slow.mjs");
  fs.writeFileSync(slow, "setTimeout(() => {}, 30000);\n");
  const t0 = Date.now();
  assert.equal(stopRefresh(ctxOf(root), { script: slow, budgetMs: 300 }), "failed");
  assert.ok(Date.now() - t0 < 5000);
});

test("stopRefresh: export.atStop false or export.enabled false renders nothing", () => {
  for (const cfg of [{ atStop: false }, { enabled: false }]) {
    const root = fixture();
    put(root, "craftsman.project.json", JSON.stringify({ export: cfg }));
    assert.equal(stopRefresh(ctxOf(root)), "disabled");
    assert.ok(!fs.existsSync(dash(root)));
  }
});

test("hook: Stop renders and exits 0; SessionStart and PostToolUse never render", () => {
  for (const ev of ["SessionStart", "PostToolUse"]) {
    const root = fixture();
    assert.equal(hook(root, JSON.stringify({ hook_event_name: ev })).status, 0);
    assert.ok(!fs.existsSync(dash(root)), `${ev} must not render`);
  }
  const root = fixture();
  assert.equal(hook(root, JSON.stringify({ hook_event_name: "Stop" })).status, 0);
  assert.ok(fs.existsSync(dash(root)));
});

test("hook: garbage stdin and a broken config still exit 0", () => {
  const root = fixture();
  put(root, "craftsman.project.json", "{not json");
  assert.equal(hook(root, "\u0000garbage").status, 0);
});
