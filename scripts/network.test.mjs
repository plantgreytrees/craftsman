// ARCH-LAND-19: a sandboxed runner has no credentials; network steps run in root or are deferred.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { inspectRepo, merge, networkAction, prepare } from "./repo-exec.mjs";
import { NeedsNetwork, drainQueue, readQueue, scrub } from "./lib/network.mjs";
import { projectContext } from "./lib/core.mjs";

const REPO_EXEC = new URL("./repo-exec.mjs", import.meta.url).pathname;

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-network-"));
  const root = path.join(workspace, "one");
  fs.mkdirSync(root);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(root, "README.md"), "one\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-q", "-m", "init"]);
  const manifest = path.join(workspace, "craftsman.workspace.json");
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: { one: { root: "one" } } }));
  const origin = path.join(workspace, "one-origin.git");
  git(workspace, ["init", "-q", "--bare", origin]);
  git(root, ["remote", "add", "origin", origin]);
  const base = git(root, ["branch", "--show-current"]);
  git(root, ["push", "-q", "-u", "origin", base]);
  return { workspace, manifest, root, origin, base };
}

function withManifest(file, callback) {
  const previous = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = file;
  try { return callback(); }
  finally {
    if (previous === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
    else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = previous;
  }
}

const OFFLINE = { network: "offline" };

function commitUnit(context, info, slug) {
  const prepared = prepare(context, { ...OFFLINE, unit: slug, slug }, info);
  fs.writeFileSync(path.join(prepared.worktree_path, `${slug}.txt`), `${slug}\n`);
  git(prepared.worktree_path, ["add", `${slug}.txt`]);
  git(prepared.worktree_path, ["commit", "-q", "-m", `feat: ${slug}`]);
  return prepared;
}

test("network: root fetches, an offline runner lands locally and queues the push, root drains it", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      networkAction(context, { step: "fetch", base_branch: data.base }, info);
      const prepared = commitUnit(context, info, "u1");
      const before = git(data.origin, ["rev-parse", data.base]);
      const merged = merge(context, { ...OFFLINE, ...prepared, unit: "u1", slug: "u1" }, info);
      assert.equal(merged.merged, true);
      assert.equal(merged.pushed, false);
      assert.equal(merged.network_pending, true);
      assert.equal(git(data.origin, ["rev-parse", data.base]), before, "the runner never touched origin");
      assert.equal(readQueue(info).length, 1);
      assert.equal(networkAction(context, { step: "status" }, info).queue.length, 1);

      const drained = networkAction(context, { step: "drain" }, info);
      assert.deepEqual(drained.parked, []);
      assert.equal(drained.pushed.length, 1);
      assert.equal(git(data.origin, ["rev-parse", data.base]), git(context.root, ["rev-parse", data.base]));
      assert.equal(readQueue(info).length, 0);
      assert.equal(git(context.root, ["for-each-ref", "refs/craftsman/pending"]), "", "pins are released");
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network: a drain whose push origin refuses PARKs with a decision and empties the queue", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      networkAction(context, { step: "fetch", base_branch: data.base }, info);
      const prepared = commitUnit(context, info, "u1");
      merge(context, { ...OFFLINE, ...prepared, unit: "u1", slug: "u1" }, info);
      const other = path.join(data.workspace, "other");
      git(data.workspace, ["clone", "-q", data.origin, other]);
      git(other, ["config", "user.email", "t@t"]); git(other, ["config", "user.name", "t"]);
      fs.writeFileSync(path.join(other, "x.txt"), "x\n");
      git(other, ["add", "x.txt"]); git(other, ["commit", "-q", "-m", "moved"]);
      git(other, ["push", "-q", "origin", `HEAD:${data.base}`]);
      const moved = git(data.origin, ["rev-parse", data.base]);
      const drained = networkAction(context, { step: "drain" }, info);
      assert.equal(drained.parked.length, 1);
      assert.equal(drained.parked[0].reason, "rejected-push");
      assert.ok(drained.parked[0].decision.options.length >= 2);
      assert.equal(git(data.origin, ["rev-parse", data.base]), moved, "nothing forced");
      assert.equal(readQueue(info).length, 0);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network: offline with a stale or missing fetch fails closed before any worktree exists", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      assert.throws(
        () => prepare(context, { ...OFFLINE, unit: "u1", slug: "u1" }, info),
        (error) => error instanceof NeedsNetwork && /OUTSIDE the sandbox/.test(error.message) && error.action.step === "fetch",
      );
      assert.equal(fs.existsSync(path.join(data.root, ".worktrees")), false);
      networkAction(context, { step: "fetch", base_branch: data.base }, info);
      prepare(context, { ...OFFLINE, unit: "u1", slug: "u1" }, info);
      fs.writeFileSync(path.join(context.root, "craftsman.config.json"), JSON.stringify({ repoExec: { offlineMaxFetchAgeMinutes: -1 } }));
      assert.throws(() => prepare(context, { ...OFFLINE, unit: "u2", slug: "u2" }, info), /minutes old/);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network: pr mode and the root-only network action refuse offline without touching origin", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      fs.writeFileSync(path.join(context.root, "craftsman.config.json"), JSON.stringify({ repoExec: { land: "pr" } }));
      const info = inspectRepo(context, { base_branch: data.base });
      networkAction(context, { step: "fetch", base_branch: data.base }, info);
      const prepared = commitUnit(context, info, "u1");
      assert.throws(() => merge(context, { ...OFFLINE, ...prepared, unit: "u1", slug: "u1" }, info), NeedsNetwork);
      assert.equal(git(data.origin, ["branch", "--list", prepared.branch]), "");
      assert.throws(() => networkAction(context, { ...OFFLINE, step: "drain" }, info), NeedsNetwork);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

// A host that answers 401 to everything: git inside the sandbox sees exactly
// "could not read Username" / "Authentication failed", with no helper to ask.
async function authWall() {
  const child = spawn(process.execPath, ["-e", "require('http').createServer((q,s)=>{s.writeHead(401,{'WWW-Authenticate':'Basic realm=x'});s.end()}).listen(0,'127.0.0.1',function(){console.log(this.address().port)})"], { stdio: ["ignore", "pipe", "ignore"] });
  const port = await new Promise((resolve) => child.stdout.once("data", (chunk) => resolve(Number(String(chunk).trim()))));
  return { port, stop: () => child.kill() };
}

test("network: no credentials in the sandbox — probe goes offline, one clear message, no secret anywhere", async () => {
  const data = fixture();
  const wall = await authWall();
  try {
    const secret = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
    git(data.root, ["remote", "set-url", "origin", `http://x-access-token:${secret}@127.0.0.1:${wall.port}/o/r.git`]);
    git(data.root, ["update-ref", `refs/remotes/origin/${data.base}`, "HEAD"]);
    await withManifest(data.manifest, async () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      // The same call as the evidence: prepare -> fetch origin, with no network mode forced.
      const run = (input) => spawnSync(process.execPath, [REPO_EXEC], {
        input: JSON.stringify({ project: "one", base_branch: data.base, ...input }), encoding: "utf8",
        env: { ...process.env, CRAFTSMAN_NETWORK: "" },
      });
      const prep = run({ action: "prepare", unit: "u1", slug: "u1" });
      assert.equal(prep.status, 3, prep.stderr);
      const out = JSON.parse(prep.stdout);
      assert.equal(out.needs_network, true);
      assert.deepEqual(out.action, { action: "network", step: "fetch", project: "one", base_branch: data.base });
      assert.match(prep.stderr, /OUTSIDE the sandbox/);
      assert.match(prep.stderr, /do not allowlist credential directories/);
      assert.doesNotMatch(prep.stderr + prep.stdout, /could not read Username|Authentication failed/, "no raw git error to interpret");

      // Forced online with no credentials: the raw git failure becomes the same message.
      const fetch = run({ action: "network", step: "fetch", network: "online" });
      assert.equal(fetch.status, 3, fetch.stderr);
      assert.match(fetch.stderr, /needs credentials this process does not have/);

      for (const text of [prep.stderr, prep.stdout, fetch.stderr, fetch.stdout, JSON.stringify(readQueue(info)), scrub(`fatal: unable to access 'http://u:${secret}@h/r.git'`)]) {
        assert.doesNotMatch(text, new RegExp(secret));
      }
      assert.equal(fs.existsSync(path.join(data.root, ".worktrees")), false);
    });
  } finally { wall.stop(); fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network: the drain and queue use plain refspecs — no force, reset or +refspec", () => {
  const src = fs.readFileSync(new URL("./lib/network.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /--force|--mirror|"-f"|reset["'`, ]+--hard|\+refs|\$\{[^}]*\}:\+/);
  assert.equal(typeof drainQueue, "function");
});
