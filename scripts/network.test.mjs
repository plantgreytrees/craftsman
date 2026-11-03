// ARCH-LAND-19: a sandboxed runner has no credentials; network steps run in root or are deferred.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { inspectRepo, merge, networkAction, prepare } from "./repo-exec.mjs";
import * as net from "./lib/network.mjs";
import { NeedsNetwork, drainQueue, enqueueDelete, enqueuePush, readQueue, scrub } from "./lib/network.mjs";
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
      assert.equal(readQueue(info)[0].dst, data.base, "direct-land mode: the unit merge queues a push of base (ARCH-LAND-36)");
      assert.equal(networkAction(context, { step: "status" }, info).queue.length, 1);

      const drained = networkAction(context, { step: "drain" }, info);
      assert.deepEqual(drained.parked, []);
      assert.equal(drained.pushed.length, 1);
      assert.deepEqual(drained.pushed.map(({ branch }) => branch), [data.base], "root's drain pushes base in direct-land mode");
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

// ARCH-LAND-36: the queue is plain JSONL in the common git dir, so any process that can write it can forge an
// entry. Root's drain judges every entry before it touches origin. BASE stands for the fixture's base branch.
// [kind, dst, drains in feature mode, drains in direct-land mode]
const DRAIN_ROWS = [
  ["push", "BASE", false, true],
  ["push", "feat/x", true, true],
  ["push", "feature/p-f1", true, true],
  ["push", "develop", false, false],
  ["push", "refs/tags/x", false, false],
  ["push", "+BASE", false, false],
  ["push", "feat/../BASE", false, false],
  ["delete", "feat/x", true, true],
  ["delete", "BASE", false, false],
  ["delete", "feature/p-f1", false, false],
];

const eventsOf = (context) => {
  try { return fs.readFileSync(path.join(context.stateDir, "events.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; }
};
const heads = (origin) => git(origin, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]);
const hasHead = (origin, name) => spawnSync("git", ["-C", origin, "rev-parse", "--verify", "--quiet", `refs/heads/${name}`], { encoding: "utf8" }).status === 0;
const setFeatureMode = (context, on) => fs.writeFileSync(path.join(context.root, "craftsman.config.json"), JSON.stringify({ planning: { featureBranches: on } }));

// A fixture whose origin would really delete its checked-out branch, so a refused delete of base is the drain's doing.
function drainFixture() {
  const data = fixture();
  git(data.origin, ["config", "receive.denyDeleteCurrent", "ignore"]);
  return data;
}

for (const [kind, row, inFeature, inDirect] of DRAIN_ROWS) {
  for (const [mode, drains] of [["feature", inFeature], ["direct-land", inDirect]]) {
    test(`network drain (${mode} mode): a ${kind} of ${row} ${drains ? "drains" : "is refused, logged and returned for a PARK"}`, () => {
      const data = drainFixture();
      try {
        withManifest(data.manifest, () => {
          const context = projectContext("one");
          const info = inspectRepo(context, { base_branch: data.base });
          const dst = row.replace("BASE", data.base);
          const sha = git(data.root, ["rev-parse", "HEAD"]);
          if (kind === "delete" && dst !== data.base) git(data.root, ["push", "-q", "origin", `HEAD:refs/heads/${dst}`]);
          if (kind === "push") enqueuePush(data.root, info, { sha, dst, reason: "forged" });
          else enqueueDelete(info, dst);
          const before = heads(data.origin);

          const result = net.drainQueue(data.root, info, { directLand: mode === "direct-land" });

          assert.deepEqual(readQueue(info), [], "every entry leaves the queue");
          assert.equal(git(data.root, ["for-each-ref", "refs/craftsman/pending"]), "", "pins are released");
          const logged = eventsOf(context).filter((event) => event.ev === "drain_refused");
          if (drains) {
            assert.deepEqual(result.rejected, []);
            assert.deepEqual(logged, []);
            if (kind === "push") assert.equal(git(data.origin, ["rev-parse", `refs/heads/${dst}`]), sha);
            else assert.equal(hasHead(data.origin, dst), false, "the unit branch is gone from origin");
          } else {
            assert.deepEqual(result.pushed, []);
            assert.equal(result.rejected.length, 1);
            assert.equal(result.rejected[0].entry.dst, dst);
            assert.equal(typeof result.rejected[0].refused, "string", "a refusal carries its reason");
            assert.equal(heads(data.origin), before, "nothing reached origin");
            assert.equal(logged.length, 1);
            assert.equal(logged[0].kind, kind);
            assert.equal(logged[0].dst, dst);
            assert.equal(logged[0].reason, result.rejected[0].refused);
            assert.ok(hasHead(data.origin, data.base), "base is still on origin");
          }
        });
      } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
    });
  }
}

test("network drain: drainVerdict is pure and judges kind, dst, pin and mode", () => {
  const pin = "refs/craftsman/pending/a1-1-0";
  const verdict = (entry, directLand) => net.drainVerdict(entry, { baseBranch: "main", directLand });
  assert.deepEqual(verdict({ kind: "push", dst: "main", pin }, true), { ok: true });
  assert.equal(verdict({ kind: "push", dst: "main", pin }, false).ok, false);
  assert.deepEqual(verdict({ kind: "push", dst: "feat/x", pin }, false), { ok: true });
  assert.deepEqual(verdict({ kind: "push", dst: "feature/p-f1", pin }, false), { ok: true });
  assert.deepEqual(verdict({ kind: "delete", dst: "feat/x" }, true), { ok: true });
  for (const entry of [
    { kind: "push", dst: "develop", pin }, { kind: "push", dst: "refs/tags/x", pin }, { kind: "push", dst: "+main", pin },
    { kind: "push", dst: "feat/../main", pin }, { kind: "push", dst: "feat/x:refs/heads/main", pin }, { kind: "push", dst: "feat/x", pin: "refs/heads/main" },
    { kind: "push", dst: "feat/x", pin: "+refs/heads/main" }, { kind: "push", dst: "feat/x" }, { kind: "push", dst: "-f", pin }, { kind: "push", dst: "feat/x.lock", pin },
    { kind: "delete", dst: "main" }, { kind: "delete", dst: "feature/p-f1" }, { kind: "delete", dst: "feat/../main" }, { kind: "delete", dst: "develop" },
    { kind: "force-push", dst: "feat/x", pin }, { dst: "feat/x", pin }, { kind: "push", pin }, null,
  ]) {
    for (const directLand of [true, false]) {
      const result = verdict(entry, directLand);
      assert.equal(result.ok, false, JSON.stringify(entry));
      assert.match(result.reason, /\S/);
    }
  }
});

test("network drain: refused entries in the middle of a queue leave it and the others still drain, in order", () => {
  const data = drainFixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      const sha = git(data.root, ["rev-parse", "HEAD"]);
      git(data.root, ["push", "-q", "origin", "HEAD:refs/heads/feat/old"]);
      enqueuePush(data.root, info, { sha, dst: "feat/x" });
      enqueuePush(data.root, info, { sha, dst: "develop" });
      enqueueDelete(info, data.base);
      enqueuePush(data.root, info, { sha, dst: "feature/p-f1" });
      enqueueDelete(info, "feat/old");
      const result = net.drainQueue(data.root, info, { directLand: false });
      assert.deepEqual(result.pushed.map(({ dst }) => dst), ["feat/x", "feature/p-f1"]);
      assert.deepEqual(result.rejected.map(({ entry }) => entry.dst), ["develop", data.base]);
      assert.equal(hasHead(data.origin, "develop"), false);
      assert.ok(hasHead(data.origin, data.base));
      assert.equal(hasHead(data.origin, "feat/old"), false, "the later delete of a unit branch still ran");
      assert.deepEqual(readQueue(info), []);
      assert.equal(eventsOf(context).filter((event) => event.ev === "drain_refused").length, 2);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

// A hook on origin that answers per ref: `denied` is declined with a plain message (origin reachable, push refused);
// `lost` is answered 401 (the credential died between two pushes, so the drain cannot reach origin as itself).
function originAnswers(origin, { denied = [], lost = [] }) {
  const arm = (names, text) => names.map((name) => `  refs/heads/${name}) echo "${text}" >&2; exit 1 ;;`);
  const script = ["#!/bin/sh", 'case "$1" in', ...arm(denied, "protected branch"), ...arm(lost, "HTTP 401"), "esac", "exit 0", ""].join("\n");
  fs.mkdirSync(path.join(origin, "hooks"), { recursive: true });
  fs.writeFileSync(path.join(origin, "hooks", "update"), script, { mode: 0o755 });
}

function drainError(root, info, options) {
  try { net.drainQueue(root, info, options); } catch (error) { return error; }
  return assert.fail("the drain was expected to stop on an unreachable origin");
}

const pinsOf = (root) => git(root, ["for-each-ref", "--format=%(refname)", "refs/craftsman/pending"]).split("\n").filter(Boolean).sort();
const refusals = (context) => eventsOf(context).filter((event) => event.ev === "drain_refused");

// ARCH-LAND-36, ARCH-LAND-19: an entry that left the queue before the drain lost the network was dropped with the thrown
// error. It must reach a PARK decision (carried on the error as `rejected`) or stay queued, and its pin goes only with it.
test("network drain: a refused entry followed by an unreachable one is handed over on the thrown error and the rest stay queued", () => {
  const data = drainFixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      const sha = git(data.root, ["rev-parse", "HEAD"]);
      originAnswers(data.origin, { lost: ["feat/lost"] });
      enqueuePush(data.root, info, { sha, dst: "develop" });
      const lost = enqueuePush(data.root, info, { sha, dst: "feat/lost" });
      const after = enqueuePush(data.root, info, { sha, dst: "feat/after" });
      const before = heads(data.origin);

      const error = drainError(data.root, info, { directLand: false });
      assert.equal(error.needsNetwork, true);
      assert.deepEqual(error.rejected.map(({ entry }) => entry.dst), ["develop"], "the refused entry is carried, not lost");
      assert.equal(typeof error.rejected[0].refused, "string", "a refusal carries its reason");
      assert.deepEqual(readQueue(info).map(({ id }) => id), [lost.id, after.id], "the unreachable entry and the one after it stay queued");
      assert.deepEqual(pinsOf(data.root), [lost.pin, after.pin].sort(), "a pin goes only with a final entry");
      assert.equal(heads(data.origin), before, "nothing reached origin");
      assert.deepEqual(refusals(context).map(({ dst }) => dst), ["develop"], "drain_refused is logged once");

      originAnswers(data.origin, {});
      const resumed = net.drainQueue(data.root, info, { directLand: false });
      assert.deepEqual(resumed.pushed.map(({ dst }) => dst), ["feat/lost", "feat/after"]);
      assert.deepEqual(resumed.rejected, [], "the handed-over entry is not judged twice");
      assert.deepEqual(readQueue(info), []);
      assert.deepEqual(pinsOf(data.root), []);
      assert.equal(refusals(context).length, 1);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network drain: an origin-rejected entry followed by an unreachable one is handed over on the thrown error and the rest stay queued", () => {
  const data = drainFixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      const sha = git(data.root, ["rev-parse", "HEAD"]);
      originAnswers(data.origin, { denied: ["feat/denied"], lost: ["feat/lost"] });
      enqueuePush(data.root, info, { sha, dst: "feat/denied" });
      const lost = enqueuePush(data.root, info, { sha, dst: "feat/lost" });
      const after = enqueuePush(data.root, info, { sha, dst: "feat/after" });
      const before = heads(data.origin);

      const error = drainError(data.root, info, { directLand: false });
      assert.equal(error.needsNetwork, true);
      assert.deepEqual(error.rejected.map(({ entry }) => entry.dst), ["feat/denied"], "the origin-rejected entry is carried, not lost");
      assert.equal(error.rejected[0].refused, undefined, "origin answered; the verdict did not refuse it");
      assert.match(error.rejected[0].error.stderr, /protected branch/);
      assert.deepEqual(readQueue(info).map(({ id }) => id), [lost.id, after.id]);
      assert.deepEqual(pinsOf(data.root), [lost.pin, after.pin].sort());
      assert.equal(heads(data.origin), before);
      assert.deepEqual(refusals(context), [], "origin refused it, the verdict did not");

      originAnswers(data.origin, {});
      const resumed = net.drainQueue(data.root, info, { directLand: false });
      assert.deepEqual(resumed.pushed.map(({ dst }) => dst), ["feat/lost", "feat/after"]);
      assert.deepEqual(resumed.rejected, []);
      assert.deepEqual(readQueue(info), []);
      assert.deepEqual(pinsOf(data.root), []);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network drain: an unreachable first entry hands nothing over and leaves the queue and its pins as they were", () => {
  const data = drainFixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      const sha = git(data.root, ["rev-parse", "HEAD"]);
      originAnswers(data.origin, { lost: ["feat/lost"] });
      const lost = enqueuePush(data.root, info, { sha, dst: "feat/lost" });
      const after = enqueuePush(data.root, info, { sha, dst: "feat/after" });
      const error = drainError(data.root, info, { directLand: false });
      assert.deepEqual(error.rejected, []);
      assert.deepEqual(readQueue(info).map(({ id }) => id), [lost.id, after.id]);
      assert.deepEqual(pinsOf(data.root), [lost.pin, after.pin].sort());
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network drain: a forged pin is refused and never reaches a refspec or update-ref -d", () => {
  const data = drainFixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      const sha = git(data.root, ["rev-parse", "HEAD"]);
      git(data.root, ["branch", "keep"]);
      fs.mkdirSync(path.join(info.common_git_dir, ".craftsman", "network"), { recursive: true });
      const forged = ["refs/heads/keep", "+refs/heads/keep", "HEAD"].map((pin, i) => ({ id: `forged-${i}`, kind: "push", dst: "feat/x", pin, sha }));
      fs.writeFileSync(path.join(info.common_git_dir, ".craftsman", "network", "queue.jsonl"), forged.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
      const before = heads(data.origin);
      const result = net.drainQueue(data.root, info, { directLand: true });
      assert.equal(result.rejected.length, 3);
      assert.deepEqual(result.pushed, []);
      assert.equal(heads(data.origin), before);
      assert.equal(git(data.root, ["rev-parse", "--verify", "refs/heads/keep"]), sha, "a pin outside refs/craftsman/pending is never deleted");
      assert.deepEqual(readQueue(info), []);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network drain: root's drain reads planning.featureBranches, and a refused entry PARKs with the dst in its question", () => {
  const data = drainFixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      const sha = git(data.root, ["rev-parse", "HEAD"]);
      git(data.root, ["commit", "-q", "--allow-empty", "-m", "ahead"]);
      const ahead = git(data.root, ["rev-parse", "HEAD"]);
      const queue = () => { enqueuePush(data.root, info, { sha: ahead, dst: data.base }); enqueuePush(data.root, info, { sha, dst: "develop" }); };

      setFeatureMode(context, true);
      queue();
      const refused = networkAction(context, { step: "drain" }, info);
      assert.deepEqual(refused.pushed, []);
      assert.deepEqual(refused.parked.map(({ reason }) => reason), ["drain-refused", "drain-refused"]);
      const develop = refused.parked.find((entry) => entry.branch === "develop");
      assert.match(develop.decision.question, /develop/, "the question names the refused dst");
      assert.ok(develop.decision.options.length >= 2);
      assert.equal(git(data.origin, ["rev-parse", data.base]), sha, "feature mode: base stayed where it was");
      assert.equal(hasHead(data.origin, "develop"), false);
      assert.deepEqual(readQueue(info), []);

      setFeatureMode(context, false);
      queue();
      const direct = networkAction(context, { step: "drain" }, info);
      assert.deepEqual(direct.pushed.map(({ branch }) => branch), [data.base]);
      assert.deepEqual(direct.parked.map(({ reason, branch }) => [reason, branch]), [["drain-refused", "develop"]]);
      assert.equal(git(data.origin, ["rev-parse", data.base]), ahead, "direct-land mode: base drains");
      assert.deepEqual(eventsOf(context).filter((event) => event.ev === "drain_refused").map(({ dst }) => dst), [data.base, "develop", "develop"]);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network drain: a legacy entry with upstream true drains and sets no upstream; enqueuePush takes no upstream", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context, { base_branch: data.base });
      const sha = git(data.root, ["rev-parse", "HEAD"]);
      git(data.root, ["config", "--local", "--remove-section", `branch.${data.base}`]); // the fixture pushed with -u
      const config = () => spawnSync("git", ["-C", data.root, "config", "--local", "--get-regexp", "^branch\\."], { encoding: "utf8" });
      assert.equal(config().stdout, "");

      const entry = enqueuePush(data.root, info, { sha, dst: "feat/x", upstream: true });
      assert.equal("upstream" in entry, false, "the entry no longer records an upstream");
      git(data.root, ["branch", "feat/legacy"]);
      enqueuePush(data.root, info, { sha, dst: "feat/legacy" });
      // Queues written before this change carry upstream: true on every push.
      const queueFile = path.join(info.common_git_dir, ".craftsman", "network", "queue.jsonl");
      fs.writeFileSync(queueFile, readQueue(info).map((queued) => JSON.stringify({ ...queued, upstream: true })).join("\n") + "\n");
      assert.ok(readQueue(info).every((queued) => queued.upstream === true));

      const result = net.drainQueue(data.root, info, { directLand: false });
      assert.deepEqual(result.rejected, []);
      assert.deepEqual(result.pushed.map(({ dst }) => dst), ["feat/x", "feat/legacy"]);
      assert.equal(config().stdout, "", "no branch.* config was written");
      assert.equal(config().status, 1);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("network: the NeedsNetwork message and commands/_network.md name the user-scope autoMode.allow entry and the classifier-refusal path", () => {
  const doc = fs.readFileSync(new URL("../commands/_network.md", import.meta.url), "utf8");
  for (const text of [new NeedsNetwork("origin is not fetched", {}).message, doc]) {
    assert.match(text, /autoMode\.allow/);
    assert.match(text, /--user-settings-diff/);
    assert.match(text, /classifier/);
    assert.match(text, /OUTSIDE the sandbox|outside the sandbox/);
  }
  assert.match(doc, /\[Safety Bypass Flag\]/);
  assert.match(doc, /\[Auto-Mode Bypass\]/);
  assert.match(doc, /like `needs_network`/);
  assert.match(doc, /park nothing/i);
});

test("network: commands/_network.md tells root a drain that exits 3 with parked[] PARKs each entry and then stops, and its park-nothing sentence carves that case out (ARCH-LAND-35, ARCH-ENGINE-19)", () => {
  const doc = fs.readFileSync(new URL("../commands/_network.md", import.meta.url), "utf8");
  // step 3 is where a drain's parked[] entries become PARKED tracker rows
  assert.match(doc, /^3\. \*\*Drain after\.\*\*[^\n]*`parked\[\]` entry[^\n]*`PARKED`/m);
  const section = doc.split(/^## /m).find((part) => part.startsWith("A run returns `needs_network`"));
  assert.ok(section, "the needs_network section exists");
  const sentences = section.split(/(?<=[.!?])\s+/);
  const drain = sentences.find((sentence) => /exits? 3/.test(sentence));
  assert.ok(drain, "the needs_network section tells root what a drain that exits 3 means");
  assert.match(drain, /\bdrain\b/);
  assert.match(drain, /`parked\[\]`/);
  assert.match(drain, /\bPARKs? each entry\b/);
  assert.match(drain, /as step 3 does/);
  assert.match(drain, /then stops?\b/);
  for (const sentence of sentences.filter((text) => /park nothing/i.test(text))) {
    assert.match(sentence, /\bdrain\b/, "park nothing is never said of a drain that carries parked[]");
  }
});
