// ARCH-SAFETY-13: the network push queue under the git common dir is protected state. repo-exec's enqueuePush (its own process) is
// its only writer; root's unattended drain (ARCH-LAND-36) trusts what is in it, so a forged entry would be pushed with the user's
// credentials. A tool call (Write, Edit, or a Bash write) onto it is refused from the main checkout, from a linked worktree, and from a linked
// worktree of a submodule project (inside the submodule or beside it).
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

// A superproject with a registered submodule `sub`: the submodule's git dir, and so its push queue, is the superproject's
// .git/modules/sub, outside the submodule's own work tree. enqueuePush writes it there the way repo-exec does for a project that is a submodule.
const gitIn = (dir, ...args) => spawnSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "protocol.file.allow=always", ...args], { encoding: "utf8" });
const newRepo = (dir) => { fs.mkdirSync(dir); gitIn(dir, "init", "-q"); gitIn(dir, "commit", "-q", "--allow-empty", "-m", "init"); };
function repoWithSubmodule() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-queue-guard-sub-")));
  const origin = path.join(base, "origin"), sup = path.join(base, "super");
  for (const dir of [origin, sup]) newRepo(dir);
  const git = gitIn;
  assert.equal(git(sup, "submodule", "add", "-q", origin, "sub").status, 0);
  git(sup, "commit", "-q", "-m", "add sub");
  const sub = path.join(sup, "sub");
  const info = { common_git_dir: path.join(sup, ".git", "modules", "sub") };
  assert.ok(fs.existsSync(info.common_git_dir), "the submodule's git dir is registered under the superproject's .git/modules");
  enqueuePush(sub, info, { sha: git(sub, "rev-parse", "HEAD").stdout.trim(), dst: "feat/sub", reason: "test" });
  const queue = path.join(info.common_git_dir, ".craftsman", "network", "queue.jsonl");
  // Two linked worktrees of the submodule, the way a unit run gets them: one inside it (under .claude/worktrees) and one beside it. Both share the
  // submodule's git dir, and so its queue, and git prints no superproject for a linked worktree, so a session there cannot walk up to one.
  const inWt = path.join(sub, ".claude", "worktrees", "wt"), besideWt = path.join(base, "sub-wt");
  assert.equal(git(sub, "worktree", "add", "-q", "-b", "feat/in", inWt).status, 0);
  assert.equal(git(sub, "worktree", "add", "-q", "-b", "feat/beside", besideWt).status, 0);
  return { base, sup, sub, inWt, besideWt, info, queue, before: fs.readFileSync(queue, "utf8") };
}

test("pre-guard: a tool call that writes a submodule's network queue is refused from the superproject root and from the submodule root", () => {
  const r = repoWithSubmodule();
  try {
    const inSuper = path.join(".git", "modules", "sub", ".craftsman", "network", "queue.jsonl");
    for (const file of [inSuper, r.queue]) assert.deepEqual(notRefused(r.sup, toolCalls(file), "queue-guard-super"), [], `allowed from the superproject root, path ${file}`);
    for (const file of [r.queue, path.relative(r.sub, r.queue)]) assert.deepEqual(notRefused(r.sub, toolCalls(file), "queue-guard-sub"), [], `allowed from the submodule root, path ${file}`);
    assert.match(run(r.sup, "Write", { file_path: r.queue, content: "{}" }, "queue-guard-super").stderr, /craftsman:.*network/, "the refusal names the queue");
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: a submodule's queue is judged by where a name leads: a symlinked directory and a case-folded spelling are refused from the submodule root", () => {
  const r = repoWithSubmodule();
  try {
    fs.symlinkSync(path.join(r.info.common_git_dir, ".craftsman", "network"), path.join(r.sub, "q"));
    for (const file of [path.join(r.sub, "q", "queue.jsonl"), path.join(r.sup, ".Git", "Modules", "sub", ".Craftsman", "Network", "queue.jsonl")]) {
      const calls = [["Write", { file_path: file, content: "{}" }], ["Edit", { file_path: file, old_string: "push", new_string: "delete" }]];
      assert.deepEqual(notRefused(r.sub, calls, "queue-guard-sub"), [], `allowed from the submodule root, ${file}`);
    }
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: a submodule inside a submodule keeps its queue protected from the outer and the inner root", () => {
  const r = repoWithSubmodule();
  try {
    const origin = path.join(r.base, "inner-origin");
    newRepo(origin);
    assert.equal(gitIn(r.sub, "submodule", "add", "-q", origin, "inner").status, 0);
    const inner = path.join(r.sub, "inner");
    const info = { common_git_dir: path.join(r.info.common_git_dir, "modules", "inner") };
    assert.ok(fs.existsSync(info.common_git_dir), "the inner git dir sits under the outer submodule's modules directory");
    enqueuePush(inner, info, { sha: gitIn(inner, "rev-parse", "HEAD").stdout.trim(), dst: "feat/inner", reason: "test" });
    const queue = path.join(info.common_git_dir, ".craftsman", "network", "queue.jsonl");
    const before = fs.readFileSync(queue, "utf8");
    const gone = (target) => [["Bash", { command: `rm -rf ${target}` }], ["Bash", { command: `mv ${target} elsewhere` }]];
    for (const [dir, files] of [[r.sup, [path.relative(r.sup, queue), queue]], [r.sub, [path.relative(r.sub, queue), queue]], [inner, [path.relative(inner, queue), queue]]]) {
      for (const file of files) assert.deepEqual(notRefused(dir, [...toolCalls(file), ...gone(path.dirname(path.dirname(file)))], "queue-guard-nested"), [], `allowed from ${path.relative(r.base, dir)}, path ${file}`);
    }
    assert.equal(fs.readFileSync(queue, "utf8"), before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: a Read of a submodule's queue and repo-exec's own enqueuePush still work", () => {
  const r = repoWithSubmodule();
  try {
    for (const dir of [r.sup, r.sub]) {
      const read = run(dir, "Read", { file_path: r.queue });
      assert.equal(read.status, 0, `Read from ${dir}: ${read.stderr}`);
      for (const command of [`cat ${r.queue}`, `grep -c push ${r.queue}`]) assert.equal(run(dir, "Bash", { command }).status, 0, `${command} from ${dir}`);
    }
    enqueuePush(r.sub, r.info, { sha: spawnSync("git", ["-C", r.sub, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(), dst: "feat/second", reason: "again" });
    assert.deepEqual(readQueue(r.info).map((e) => e.dst), ["feat/sub", "feat/second"]);
    assert.ok(fs.readFileSync(r.queue, "utf8").startsWith(r.before), "the first entry is untouched");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: removing or moving the queue's parent directories is refused, so a forged one cannot take their place", () => {
  const r = repoWithQueue();
  try {
    const gone = (target) => [["Bash", { command: `rm -rf ${target}` }], ["Bash", { command: `mv ${target} elsewhere` }]];
    for (const target of [".git/.craftsman", ".git/.craftsman/network", ".git/.craftsman/network/queue.jsonl", path.join(r.main, ".git", ".craftsman")]) {
      assert.deepEqual(notRefused(r.main, gone(target), "queue-guard-parent"), [], `allowed from the main checkout, ${target}`);
    }
    for (const wt of [r.worktree, r.sibling]) {
      const toMain = path.join(r.main, ".git", ".craftsman");
      assert.deepEqual(notRefused(wt, gone(toMain), "queue-guard-parent-wt"), [], `allowed from the linked worktree ${path.basename(wt)}, ${toMain}`);
    }
    assert.match(run(r.main, "Bash", { command: "rm -rf .git/.craftsman" }, "queue-guard-parent").stderr, /craftsman:/, "the refusal is named");
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: the submodule store (.git/modules) is held like the queue's parents; its queue directory can neither go nor move", () => {
  const r = repoWithSubmodule();
  try {
    const gone = (target) => [["Bash", { command: `rm -rf ${target}` }], ["Bash", { command: `mv ${target} elsewhere` }]];
    for (const target of [".git/modules", ".git/modules/sub/.craftsman/network", ".git/modules/sub/.craftsman/network/queue.jsonl", path.join(r.sup, ".git", "modules")]) {
      assert.deepEqual(notRefused(r.sup, gone(target), "queue-guard-modules"), [], `allowed from the superproject root, ${target}`);
    }
    // the submodule's own session reaches the same store by an absolute path or a `..` detour out of its work tree
    for (const target of [path.join(r.sup, ".git", "modules"), path.join("..", ".git", "modules"), path.join("..", ".git", "modules", "sub", ".craftsman", "network"), r.queue]) {
      assert.deepEqual(notRefused(r.sub, gone(target), "queue-guard-modules-sub"), [], `allowed from the submodule root, ${target}`);
    }
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

// A session in a linked worktree of a submodule project, inside the submodule's work tree or beside it. Its git common dir is the submodule's git dir,
// so the queue lies outside its root, and git prints no superproject for a linked worktree: the walk up that a session in the submodule itself takes finds none.
const subWorktrees = (r) => [["inside", r.inWt], ["beside", r.besideWt]];
// The Bash writers that name no writer verb: a redirect (tee -a, cp, mv and sed -i are in toolCalls).
const redirects = (file) => [
  ["Bash", { command: `echo '{"kind":"delete","dst":"main"}' > ${file}` }],
  ["Bash", { command: `printf '%s\\n' '{"kind":"delete","dst":"main"}' >> ${file}` }],
  ["Bash", { command: `cat forged.jsonl >> ${file}` }],
];
// The same writers with the queue named from inside its directory, so the guard has to resolve the target and cannot read it off the command text.
const fromInside = (dir) => [
  "echo x >> queue.jsonl", "echo x > queue.jsonl", "printf x >> queue.jsonl", "cat forged.jsonl >> queue.jsonl",
  "tee -a queue.jsonl", "cp forged.jsonl queue.jsonl", "mv forged.jsonl queue.jsonl", "sed -i s/feat/main/ queue.jsonl",
].map((command) => ["Bash", { command: `cd ${dir} && ${command}` }]);

test("pre-guard: from a linked worktree of a submodule project, inside it and beside it, every tool call that writes the submodule's queue is refused", () => {
  const r = repoWithSubmodule();
  try {
    const net = path.dirname(r.queue);
    for (const [where, wt] of subWorktrees(r)) {
      assert.ok(fs.existsSync(path.join(wt, ".git")), `${where}: a linked worktree`);
      for (const file of [r.queue, path.relative(wt, r.queue)]) {
        assert.deepEqual(notRefused(wt, [...toolCalls(file), ...redirects(file)], "queue-guard-subwt"), [], `allowed from the worktree ${where} the submodule, path ${file}`);
      }
      for (const dir of [net, path.relative(wt, net)]) assert.deepEqual(notRefused(wt, fromInside(dir), "queue-guard-subwt"), [], `allowed from the worktree ${where} the submodule, after cd ${dir}`);
      assert.match(run(wt, "Bash", { command: `echo x >> ${r.queue}` }, "queue-guard-subwt").stderr, /craftsman:.*network/, "the refusal names the queue");
    }
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: from a linked worktree of a submodule project, removing or moving the queue's directories, the submodule's git dir or the store that holds it is refused", () => {
  const r = repoWithSubmodule();
  try {
    const common = r.info.common_git_dir;
    const gone = (target) => [["Bash", { command: `rm -rf ${target}` }], ["Bash", { command: `mv ${target} elsewhere` }]];
    const held = [path.join(common, ".craftsman", "network"), path.join(common, ".craftsman"), common, path.dirname(common), path.dirname(path.dirname(common)), r.queue];
    for (const [where, wt] of subWorktrees(r)) {
      for (const target of held.flatMap((abs) => [abs, path.relative(wt, abs)])) assert.deepEqual(notRefused(wt, gone(target), "queue-guard-subwt-gone"), [], `allowed from the worktree ${where} the submodule, ${target}`);
      const state = path.join(common, ".craftsman");
      const after = [`cd ${common} && rm -rf .craftsman`, `cd ${common} && mv .craftsman elsewhere`, `cd ${state} && rm -rf network`, `cd ${state} && mv network elsewhere`];
      assert.deepEqual(notRefused(wt, after.map((command) => ["Bash", { command }]), "queue-guard-subwt-gone"), [], `allowed from the worktree ${where} the submodule, after cd`);
    }
    assert.match(run(r.inWt, "Bash", { command: `rm -rf ${path.join(common, ".craftsman")}` }, "queue-guard-subwt-gone").stderr, /craftsman:/, "the refusal is named");
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nothing reached the queue");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: a Read of the queue and repo-exec's own enqueuePush still work from a linked worktree of a submodule project", () => {
  const r = repoWithSubmodule();
  try {
    const script = path.join(path.dirname(GUARD), "repo-exec.mjs");
    for (const [where, wt] of subWorktrees(r)) {
      for (const file of [r.queue, path.relative(wt, r.queue)]) {
        const read = run(wt, "Read", { file_path: file }, "queue-guard-subwt-read");
        assert.equal(read.status, 0, `Read ${file} from the worktree ${where} the submodule: ${read.stderr}`);
        for (const command of [`cat ${file}`, `grep -c push ${file}`, `wc -l < ${file}`]) assert.equal(run(wt, "Bash", { command }, "queue-guard-subwt-read").status, 0, `${command} from the worktree ${where} the submodule`);
      }
      // the script that writes the queue, named in a Bash call, is not what the guard refuses: it refuses the tool call that writes the file itself
      const ran = run(wt, "Bash", { command: `printf '%s' '{"project":"."}' | node ${script} prepare` }, "queue-guard-subwt-read");
      assert.notEqual(ran.status, 2, ran.stderr);
      const sha = spawnSync("git", ["-C", wt, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
      enqueuePush(wt, r.info, { sha, dst: `feat/${where}`, reason: "again" });
    }
    assert.deepEqual(readQueue(r.info).map((e) => e.dst), ["feat/sub", "feat/inside", "feat/beside"]);
    assert.ok(fs.readFileSync(r.queue, "utf8").startsWith(r.before), "the first entry is untouched");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: ordinary directories and the other files of the submodule's git dir keep their verdict from a linked worktree of a submodule project", () => {
  const r = repoWithSubmodule();
  try {
    const common = r.info.common_git_dir;
    for (const [where, wt] of subWorktrees(r)) {
      for (const dir of ["build", "network", path.join("src", ".github"), ".github"]) fs.mkdirSync(path.join(wt, dir), { recursive: true });
      fs.writeFileSync(path.join(wt, ".gitignore"), "node_modules\n");
      const calls = [];
      for (const target of ["build", "network", "src", ".github", ".gitignore"]) calls.push(["Bash", { command: `rm -rf ${target}` }], ["Bash", { command: `mv ${target} elsewhere` }]);
      calls.push(["Write", { file_path: path.join(wt, "src", "a.txt"), content: "x" }], ["Write", { file_path: path.join(wt, "b.txt"), content: "x" }],
        ["Write", { file_path: path.join(r.sub, "c.txt"), content: "x" }], ["Write", { file_path: path.join(r.sup, "d.txt"), content: "x" }],
        ["Bash", { command: "echo x >> src/a.txt" }], ["Bash", { command: "echo x > b.txt" }], ["Bash", { command: "cat b.txt >> src/a.txt" }], ["Bash", { command: `echo x >> ${path.join(r.sub, "c.txt")}` }],
        ["Bash", { command: "rm src/a.txt" }], ["Bash", { command: "cp b.txt src/e.txt" }],
        ["Bash", { command: `echo x >> ${path.join(common, "info", "exclude")}` }], ["Bash", { command: `echo x > ${path.join(common, "description")}` }],
        ["Write", { file_path: path.join(common, "description"), content: "x" }]);
      const refused = calls.map(([tool, input]) => [label(tool, input), run(wt, tool, input, "queue-guard-subwt-ordinary")]).filter(([, got]) => got.status === 2).map(([name, got]) => `${name}: ${got.stderr.trim()}`);
      assert.deepEqual(refused, [], `an ordinary path was refused from the worktree ${where} the submodule`);
    }
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: ordinary directories and files that merely look like git state keep their verdict (the false-positive guard)", () => {
  const verdicts = (dir, calls, session_id) => calls.map(([tool, input]) => [label(tool, input), run(dir, tool, input, session_id)]);
  const r = repoWithQueue();
  try {
    for (const dir of ["build", "docs", path.join("src", ".github"), ".github"]) fs.mkdirSync(path.join(r.main, dir), { recursive: true });
    fs.writeFileSync(path.join(r.main, ".gitignore"), "node_modules\n");
    const calls = [];
    for (const target of ["build", "src", "src/.github", ".github", ".gitignore"]) calls.push(["Bash", { command: `rm -rf ${target}` }], ["Bash", { command: `mv ${target} elsewhere` }]);
    calls.push(["Write", { file_path: path.join(r.main, "src", "a.txt"), content: "x" }], ["Write", { file_path: path.join(r.main, "src", ".github", "w.yml"), content: "x" }],
      ["Write", { file_path: path.join(r.main, ".gitignore"), content: "x\n" }], ["Bash", { command: "echo x >> src/.github/w.yml" }], ["Bash", { command: "rm src/.github/w.yml" }]);
    assert.deepEqual(verdicts(r.main, calls, "queue-guard-ordinary").filter(([, got]) => got.status === 2).map(([name]) => name), [], "an ordinary path was refused");
    // `docs` is a guarded doc path in this repo's config: whatever its verdict, it is the doc-write guard's and never a claim that it holds craftsman state
    for (const [name, got] of verdicts(r.main, [["Bash", { command: "rm -rf docs" }], ["Bash", { command: "mv docs elsewhere" }]], "queue-guard-ordinary")) {
      assert.doesNotMatch(got.stderr, /holds craftsman state|craftsman grant|network/, `${name}: ${got.stderr}`);
    }
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
  const s = repoWithSubmodule();
  try {
    fs.mkdirSync(path.join(s.sup, "build"));
    fs.mkdirSync(path.join(s.sup, "src"));
    const inSuper = [["Bash", { command: "rm -rf build" }], ["Bash", { command: "mv build elsewhere" }], ["Bash", { command: "rm -rf sub/src" }], ["Write", { file_path: path.join(s.sup, "src", "a.txt"), content: "x" }]];
    assert.deepEqual(verdicts(s.sup, inSuper, "queue-guard-ordinary").filter(([, got]) => got.status === 2).map(([name]) => name), [], "an ordinary path was refused in the superproject");
    const inSub = [["Write", { file_path: path.join(s.sub, "a.txt"), content: "x" }], ["Bash", { command: "echo x >> a.txt" }], ["Write", { file_path: path.join(s.sup, "b.txt"), content: "x" }]];
    assert.deepEqual(verdicts(s.sub, inSub, "queue-guard-ordinary").filter(([, got]) => got.status === 2).map(([name]) => name), [], "an ordinary path was refused in the submodule");
  } finally { fs.rmSync(s.base, { recursive: true, force: true }); }
});
