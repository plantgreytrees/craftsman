// ARCH-SAFETY-13: the network push queue under the git common dir is protected state. repo-exec's enqueuePush (its own process) is
// its only writer; root's unattended drain (ARCH-LAND-36) trusts what is in it, so a forged entry would be pushed with the user's
// credentials. A tool call (Write, Edit, or a Bash write) onto it is refused from the main checkout and from a linked worktree.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { enqueuePush, readQueue } from "./lib/network.mjs";

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), "pre-guard.mjs");

function run(dir, tool_name, tool_input, session_id = "queue-guard") {
  return spawnSync(process.execPath, [GUARD], {
    cwd: dir,
    input: JSON.stringify({ session_id, tool_name, tool_input }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

// A main checkout and two linked worktrees (one inside it, one beside it), with the queue written the way repo-exec writes it:
// by enqueuePush, in its own process. `base` holds all three and is what a test removes.
function repoWithQueue() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-queue-guard-")));
  const main = path.join(base, "main");
  fs.mkdirSync(main);
  const git = (...args) => spawnSync("git", ["-C", main, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { encoding: "utf8" });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "init");
  const worktree = path.join(main, ".claude", "worktrees", "wt");
  const sibling = path.join(base, "wt-beside");
  assert.equal(git("worktree", "add", "-q", "-b", "feat/wt", worktree).status, 0);
  assert.equal(git("worktree", "add", "-q", "-b", "feat/beside", sibling).status, 0);
  const info = { common_git_dir: path.join(main, ".git") };
  const sha = git("rev-parse", "HEAD").stdout.trim();
  enqueuePush(main, info, { sha, dst: "feat/wt", reason: "test" });
  const queue = path.join(info.common_git_dir, ".craftsman", "network", "queue.jsonl");
  return { base, main, worktree, sibling, info, queue, before: fs.readFileSync(queue, "utf8") };
}

// What a tool call can do to a file: the two file tools, then the Bash writers named in the unit.
const toolCalls = (file) => [
  ["Write", { file_path: file, content: "{}" }],
  ["Edit", { file_path: file, old_string: "push", new_string: "delete" }],
  ["Bash", { command: `echo '{"kind":"delete","dst":"main"}' >> ${file}` }],
  ["Bash", { command: `echo '{"kind":"delete","dst":"main"}' | tee -a ${file}` }],
  ["Bash", { command: `cp forged.jsonl ${file}` }],
  ["Bash", { command: `mv forged.jsonl ${file}` }],
  ["Bash", { command: `sed -i 's/feat/main/' ${file}` }],
];
const label = (tool, input) => `${tool} ${input.command ?? input.file_path}`;
// The calls a session lets through that it should have refused: every row is judged, so a red run names them all.
const notRefused = (dir, calls, session_id) => calls.filter(([tool, input]) => run(dir, tool, input, session_id).status !== 2).map(([tool, input]) => label(tool, input));

test("pre-guard: a tool call that writes the network queue is refused from the main checkout, by a relative and an absolute path", () => {
  const r = repoWithQueue();
  try {
    const relative = path.join(".git", ".craftsman", "network", "queue.jsonl");
    for (const file of [relative, r.queue]) assert.deepEqual(notRefused(r.main, toolCalls(file)), [], `allowed from the main checkout, path ${file}`);
    assert.match(run(r.main, "Write", { file_path: r.queue, content: "{}" }).stderr, /craftsman:.*network/, "the refusal names the queue");
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: a tool call that writes the network queue is refused from a linked worktree session, by the main checkout's absolute path", () => {
  const r = repoWithQueue();
  try {
    for (const wt of [r.worktree, r.sibling]) {
      assert.notEqual(wt, r.main);
      const toMain = path.relative(wt, r.queue);
      for (const file of [r.queue, toMain]) assert.deepEqual(notRefused(wt, toolCalls(file), "queue-guard-wt"), [], `allowed from the linked worktree ${path.basename(wt)}, path ${file}`);
    }
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: the rest of the network state under the git common dir is refused too, and a Read of the queue is not", () => {
  const r = repoWithQueue();
  try {
    const fetched = path.join(r.info.common_git_dir, ".craftsman", "network", "fetched.json");
    assert.deepEqual(notRefused(r.main, [["Write", { file_path: fetched, content: "{}" }]]), [], "fetched.json is in the same directory");
    for (const dir of [r.main, r.worktree, r.sibling]) {
      const read = run(dir, "Read", { file_path: r.queue });
      assert.equal(read.status, 0, `Read from ${dir}: ${read.stderr}`);
    }
    assert.equal(run(r.main, "Read", { file_path: path.join(".git", ".craftsman", "network", "queue.jsonl") }).status, 0, "a relative Read");
    for (const command of [`cat ${r.queue}`, `grep -c push ${r.queue}`, `wc -l < ${r.queue}`]) {
      const got = run(r.main, "Bash", { command });
      assert.equal(got.status, 0, `${command}: ${got.stderr}`);
    }
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: the queue is judged by where a name leads: a symlinked directory, a case-folded spelling and a `..` detour are refused", () => {
  const r = repoWithQueue();
  try {
    fs.symlinkSync(path.join(r.info.common_git_dir, ".craftsman", "network"), path.join(r.main, "q"));
    const spellings = [path.join(r.main, "q", "queue.jsonl"), path.join(r.main, ".Git", ".Craftsman", "Network", "queue.jsonl"),
      path.join(r.main, "src", "..", ".git", ".craftsman", "network", "queue.jsonl")];
    for (const file of spellings) {
      const calls = [["Write", { file_path: file, content: "{}" }], ["Edit", { file_path: file, old_string: "push", new_string: "delete" }]];
      assert.deepEqual(notRefused(r.main, calls), [], `allowed from the main checkout, ${file}`);
      assert.deepEqual(notRefused(r.sibling, calls, "queue-guard-wt"), [], `allowed from a linked worktree, ${file}`);
    }
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: the approvals directory is still refused beside the queue, from both sessions", () => {
  const r = repoWithQueue();
  try {
    const approval = path.join(r.main, ".craftsman", "approvals", "x.json");
    const calls = [["Write", { file_path: approval, content: "{}" }], ["Edit", { file_path: approval, old_string: "a", new_string: "b" }], ["Bash", { command: `echo '{}' > ${approval}` }]];
    for (const dir of [r.main, r.worktree, r.sibling]) assert.deepEqual(notRefused(dir, calls, "queue-guard-approvals"), [], `allowed from ${path.basename(dir)}`);
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: repo-exec's own enqueuePush, run directly by node, still writes the queue the guard protects", () => {
  const r = repoWithQueue();
  try {
    const sha = spawnSync("git", ["-C", r.main, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    enqueuePush(r.main, r.info, { sha, dst: "feat/second", reason: "again" });
    const entries = readQueue(r.info);
    assert.deepEqual(entries.map((e) => e.dst), ["feat/wt", "feat/second"]);
    assert.ok(fs.readFileSync(r.queue, "utf8").startsWith(r.before), "the first entry is untouched");
    // the same script, named in a Bash call, is not what the guard refuses: it refuses the tool call that writes the file itself
    const script = path.join(path.dirname(GUARD), "repo-exec.mjs");
    const ran = run(r.main, "Bash", { command: `printf '%s' '{"project":"."}' | node ${script} prepare` });
    assert.notEqual(ran.status, 2, ran.stderr);
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});
