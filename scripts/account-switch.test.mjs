import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { digestTranscript, parseArgs, projectSlug, redact } from "./account-switch.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "account-switch.mjs");
const CLAIM = path.join(path.dirname(SCRIPT), "claim.mjs");

const jsonl = (records) => records.map((r) => JSON.stringify(r)).join("\n") + "\n";
const user = (content, extra = {}) => ({ type: "user", cwd: "/w", gitBranch: "main", timestamp: "2026-10-18T10:00:00Z", message: { content }, ...extra });
const assistant = (content) => ({ type: "assistant", cwd: "/w", gitBranch: "feat", timestamp: "2026-10-18T10:05:00Z", message: { content } });

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-switch-")));
  const repo = path.join(root, "repo");
  const config = path.join(root, "config");
  fs.mkdirSync(repo);
  spawnSync("git", ["init", "-q"], { cwd: repo });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: repo, CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: "new" };
  const cli = (args, input = "", extraEnv = {}) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env: { ...env, ...extraEnv }, input, encoding: "utf8" });
  const transcript = (sid, records) => {
    const dir = path.join(config, "projects", projectSlug(repo));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${sid}.jsonl`), jsonl(records));
  };
  return { root, repo, config, env, cli, transcript, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("account-switch: digest keeps the visible record and drops thinking, side chains and meta", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-digest-"));
  try {
    const file = path.join(dir, "abc.jsonl");
    fs.writeFileSync(file, jsonl([
      { type: "ai-title", aiTitle: "switch work" },
      user("Earlier work summarised", { isCompactSummary: true }),
      user("please build the thing"),
      user("<system-reminder>meta</system-reminder>", { isMeta: true }),
      assistant([{ type: "thinking", thinking: "secret reasoning" }, { type: "text", text: "Building it now." },
        { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/a.js", old_string: "x", new_string: "y" } }]),
      user([{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "String not found" }]),
      assistant([{ type: "tool_use", id: "t2", name: "Bash", input: { command: "npm test", description: "Run tests" } }]),
      { ...user("subagent prompt"), isSidechain: true },
    ]) + "null\n[1]\n{not json\n" + JSON.stringify(user([null, 3])) + "\n" + JSON.stringify(assistant([null])) + "\n" +
      JSON.stringify({ ...user({ odd: "object content" }), gitBranch: "feat" }) + "\n");
    const { text } = digestTranscript(file);
    assert.match(text, /title: switch work/);
    assert.match(text, /compaction summary\]\n\nEarlier work summarised/);
    assert.match(text, /## USER .*\n\nplease build the thing/);
    assert.match(text, /Building it now\./);
    assert.match(text, /`src\/a\.js` — Edit/);
    assert.match(text, /ERROR: String not found/);
    assert.match(text, /## Tool calls with no result\n\n- Bash/);
    assert.match(text, /git branch \(start → end\): main → feat/);
    assert.match(text, /1 thinking blocks omitted/);
    for (const hidden of [/secret reasoning/, /system-reminder/, /subagent prompt/]) assert.doesNotMatch(text, hidden);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("account-switch: redaction, slugs and argument parsing", () => {
  const token = "ghp_" + "a".repeat(36);
  const { text, count } = redact(`token ${token} end`);
  assert.equal(count, 1);
  assert.equal(text, "token [REDACTED GitHub token] end");
  assert.equal(projectSlug("/home/a_b/my.repo"), "-home-a-b-my-repo");
  assert.deepEqual(parseArgs(["show", "latest", "--from", "5", "--all"]), { _: ["show", "latest"], from: "5", all: true });
});

test("account-switch: save writes a fresh snapshot and empty restore log, then show and log read it back", () => {
  const f = fixture();
  try {
    const body = "# Handoff: demo\n\n## 1. Goal\nship it\n\n## 11. Environment snapshot\nstale snapshot\n\n## Restore log\n- old entry\n";
    const saved = f.cli(["save"], body);
    assert.equal(saved.status, 0, saved.stderr);
    const file = /handoff saved: (\S+)/.exec(saved.stdout)[1];
    assert.ok(file.startsWith(path.join(f.repo, ".git", ".craftsman", "account-handoffs")), file);
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /stale snapshot|old entry/);
    assert.match(text, /- session_id: new/);
    assert.match(text, /## Restore log\n$/);

    const page = f.cli(["show", "latest", "--lines", "3"]);
    assert.match(page.stdout, /lines 1-3 of \d+; continue with --from 4/);
    assert.equal(f.cli(["log", "latest", "restored", "here"]).status, 0);
    assert.match(fs.readFileSync(file, "utf8"), /## Restore log\n- \S+ restored here\n$/);
    assert.match(f.cli(["list"]).stdout, /Handoff: demo {2}\(restored 1×\)/);
    assert.notEqual(f.cli(["save"], "  ").status, 0, "empty handoff is refused");

    // Only a heading line ends the body; an inline mention keeps what follows.
    const inline = f.cli(["save"], "# Handoff: inline\n\n## 6. Dead ends\n- tried quoting `## Restore log` inline\n\n## 8. Next steps\n1. keep me\n");
    const kept = fs.readFileSync(/handoff saved: (\S+)/.exec(inline.stdout)[1], "utf8");
    assert.match(kept, /## 8\. Next steps\n1\. keep me/);
    assert.notEqual(/handoff saved: (\S+)/.exec(inline.stdout)[1], file, "same-second saves get distinct files");
  } finally {
    f.cleanup();
  }
});

test("account-switch: sessions ranks a fresh current session last and digest resolves a prefix", () => {
  const f = fixture();
  try {
    f.transcript("old-session-1", [user("first ask"), user("second ask")]);
    f.transcript("new", [user("/craftsman:account-switch recover")]);
    const listed = f.cli(["sessions"]);
    assert.equal(listed.status, 0, listed.stderr);
    assert.ok(listed.stdout.indexOf("old-session-1") < listed.stdout.indexOf("new (this session)"), listed.stdout);
    const digest = f.cli(["digest", "old-sess"]);
    assert.equal(digest.status, 0, digest.stderr);
    assert.match(fs.readFileSync(/digest written: (\S+)/.exec(digest.stdout)[1], "utf8"), /second ask/);
    assert.notEqual(f.cli(["digest", "missing"]).status, 0);
  } finally {
    f.cleanup();
  }
});

test("account-switch: adopt moves the old session's hand-off, claims and worktrees only on confirm", () => {
  const f = fixture();
  try {
    const claim = { plan: "docs/plans/p.md", unit: "u1", project: ".", session_id: "old" };
    assert.equal(spawnSync(process.execPath, [CLAIM], { cwd: f.repo, env: f.env, input: JSON.stringify(claim), encoding: "utf8" }).status, 0);
    const oldDir = path.join(f.repo, ".craftsman", "sessions", "old");
    fs.mkdirSync(oldDir, { recursive: true });
    fs.writeFileSync(path.join(oldDir, "handoff.json"), JSON.stringify({ plan: "p", unit: "u1", next_action: "go", session_id: "old" }));
    const ledger = (sid) => path.join(f.repo, ".git", ".craftsman", "sessions", sid, "worktrees.json");
    fs.mkdirSync(path.dirname(ledger("old")), { recursive: true });
    fs.writeFileSync(ledger("old"), JSON.stringify([path.join(f.repo, "wt")]));
    // Named the way core.mjs worktreeBindingPath names it.
    const suffix = crypto.createHash("sha1").update(path.resolve(f.repo, "wt")).digest("hex").slice(0, 16);
    const binding = (sid) => path.join(path.dirname(ledger(sid)), `${suffix}-worktree-binding.json`);
    fs.writeFileSync(binding("old"), JSON.stringify({ session_id: "old", unit: "u1", worktree_path: path.join(f.repo, "wt"), branch: "b" }));

    const dry = f.cli(["adopt", "--from", "old"]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /would adopt[\s\S]*plan hand-off[\s\S]*unit claim[\s\S]*worktree/);
    assert.equal(fs.existsSync(path.join(f.repo, ".craftsman", "sessions", "new", "handoff.json")), false);

    const done = f.cli(["adopt", "--from", "old", "--confirm"]);
    assert.equal(done.status, 0, done.stderr);
    const handoff = JSON.parse(fs.readFileSync(path.join(f.repo, ".craftsman", "sessions", "new", "handoff.json"), "utf8"));
    assert.equal(handoff.session_id, "new");
    const owners = fs.readdirSync(path.join(f.repo, ".craftsman", "claims"))
      .map((n) => JSON.parse(fs.readFileSync(path.join(f.repo, ".craftsman", "claims", n, "owner.json"), "utf8")));
    assert.deepEqual(owners.map((o) => o.session_id), ["new"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(ledger("new"), "utf8")), [path.join(f.repo, "wt")]);
    assert.deepEqual(JSON.parse(fs.readFileSync(ledger("old"), "utf8")), []);
    const bindings = (sid) => fs.readdirSync(path.dirname(ledger(sid))).filter((n) => n.endsWith("-worktree-binding.json"));
    assert.deepEqual(bindings("old"), []);
    const moved = JSON.parse(fs.readFileSync(path.join(path.dirname(ledger("new")), bindings("new")[0]), "utf8"));
    assert.equal(moved.session_id, "new");
    assert.ok(fs.existsSync(path.join(f.repo, ".craftsman", "sessions", "new", "scope-required")), "resume needs fresh scope");
    assert.match(f.cli(["adopt", "--from", "new"]).stdout, /same session/);
  } finally {
    f.cleanup();
  }
});

test("account-switch: show, log and digest stay inside their folders; files are owner-only", () => {
  const f = fixture();
  try {
    const outside = path.join(f.root, "secret.txt");
    fs.writeFileSync(outside, "do not read");
    const saved = f.cli(["save"], "# Handoff: x\n");
    assert.equal(saved.status, 0, saved.stderr);
    for (const args of [["show", outside], ["show", "../../../secret.txt"], ["log", outside, "x"]]) {
      const res = f.cli(args);
      assert.notEqual(res.status, 0, args.join(" "));
      assert.doesNotMatch(res.stdout, /do not read/);
    }
    assert.equal(fs.readFileSync(outside, "utf8"), "do not read");

    const jsonFile = path.join(f.root, "hosts.jsonl");
    fs.writeFileSync(jsonFile, jsonl([user("token here")]));
    assert.match(f.cli(["digest", jsonFile]).stderr, /not a transcript/);
    f.transcript("abc123", [user("hello")]);
    const digest = f.cli(["digest", "abc123"]);
    const digestFile = /digest written: (\S+)/.exec(digest.stdout)[1];
    assert.match(f.cli(["log", digestFile, "x"]).stderr, /not a handoff/);
    if (process.platform !== "win32") {
      const file = /handoff saved: (\S+)/.exec(saved.stdout)[1];
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      assert.equal(fs.statSync(digestFile).mode & 0o777, 0o600);
    }
    assert.match(f.cli(["save"], "# Handoff: x\n", { CLAUDE_CODE_SESSION_ID: "" }).stderr, /no session id/);
  } finally {
    f.cleanup();
  }
});

test("account-switch: redaction runs before truncation and covers env-style assignments", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-digest-"));
  try {
    const token = "ghp_" + "b".repeat(40);
    const file = path.join(dir, "t.jsonl");
    fs.writeFileSync(file, jsonl([
      assistant([{ type: "tool_use", id: "t1", name: "Bash", input: { command: "env" } }]),
      user([{ type: "tool_result", tool_use_id: "t1", content: "x".repeat(590) + token }]),
    ]));
    const { text, count } = digestTranscript(file);
    assert.doesNotMatch(text, /ghp_b/);
    assert.ok(count >= 1);
    const env = redact("API_KEY=abcd1234efgh DB_PASSWORD: 'hunter22' max_tokens: 1000 postgres://u:pw1234@db/x");
    assert.equal(env.text, "API_KEY=[REDACTED] DB_PASSWORD: '[REDACTED]' max_tokens: 1000 postgres://u:[REDACTED]@db/x");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("account-switch: adopt refuses while the previous session is still running", () => {
  const f = fixture();
  try {
    const sessions = path.join(f.config, "sessions");
    fs.mkdirSync(sessions, { recursive: true });
    fs.writeFileSync(path.join(sessions, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "old" }));
    const res = f.cli(["adopt", "--from", "old", "--confirm"]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /still running/);
  } finally {
    f.cleanup();
  }
});

test("account-switch: a claim made from a linked worktree is snapshotted and adopted (ARCH-STATE-03)", () => {
  const f = fixture();
  try {
    const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: f.repo, encoding: "utf8" });
    git("commit", "-q", "--allow-empty", "-m", "init");
    const wt = path.join(f.root, "wt");
    assert.equal(git("worktree", "add", "-q", "-b", "feat/x", wt).status, 0);
    const env = { ...f.env, CLAUDE_PROJECT_DIR: wt };
    const claim = { plan: "docs/plans/p.md", unit: "u1", project: ".", session_id: "old" };
    assert.equal(spawnSync(process.execPath, [CLAIM], { cwd: wt, env, input: JSON.stringify(claim), encoding: "utf8" }).status, 0);
    const cli = (args, input = "", sid = "new") =>
      spawnSync(process.execPath, [SCRIPT, ...args], { cwd: wt, env: { ...env, CLAUDE_CODE_SESSION_ID: sid }, input, encoding: "utf8" });

    const saved = cli(["save"], "# Handoff: wt\n\n## 1. Goal\nx\n", "old");
    assert.equal(saved.status, 0, saved.stderr);
    assert.match(fs.readFileSync(/handoff saved: (\S+)/.exec(saved.stdout)[1], "utf8"), /unit claims held: docs\/plans\/p\.md \/ u1/);

    const done = cli(["adopt", "--from", "old", "--confirm"]);
    assert.equal(done.status, 0, done.stderr);
    const dir = path.join(f.repo, ".craftsman", "claims");
    const owners = fs.readdirSync(dir).map((n) => JSON.parse(fs.readFileSync(path.join(dir, n, "owner.json"), "utf8")));
    assert.deepEqual(owners.map((o) => o.session_id), ["new"]);
  } finally {
    f.cleanup();
  }
});
