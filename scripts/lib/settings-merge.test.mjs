// ARCH-SAFETY-10: /craftsman:init offers to merge sandbox settings, never overwrite them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as sm from "./settings-merge.mjs";

const ASK = ["Bash(sudo *)", "Bash(git push --force *)", "Bash(git reset --hard *)", "Bash(git clean *)"];

test("SANDBOX_BLOCK: sandbox on plus ask rules for sudo, force push, reset --hard and clean", () => {
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
  assert.deepEqual(next.permissions.ask, ["Bash(sudo *)", "Read(.env)", "Bash(git push --force *)", "Bash(git reset --hard *)", "Bash(git clean *)"]);
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
  assert.match(diff, /\+ permissions\.ask: Bash\(git clean \*\)/);
  assert.doesNotMatch(diff, /rm -r/);
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

// sandboxGaps: a sandbox that is on but cannot reach the git host, or cannot run docker, still pushes
// every such call into an unsandboxed retry that auto mode refuses. Advisory only, never throws.
test("originHostOf: reads the host from https, ssh and scp-style remote URLs, and nothing from the rest", () => {
  assert.equal(sm.originHostOf("https://github.com/o/r.git"), "github.com");
  assert.equal(sm.originHostOf("https://user:token@GitHub.com/o/r.git"), "github.com");
  assert.equal(sm.originHostOf("ssh://git@gitlab.example.com:2222/o/r.git"), "gitlab.example.com");
  assert.equal(sm.originHostOf("git@github.com:o/r.git"), "github.com");
  for (const none of ["", null, undefined, "/srv/git/r.git", "../r.git", "file:///srv/r.git"]) assert.equal(sm.originHostOf(none), null, String(none));
});

// S2 (scrutinise-sandbox-auto-flow round 2): a Windows drive path is no host:path remote, and the scp form may carry an absolute path.
test("originHostOf: a Windows drive path has no host, and git@host:/absolute/path reads its host", () => {
  for (const none of ["C:\\srv\\r.git", "c:\\r.git", "D:/srv/r.git", "C:r.git"]) assert.equal(sm.originHostOf(none), null, none);
  assert.equal(sm.originHostOf("git@git.example.com:/srv/r.git"), "git.example.com");
  assert.equal(sm.originHostOf("deploy@Git.Example.com:/srv/r.git"), "git.example.com");
  // the existing forms are unchanged
  assert.equal(sm.originHostOf("git@github.com:o/r.git"), "github.com");
  assert.equal(sm.originHostOf("https://github.com/o/r.git"), "github.com");
  for (const none of ["/srv/git/r.git", "../r.git", "file:///srv/r.git"]) assert.equal(sm.originHostOf(none), null, none);
});

// R3-S1 (scrutinise-sandbox-auto-flow round 3): `host:/absolute/path` is scp-style too, with or without a user; a drive path still is not.
test("originHostOf: host:/absolute/path reads its host with or without a user, and the other forms are unchanged", () => {
  assert.equal(sm.originHostOf("host:/srv/r.git"), "host");
  assert.equal(sm.originHostOf("Git.Example.com:/srv/r.git"), "git.example.com");
  assert.equal(sm.originHostOf("git@host:/srv/r.git"), "host");
  assert.equal(sm.originHostOf("user@host:path"), "host");
  assert.equal(sm.originHostOf("host:o/r.git"), "host");
  assert.equal(sm.originHostOf("git@github.com:o/r.git"), "github.com");
  assert.equal(sm.originHostOf("https://github.com/o/r.git"), "github.com");
  assert.equal(sm.originHostOf("ssh://git@gitlab.example.com:2222/o/r.git"), "gitlab.example.com");
  for (const none of ["C:\\srv\\r.git", "c:\\r.git", "D:/srv/r.git", "C:r.git", "/srv/git/r.git", "../r.git", "file:///srv/r.git", ""]) assert.equal(sm.originHostOf(none), null, none);
});

test("sandboxGaps: a drive-path origin is no network gap, and an scp origin with an absolute path is one when its host is missing", () => {
  const s = scopes();
  try {
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true } });
    const gapsFor = (origin) => sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed], origin });
    assert.deepEqual(gapsFor("C:\\srv\\r.git").map((g) => g.gap), [], "a path is not a host");
    const scp = gapsFor("git@git.example.com:/srv/r.git");
    assert.deepEqual(scp.map((g) => g.gap), ["network"]);
    assert.match(scp[0].detail, /^git\.example\.com is not in sandbox\.network\.allowedDomains/);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

test("sandboxGaps: none when the sandbox is off everywhere, whatever else is missing", () => {
  const s = scopes();
  try {
    fs.writeFileSync(path.join(s.dirs.root, "docker-compose.yml"), "services: {}\n");
    assert.deepEqual(sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed], origin: "https://github.com/o/r.git" }), []);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

test("sandboxGaps: network when the origin host is in no allowedDomains, docker when compose files lack an exclusion", () => {
  const s = scopes();
  try {
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true } });
    fs.writeFileSync(path.join(s.dirs.root, "compose.yaml"), "services: {}\n");
    const gaps = () => sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed], origin: "git@github.com:o/r.git" });
    assert.deepEqual(gaps().map((g) => g.gap), ["network", "docker"]);
    assert.match(gaps()[0].detail, /github\.com is not in sandbox\.network\.allowedDomains/);
    assert.match(gaps()[1].detail, /docker/);
    // Each scope contributes: the host from the project scope, the docker exclusion from the managed one.
    s.put(path.join(s.dirs.root, ".claude", "settings.json"), { sandbox: { network: { allowedDomains: ["*.github.com", "github.com"] } } });
    s.put(path.join(s.dirs.managed, "managed-settings.json"), { sandbox: { excludedCommands: ["docker compose *"] } });
    assert.deepEqual(gaps(), []);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

test("sandboxGaps: a wildcard domain covers its apex and subdomains but no other host, and a host-less origin reports no network gap", () => {
  const s = scopes();
  try {
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true, network: { allowedDomains: ["*.example.com"] } } });
    const gaps = (origin) => sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed], origin }).map((g) => g.gap);
    assert.deepEqual(gaps("https://git.example.com/o/r.git"), []);
    assert.deepEqual(gaps("https://example.com/o/r.git"), [], "unsure whether the apex is covered: stay quiet");
    assert.deepEqual(gaps("https://other.org/o/r.git"), ["network"]);
    assert.deepEqual(gaps("/srv/git/r.git"), []);
    assert.deepEqual(gaps(null), []);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

test("sandboxGaps: an excludedCommands entry that is a comma-separated path list is reported as malformed", () => {
  const s = scopes();
  try {
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true, excludedCommands: ["docker compose *", ".craftsman/, docs/plans/, src/**", ""] } });
    const gaps = sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed], origin: null });
    assert.deepEqual(gaps.map((g) => g.gap), ["excluded-malformed", "excluded-malformed"]);
    assert.match(gaps[0].detail, /\.craftsman\/, docs\/plans\//);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

// S2 (scrutinise-sandbox-auto-flow): plan step 3.1 also asked for an entry with no command word. A single-token path glob is that; a path-spelled
// command is not: Claude Code matches the text of the call, so `/usr/local/bin/docker *` and `./gradlew build` are legitimate patterns.
test("sandboxGaps: a single-token path glob in excludedCommands is malformed, a path-spelled command is not", () => {
  const s = scopes();
  try {
    const malformed = (entries) => {
      s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true, excludedCommands: entries } });
      return sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed], origin: null }).filter((g) => g.gap === "excluded-malformed").map((g) => g.detail);
    };
    const bad = ["src/**", "build/", "./out/*"];
    const found = malformed(bad);
    assert.equal(found.length, bad.length, `reported: ${found.join(" | ")}`);
    for (const entry of bad) assert.ok(found.some((detail) => detail.includes(JSON.stringify(entry))), `${entry} is reported`);
    assert.deepEqual(malformed(["docker *", "docker compose *", "/usr/local/bin/docker *", "/usr/local/bin/docker", "./gradlew build", "npm run *"]), []);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

// S1: the gap line is read by the model, which cannot edit the sandbox settings (pre-guard refuses it, ARCH-SAFETY-13): it asks the user.
test("sandboxGapLine and the docker gap tell the model to ask the user, and say what an exclusion does", () => {
  const s = scopes();
  try {
    fs.writeFileSync(path.join(s.dirs.root, "compose.yaml"), "services: {}\n");
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true } });
    const gaps = sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed], origin: null });
    const docker = gaps.find((g) => g.gap === "docker");
    assert.ok(docker, "a compose file with no docker entry is a gap");
    assert.match(docker.detail, /an excludedCommands entry runs docker outside the sandbox/);
    const line = sm.sandboxGapLine(gaps);
    assert.match(line, /ask the user to add them to the sandbox settings\.$/);
    assert.doesNotMatch(line, /; add them to the sandbox/);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

// Criterion 4 of sandbox-auto-flow promised a 2 s limit on the git lookup that SessionStart runs: a git that hangs must not stall it.
test("sandboxGaps: a git that hangs is cut off after about two seconds, with no network gap and no throw", () => {
  const s = scopes();
  const savedPath = process.env.PATH;
  try {
    const bin = path.join(s.base, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "git"), "#!/bin/sh\nexec sleep 5\n", { mode: 0o755 });
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true } });
    process.env.PATH = `${bin}${path.delimiter}${savedPath}`;
    const started = Date.now();
    let gaps;
    assert.doesNotThrow(() => { gaps = sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed] }); });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 4000, `the lookup returned after ${elapsed} ms, not the 5 s the stub sleeps`);
    assert.equal(gaps.some((g) => g.gap === "network"), false, "no origin could be read, so no network gap");
  } finally { process.env.PATH = savedPath; fs.rmSync(s.base, { recursive: true, force: true }); }
});

test("sandboxGaps: looks the origin up with git when none is given, and a broken scope file never throws", () => {
  const s = scopes();
  try {
    spawnSync("git", ["init", "-q", s.dirs.root]);
    spawnSync("git", ["-C", s.dirs.root, "remote", "add", "origin", "https://github.com/o/r.git"]);
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true } });
    assert.deepEqual(sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed] }).map((g) => g.gap), ["network"]);
    s.put(path.join(s.dirs.root, ".claude", "settings.json"), "{ broken");
    assert.doesNotThrow(() => sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed] }));
    assert.deepEqual(sm.sandboxGaps({ root: path.join(s.base, "missing"), userDir: s.dirs.user, managedDirs: [s.dirs.managed] }), []);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});

test("sandboxGapLine: one line joining the gap details, and nothing when there are no gaps", () => {
  assert.equal(sm.sandboxGapLine([]), "");
  assert.equal(sm.sandboxGapLine(undefined), "");
  const line = sm.sandboxGapLine([{ gap: "network", detail: "github.com is not in sandbox.network.allowedDomains" }, { gap: "docker", detail: "no docker entry" }]);
  assert.match(line, /^craftsman: the Claude Code sandbox is on, but github\.com is not in sandbox\.network\.allowedDomains; no docker entry\. /);
  assert.match(line, /dangerouslyDisableSandbox, which auto mode refuses/);
  assert.equal(line.includes("\n"), false);
});

test("mergeSettings: no recursive-delete ask in the block, and one already in the file stays exactly once", () => {
  assert.equal(sm.SANDBOX_BLOCK.permissions.ask.some((r) => /^Bash\(rm /.test(r)), false);
  const r = sm.mergeSettings(JSON.stringify({ permissions: { ask: ["Bash(rm -rf *)"] } }));
  const next = JSON.parse(r.next);
  assert.equal(next.permissions.ask.filter((x) => x === "Bash(rm -rf *)").length, 1);
  assert.equal(r.added.some((l) => /rm -r/.test(l)), false);
});

// ARCH-SAFETY-16: the project block adds the origin host of each registered project to sandbox.network.allowedDomains, and no excludedCommands.
test("projectSettingsBlock: SANDBOX_BLOCK plus allowedDomains for the given hosts, never excludedCommands, SANDBOX_BLOCK untouched", () => {
  const before = JSON.stringify(sm.SANDBOX_BLOCK);
  const block = sm.projectSettingsBlock(["github.com", "git.example.com"]);
  assert.deepEqual(block, { sandbox: { enabled: true, network: { allowedDomains: ["github.com", "git.example.com"] } }, permissions: { ask: ASK } });
  assert.equal(JSON.stringify(block).includes("excludedCommands"), false);
  assert.equal(JSON.stringify(sm.SANDBOX_BLOCK), before, "the shared block is not mutated");
  assert.equal(sm.SANDBOX_BLOCK.sandbox.network, undefined);
  assert.deepEqual(sm.projectSettingsBlock([]), sm.SANDBOX_BLOCK, "no host, no allowedDomains key");
  assert.deepEqual(sm.projectSettingsBlock(undefined), sm.SANDBOX_BLOCK);
  assert.deepEqual(sm.projectSettingsBlock(["GitHub.com", "github.com", " ", "", null, 7, "a b", "[::1]"]).sandbox.network.allowedDomains, ["github.com"], "lower-cased, de-duplicated, anything that is not a host dropped");
});

test("projectSettingsBlock: a new file gets the hosts, and merging the block twice is a no-op", () => {
  const block = sm.projectSettingsBlock(["github.com"]);
  const once = sm.mergeSettings(null, block);
  assert.equal(once.changed, true);
  assert.deepEqual(JSON.parse(once.next), block);
  assert.match(sm.renderSettingsDiff(once), /\+ sandbox\.network\.allowedDomains: github\.com/);
  const twice = sm.mergeSettings(once.next, block);
  assert.equal(twice.changed, false);
  assert.equal(twice.next, once.next);
  assert.deepEqual(twice.added, []);
  assert.equal(JSON.parse(once.next).sandbox.network.allowedDomains.length, 1);
});

test("projectSettingsBlock: a host the file already covers (exact entry or *. wildcard) is not added, an uncovered one is", () => {
  const block = sm.projectSettingsBlock(["github.com", "api.github.com", "git.example.com", "gitlab.org"]);
  const current = JSON.stringify({ sandbox: { network: { allowedDomains: ["GitHub.com", "*.example.com", "registry.npmjs.org"] } } });
  const r = sm.mergeSettings(current, block);
  assert.deepEqual(JSON.parse(r.next).sandbox.network.allowedDomains, ["GitHub.com", "*.example.com", "registry.npmjs.org", "api.github.com", "gitlab.org"]);
  assert.deepEqual(r.added.filter((line) => line.startsWith("sandbox.network.allowedDomains")), ["sandbox.network.allowedDomains: api.github.com", "sandbox.network.allowedDomains: gitlab.org"]);
  const everything = sm.mergeSettings(JSON.stringify({ sandbox: { network: { allowedDomains: ["*"] } } }), block);
  assert.equal(JSON.parse(everything.next).sandbox.network.allowedDomains.length, 1, "* covers every host");
  const covered = sm.mergeSettings(JSON.stringify({ sandbox: { enabled: true, network: { allowedDomains: ["github.com", "api.github.com", "*.example.com", "gitlab.org"] } }, permissions: { ask: ASK } }), block);
  assert.equal(covered.changed, false, "every host covered and the rest present: nothing to add");
  assert.match(sm.renderSettingsDiff(covered), /nothing to add/);
});

test("projectSettingsBlock: existing keys, an excludedCommands list and key order are kept", () => {
  const current = JSON.stringify({
    model: "opus",
    permissions: { allow: ["Bash(npm test)"], ask: ["Read(.env)"] },
    sandbox: { excludedCommands: ["docker compose *"], network: { allowedDomains: ["example.com"], allowUnixSockets: ["/run/x.sock"] } },
    hooks: { Stop: [{ hooks: [] }] },
  }, null, 2);
  const next = JSON.parse(sm.mergeSettings(current, sm.projectSettingsBlock(["github.com"])).next);
  assert.equal(next.model, "opus");
  assert.deepEqual(next.permissions.allow, ["Bash(npm test)"]);
  assert.deepEqual(next.sandbox.excludedCommands, ["docker compose *"]);
  assert.deepEqual(next.sandbox.network, { allowedDomains: ["example.com", "github.com"], allowUnixSockets: ["/run/x.sock"] });
  assert.deepEqual(next.hooks, { Stop: [{ hooks: [] }] });
  assert.deepEqual(Object.keys(next).slice(0, 4), ["model", "permissions", "sandbox", "hooks"]);
  // the project block never writes an excludedCommands entry of its own
  assert.equal("excludedCommands" in JSON.parse(sm.mergeSettings(null, sm.projectSettingsBlock(["github.com"])).next).sandbox, false);
});

// ARCH-SAFETY-16: one user-scope autoMode.allow entry, offered apart from the project block.
test("NETWORK_STEP_ALLOW: prose naming repo-exec's network step, its need for git credentials and what it pushes, with no plugin path", () => {
  const text = sm.NETWORK_STEP_ALLOW;
  assert.equal(typeof text, "string");
  assert.equal(text.includes("\n"), false, "one entry, one line");
  assert.match(text, /repo-exec\.mjs/);
  assert.match(text, /network action \(step fetch, drain or status\)/);
  assert.match(text, /sandbox disabled/);
  assert.match(text, /needs the user's git credentials, which the sandbox hides/);
  assert.match(text, /fetches origin and pushes only the run's own unit and feature branches/);
  assert.match(text, /base branch only in direct-land mode \(planning\.featureBranches off\)/);
  assert.match(text, /never forced/);
  assert.doesNotMatch(text, /plugins|cache|CLAUDE_PLUGIN_ROOT|\.claude|\/home\/|[0-9a-f]{12}/, "the plugin path changes every upgrade, so the entry names none");
  assert.doesNotMatch(text, /never base/, "a direct-land unit merge pushes base");
});

test("mergeUserSettings: a new file gets autoMode.allow with $defaults first and the entry second, and nothing else", () => {
  for (const current of [null, undefined, "", "  \n"]) {
    const r = sm.mergeUserSettings(current);
    assert.equal(r.ok, true);
    assert.equal(r.changed, true);
    assert.deepEqual(JSON.parse(r.next), { autoMode: { allow: ["$defaults", sm.NETWORK_STEP_ALLOW] } });
    assert.ok(r.next.endsWith("\n"));
  }
  const text = sm.mergeUserSettings(null).next;
  assert.deepEqual(Object.keys(JSON.parse(text)), ["autoMode"], "no sandbox.credentials, network.tlsTerminate, permissions.allow rule or credential directory");
  for (const never of ["\"credentials\"", "tlsTerminate", "permissions", "\"sandbox\"", "excludedCommands", "allowedDomains", ".config/gh", ".ssh"]) assert.equal(text.includes(never), false, never);
});

test("mergeUserSettings: an existing autoMode.allow gets the entry appended and $defaults is not added", () => {
  const current = JSON.stringify({ model: "opus", autoMode: { allow: ["Running the test suite is allowed"], environment: ["Trusted: github.com"] }, permissions: { allow: ["Bash(npm test)"] }, env: { A: "1" } }, null, 2);
  const r = sm.mergeUserSettings(current);
  assert.equal(r.changed, true);
  const next = JSON.parse(r.next);
  assert.deepEqual(next.autoMode.allow, ["Running the test suite is allowed", sm.NETWORK_STEP_ALLOW]);
  assert.equal(next.autoMode.allow.includes("$defaults"), false);
  assert.deepEqual(next.autoMode.environment, ["Trusted: github.com"]);
  assert.equal(next.model, "opus");
  assert.deepEqual(next.permissions, { allow: ["Bash(npm test)"] }, "no permissions.allow rule is added");
  assert.deepEqual(next.env, { A: "1" });
  assert.deepEqual(Object.keys(next), ["model", "autoMode", "permissions", "env"]);
  // a list that already starts with $defaults keeps it first
  const withDefaults = JSON.parse(sm.mergeUserSettings(JSON.stringify({ autoMode: { allow: ["$defaults", "mine"] } })).next);
  assert.deepEqual(withDefaults.autoMode.allow, ["$defaults", "mine", sm.NETWORK_STEP_ALLOW]);
});

test("mergeUserSettings: a file with no autoMode.allow gets a new list that keeps $defaults first; every other key stays", () => {
  const sibling = JSON.parse(sm.mergeUserSettings(JSON.stringify({ model: "opus", autoMode: { environment: ["x"] } })).next);
  assert.deepEqual(sibling, { model: "opus", autoMode: { environment: ["x"], allow: ["$defaults", sm.NETWORK_STEP_ALLOW] } });
  const plain = JSON.parse(sm.mergeUserSettings(JSON.stringify({ model: "opus", sandbox: { enabled: true } })).next);
  assert.deepEqual(plain, { model: "opus", sandbox: { enabled: true }, autoMode: { allow: ["$defaults", sm.NETWORK_STEP_ALLOW] } });
});

test("mergeUserSettings: a second merge changes nothing, and the diff names the entry", () => {
  const once = sm.mergeUserSettings(null);
  const twice = sm.mergeUserSettings(once.next);
  assert.equal(twice.changed, false);
  assert.equal(twice.next, once.next);
  assert.deepEqual(twice.added, []);
  const appended = sm.mergeUserSettings(JSON.stringify({ autoMode: { allow: ["mine"] } }));
  assert.equal(sm.mergeUserSettings(appended.next).changed, false);
  const diff = sm.renderSettingsDiff(once);
  assert.match(diff, /^craftsman: auto mode entry to merge into settings\.json/);
  assert.ok(diff.includes(`+ autoMode.allow: ${sm.NETWORK_STEP_ALLOW}`));
  assert.ok(diff.includes("+ autoMode.allow: $defaults"));
  assert.doesNotMatch(diff, /sandbox\.|\.claude\/settings\.json/);
  assert.match(sm.renderSettingsDiff(twice), /^nothing to add: settings\.json already has the auto mode entry/);
  assert.match(sm.renderSettingsDiff(sm.mergeUserSettings(null, "/home/u/.claude/settings.json")), /merge into \/home\/u\/\.claude\/settings\.json/);
});

test("mergeUserSettings: invalid JSON, a non-object, or an autoMode.allow that is not a list adds nothing", () => {
  for (const bad of ["{ not json", "[]", "42"]) {
    const r = sm.mergeUserSettings(bad, "/u/settings.json");
    assert.equal(r.ok, false, bad);
    assert.match(r.error, /^\/u\/settings\.json /);
    assert.equal(r.next, undefined);
  }
  const notList = sm.mergeUserSettings(JSON.stringify({ autoMode: { allow: "just prose" } }));
  assert.equal(notList.changed, false);
  assert.deepEqual(notList.kept, ['autoMode.allow stays "just prose" (set in your file)']);
  assert.equal(sm.mergeUserSettings(JSON.stringify({ autoMode: "off" })).changed, false);
});

// 4.7: init now offers hosts, but the gap line and the docker detail SessionStart shows are the same text as before.
test("the gap line and the docker detail read as before, and the project block still offers no docker exclusion", () => {
  const s = scopes();
  try {
    fs.writeFileSync(path.join(s.dirs.root, "compose.yaml"), "services: {}\n");
    s.put(path.join(s.dirs.user, "settings.json"), { sandbox: { enabled: true } });
    const gaps = sm.sandboxGaps({ root: s.dirs.root, userDir: s.dirs.user, managedDirs: [s.dirs.managed], origin: "git@github.com:o/r.git" });
    const docker = "this project has a compose file but sandbox.excludedCommands has no docker entry (docker does not run sandboxed; an excludedCommands entry runs docker outside the sandbox)";
    assert.deepEqual(gaps, [{ gap: "network", detail: "github.com is not in sandbox.network.allowedDomains" }, { gap: "docker", detail: docker }]);
    assert.equal(sm.sandboxGapLine(gaps), `craftsman: the Claude Code sandbox is on, but github.com is not in sandbox.network.allowedDomains; ${docker}. Commands that need them fail sandboxed and get retried with dangerouslyDisableSandbox, which auto mode refuses; ask the user to add them to the sandbox settings.`);
    assert.equal(JSON.stringify(sm.projectSettingsBlock(["github.com"])).includes("docker"), false);
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});
