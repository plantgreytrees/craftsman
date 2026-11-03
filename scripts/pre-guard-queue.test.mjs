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

// submodule-git-surface (scrutinise-sandbox-auto-flow phase 2, round 3). A submodule's git dir is the superproject's .git/modules/<name>. Its config, config.worktree and hooks decide which
// hooks run (core.hooksPath, an alias, a hook that fires on the next git command), and so do the config files of one of its linked worktrees (.git/modules/<name>/worktrees/<wt>/config*).
// A superproject's linked worktree keeps the git dir of a submodule checked out in it under .git/worktrees/<wt>/modules/<name>, and the push queue with it. A tool call may write none of them
// from any root that reaches them (ARCH-SAFETY-13, ARCH-SAFETY-15): the superproject root, the submodule root, both linked worktrees of the submodule and the superproject's linked worktree.
function repoWithSubmoduleSurface() {
  const r = repoWithSubmodule();
  const superWt = path.join(r.base, "super-wt");
  assert.equal(gitIn(r.sup, "worktree", "add", "-q", "-b", "feat/super-wt", superWt).status, 0);
  assert.equal(gitIn(superWt, "submodule", "update", "--init", "-q", "sub").status, 0);
  const subInWt = path.join(superWt, "sub");
  const wtGitDir = path.join(r.sup, ".git", "worktrees", "super-wt", "modules", "sub");
  assert.ok(fs.existsSync(wtGitDir), "the submodule checked out in the superproject's linked worktree has its git dir under .git/worktrees/<wt>/modules");
  enqueuePush(subInWt, { common_git_dir: wtGitDir }, { sha: gitIn(subInWt, "rev-parse", "HEAD").stdout.trim(), dst: "feat/in-super-wt", reason: "test" });
  const wtQueue = path.join(wtGitDir, ".craftsman", "network", "queue.jsonl");
  return { ...r, superWt, subInWt, wtGitDir, wtQueue, wtBefore: fs.readFileSync(wtQueue, "utf8") };
}
const surfaceRoots = (r) => [["the superproject root", r.sup], ["the submodule root", r.sub], ["the submodule's worktree inside it", r.inWt], ["the submodule's worktree beside it", r.besideWt], ["the superproject's linked worktree", r.superWt]];
// The submodule's config, its worktree config, a hook and the config of one of its linked worktrees, as the superproject names them.
const surfaceFiles = (r) => {
  const store = r.info.common_git_dir;
  return [path.join(store, "config"), path.join(store, "config.worktree"), path.join(store, "hooks", "pre-push"), path.join(store, "worktrees", "wt", "config"), path.join(store, "worktrees", "wt", "config.worktree")];
};

test("pre-guard: a tool call that writes a submodule's config, config.worktree, hooks or a linked worktree's config is refused from every root", () => {
  const r = repoWithSubmoduleSurface();
  try {
    for (const [where, dir] of surfaceRoots(r)) {
      for (const file of surfaceFiles(r)) {
        assert.deepEqual(notRefused(dir, toolCalls(file), "surface-write"), [], `allowed from ${where}, path ${file}`);
        const relative = path.relative(dir, file);
        assert.deepEqual(notRefused(dir, [["Write", { file_path: relative, content: "x" }], ["Bash", { command: `echo x >> ${relative}` }]], "surface-write"), [], `allowed from ${where}, path ${relative}`);
      }
    }
    assert.match(run(r.sup, "Write", { file_path: surfaceFiles(r)[0], content: "x" }, "surface-write").stderr, /craftsman:/, "the refusal is named");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: a Read of a submodule's config and hooks, and its other git files, still pass from every root", () => {
  const r = repoWithSubmoduleSurface();
  try {
    const store = r.info.common_git_dir;
    for (const [where, dir] of surfaceRoots(r)) {
      for (const file of [...surfaceFiles(r), path.join(store, "HEAD"), path.join(store, "info", "exclude")]) {
        const read = run(dir, "Read", { file_path: file }, "surface-read");
        assert.equal(read.status, 0, `Read ${file} from ${where}: ${read.stderr}`);
      }
      for (const command of [`cat ${path.join(store, "config")}`, `grep -c url ${path.join(store, "config")}`, `ls ${path.join(store, "hooks")}`]) assert.equal(run(dir, "Bash", { command }, "surface-read").status, 0, `${command} from ${where}`);
    }
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: the queue of a submodule checked out in a superproject's linked worktree is refused to Write, >> and rm -rf of its directories, and a Read is not", () => {
  const r = repoWithSubmoduleSurface();
  try {
    const net = path.dirname(r.wtQueue);
    const gone = (target) => [["Bash", { command: `rm -rf ${target}` }], ["Bash", { command: `mv ${target} elsewhere` }]];
    const held = [net, path.dirname(net), r.wtGitDir, path.dirname(r.wtGitDir), r.wtQueue];
    const roots = [["the superproject root", r.sup], ["the superproject's linked worktree", r.superWt], ["the submodule inside that worktree", r.subInWt]];
    for (const [where, dir] of roots) {
      for (const file of [r.wtQueue, path.relative(dir, r.wtQueue)]) assert.deepEqual(notRefused(dir, [...toolCalls(file), ...redirects(file)], "surface-wtqueue"), [], `allowed from ${where}, path ${file}`);
      for (const target of held.flatMap((abs) => [abs, path.relative(dir, abs)])) assert.deepEqual(notRefused(dir, gone(target), "surface-wtqueue-gone"), [], `allowed from ${where}, ${target}`);
      for (const file of [r.wtQueue, path.relative(dir, r.wtQueue)]) {
        const read = run(dir, "Read", { file_path: file }, "surface-wtqueue-read");
        assert.equal(read.status, 0, `Read ${file} from ${where}: ${read.stderr}`);
      }
      assert.equal(run(dir, "Bash", { command: `cat ${r.wtQueue}` }, "surface-wtqueue-read").status, 0, `cat from ${where}`);
    }
    assert.match(run(r.superWt, "Bash", { command: `echo x >> ${r.wtQueue}` }, "surface-wtqueue").stderr, /craftsman:.*network/, "the refusal names the queue");
    assert.equal(fs.readFileSync(r.wtQueue, "utf8"), r.wtBefore, "nothing reached the queue");
    assert.equal(fs.readFileSync(r.queue, "utf8"), r.before, "nor the queue of the submodule's own git dir");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: ordinary directories and the other files of the submodule's git dirs keep their verdict from every root", () => {
  const r = repoWithSubmoduleSurface();
  try {
    const store = r.info.common_git_dir;
    for (const [where, dir] of surfaceRoots(r)) {
      for (const sub of ["build", "src", path.join("src", ".github"), "modules", "worktrees"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
      const calls = [];
      for (const target of ["build", "src", "modules", "worktrees"]) calls.push(["Bash", { command: `rm -rf ${target}` }], ["Bash", { command: `mv ${target} elsewhere` }]);
      calls.push(["Write", { file_path: path.join(dir, "src", "a.txt"), content: "x" }], ["Write", { file_path: path.join(dir, "b.txt"), content: "x" }],
        ["Bash", { command: "echo x >> src/a.txt" }], ["Bash", { command: "echo x > b.txt" }], ["Bash", { command: "cp b.txt src/e.txt" }],
        ["Bash", { command: `echo x >> ${path.join(store, "info", "exclude")}` }], ["Write", { file_path: path.join(store, "description"), content: "x" }],
        ["Write", { file_path: path.join(store, "worktrees", "wt", "HEAD"), content: "x" }], ["Write", { file_path: path.join(store, "hooks-notes.txt"), content: "x" }],
        ["Write", { file_path: path.join(r.wtGitDir, "info", "exclude"), content: "x" }]);
      const refused = calls.map(([tool, input]) => [label(tool, input), run(dir, tool, input, "surface-ordinary")]).filter(([, got]) => got.status === 2).map(([name, got]) => `${name}: ${got.stderr.trim()}`);
      assert.deepEqual(refused, [], `an ordinary path was refused from ${where}`);
    }
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

// worktree-surface-fixes (scrutinise-sandbox-auto-flow phase 2, round 4). The pattern for the queue of a submodule checked out in a superproject's linked worktree
// (.git/worktrees/<wt>/modules/<name>) held everything under .git/worktrees, so a stale .git/worktrees/<wt>/index.lock could not be removed with rm -f. Only the queue's directories under it are held.
// The files of that git dir that decide which hooks run (config, config.worktree, hooks, the config of its own linked worktrees) and the commondir and gitdir files that tell git where a
// linked worktree's common dir and work tree are (a forged one redirects the queue lookup) are never written by a tool call, from any root that reaches them.
test("pre-guard: an ordinary file of a linked worktree's admin dir (index.lock, logs, HEAD) can be removed with rm from the main checkout and from the linked worktrees", () => {
  const r = repoWithQueue();
  try {
    const verdicts = [];
    for (const name of ["wt", "wt-beside"]) {
      const admin = path.join(r.main, ".git", "worktrees", name);
      assert.ok(fs.existsSync(path.join(admin, "HEAD")), `git keeps the admin dir of ${name} under the main .git/worktrees`);
      fs.writeFileSync(path.join(admin, "index.lock"), "");
      fs.mkdirSync(path.join(admin, "logs"), { recursive: true });
      const targets = [["rm -f", path.join(admin, "index.lock")], ["rm -rf", path.join(admin, "logs")], ["rm -f", path.join(admin, "logs", "HEAD")], ["rm -f", path.join(admin, "HEAD")], ["mv", path.join(admin, "index.lock")]];
      for (const dir of [r.main, r.worktree, r.sibling]) {
        for (const [verb, abs] of targets) {
          for (const file of [abs, path.relative(dir, abs)]) {
            const command = verb === "mv" ? `mv ${file} ${file}.old` : `${verb} ${file}`;
            const got = run(dir, "Bash", { command }, "worktree-admin-free");
            verdicts.push([`${command} (from ${path.relative(r.base, dir)})`, got.status, got.stderr.trim()]);
          }
        }
      }
    }
    assert.deepEqual(verdicts.filter(([, status]) => status !== 0), [], "a removal of an ordinary file of the admin dir was refused");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: from every root, a lock in a superproject's linked worktree admin dir can go, while the admin dir, .git/worktrees and the modules directory under it stay held", () => {
  const r = repoWithSubmoduleSurface();
  try {
    const admin = path.join(r.sup, ".git", "worktrees", "super-wt");
    fs.writeFileSync(path.join(admin, "index.lock"), "");
    const gone = (abs, dir) => [["Bash", { command: `rm -rf ${abs}` }], ["Bash", { command: `rm -rf ${path.relative(dir, abs)}` }], ["Bash", { command: `mv ${abs} elsewhere` }]];
    // the queue of the submodule checked out in the linked worktree, each directory above it, and the git dir of a submodule nested in it (its name path may lead to a queue)
    const held = [admin, path.dirname(admin), path.join(r.sup, ".git"), path.join(admin, "modules"), r.wtGitDir, path.join(r.wtGitDir, ".craftsman"), path.dirname(r.wtQueue), r.wtQueue, path.join(r.wtGitDir, "modules", "inner")];
    for (const [where, dir] of surfaceRoots(r)) {
      const lock = path.join(admin, "index.lock");
      const free = [["Bash", { command: `rm -f ${lock}` }], ["Bash", { command: `rm -f ${path.relative(dir, lock)}` }], ["Bash", { command: `rm -f ${path.join(admin, "logs", "HEAD")}` }]];
      const refused = free.map(([tool, input]) => [label(tool, input), run(dir, tool, input, "worktree-admin-free-surface")]).filter(([, got]) => got.status === 2).map(([name, got]) => `${name}: ${got.stderr.trim()}`);
      assert.deepEqual(refused, [], `an ordinary file of the admin dir was refused from ${where}`);
      for (const abs of held) assert.deepEqual(notRefused(dir, gone(abs, dir), "worktree-admin-held-surface"), [], `allowed from ${where}, ${abs}`);
    }
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

// The files a tool call may not write, as the superproject names them: the config, config.worktree, a hook and a linked worktree's config.worktree of the git dir of a submodule checked
// out in the superproject's linked worktree, the commondir and gitdir of that linked worktree, and the same two files of a linked worktree of the submodule itself.
function worktreeSurfaceFiles(r) {
  const store = r.info.common_git_dir, admin = path.join(r.sup, ".git", "worktrees", "super-wt");
  for (const file of ["commondir", "gitdir"]) assert.ok(fs.existsSync(path.join(admin, file)), `git writes ${file} into the admin dir of a linked worktree`);
  return [
    path.join(r.wtGitDir, "config"), path.join(r.wtGitDir, "config.worktree"), path.join(r.wtGitDir, "hooks", "pre-push"), path.join(r.wtGitDir, "worktrees", "subwt", "config.worktree"),
    path.join(admin, "commondir"), path.join(admin, "gitdir"),
    path.join(store, "worktrees", "subwt", "commondir"), path.join(store, "worktrees", "subwt", "gitdir"),
    // the admin dirs git really made for the submodule's two linked worktrees, and a linked worktree of the submodule that lives in the superproject's linked worktree
    path.join(store, "worktrees", "wt", "commondir"), path.join(store, "worktrees", "sub-wt", "gitdir"),
    path.join(r.wtGitDir, "worktrees", "subwt", "commondir"), path.join(r.wtGitDir, "worktrees", "subwt", "gitdir"), path.join(r.wtGitDir, "worktrees", "subwt", "config"),
  ];
}

test("pre-guard: a Write or an echo >> onto a worktree-modules git dir's config, config.worktree, hooks or worktree config, or onto a commondir or gitdir file, is refused from every root", () => {
  const r = repoWithSubmoduleSurface();
  try {
    const files = worktreeSurfaceFiles(r);
    for (const [where, dir] of surfaceRoots(r)) {
      const calls = files.flatMap((file) => [["Write", { file_path: file, content: "x" }], ["Bash", { command: `echo x >> ${file}` }], ["Write", { file_path: path.relative(dir, file), content: "x" }]]);
      assert.deepEqual(notRefused(dir, calls, "worktree-surface-write"), [], `allowed from ${where}`);
    }
    assert.match(run(r.sup, "Write", { file_path: files[4], content: "x" }, "worktree-surface-write").stderr, /craftsman:/, "the refusal is named");
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: a Read or a cat of a worktree-modules git dir's config, hooks, commondir and gitdir still passes from every root", () => {
  const r = repoWithSubmoduleSurface();
  try {
    const files = worktreeSurfaceFiles(r);
    for (const [where, dir] of surfaceRoots(r)) {
      for (const file of files) {
        const read = run(dir, "Read", { file_path: file }, "worktree-surface-read");
        assert.equal(read.status, 0, `Read ${file} from ${where}: ${read.stderr}`);
      }
      for (const command of [`cat ${files[4]}`, `cat ${files[5]}`, `cat ${files[0]}`, `ls ${path.dirname(files[2])}`]) assert.equal(run(dir, "Bash", { command }, "worktree-surface-read").status, 0, `${command} from ${where}`);
    }
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});

test("pre-guard: the other files of the admin dirs (HEAD, logs, a lock to remove) keep their verdict from every root", () => {
  const r = repoWithSubmoduleSurface();
  try {
    const store = r.info.common_git_dir, admin = path.join(r.sup, ".git", "worktrees", "super-wt");
    for (const [where, dir] of surfaceRoots(r)) {
      // (a Write of an index.lock is the protectedPaths rule for lock files, and everything under .git/modules stays held: neither is this unit's)
      const calls = [["Write", { file_path: path.join(store, "worktrees", "wt", "HEAD"), content: "x" }], ["Write", { file_path: path.join(admin, "logs", "HEAD"), content: "x" }],
        ["Write", { file_path: path.join(admin, "HEAD"), content: "x" }], ["Write", { file_path: path.join(admin, "locked"), content: "x" }], ["Bash", { command: `rm -f ${path.join(admin, "index.lock")}` }],
        ["Bash", { command: `echo x >> ${path.join(admin, "HEAD")}` }]];
      const refused = calls.map(([tool, input]) => [label(tool, input), run(dir, tool, input, "worktree-surface-ordinary")]).filter(([, got]) => got.status === 2).map(([name, got]) => `${name}: ${got.stderr.trim()}`);
      assert.deepEqual(refused, [], `an ordinary file of an admin dir was refused from ${where}`);
    }
  } finally { fs.rmSync(r.base, { recursive: true, force: true }); }
});
