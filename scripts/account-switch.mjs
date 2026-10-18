#!/usr/bin/env node
// /craftsman:account-switch engine. Switching Claude account or org mid-session
// leaves earlier thinking unreadable; the visible transcript and the disk
// survive. This script writes the handoff that carries the reasoning across,
// rebuilds one from the transcript when no handoff was written, and moves
// craftsman's session-owned state (plan hand-off, unit claims, worktree ledger)
// to a replacing session. Every read and write goes through here, never the
// Read/Write tools, so it works while pre-guard blocks those for a scoped run.
//
//   snapshot                      environment + craftsman session state (markdown)
//   template                      the handoff template to fill in
//   save                          stdin markdown → handoff file, snapshot appended, LATEST updated
//   list                          handoffs for this project, newest first
//   show <file|latest> [--from N] [--lines M]
//   log <file|latest> <text>      append a line to the handoff's restore log
//   sessions [--all]              transcripts that recover can rebuild from
//   digest <session-id|file>      transcript → readable digest file (thinking omitted)
//   adopt --from <session-id> [--confirm]
//
// Common flags: --project <id> (workspace project), --session <id> (defaults to
// $CLAUDE_CODE_SESSION_ID), --dir <path> (defaults to cwd).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  atomicWrite, forgetSessionWorktree, logEvent, projectContext, readSessionWorktrees,
  readStdin, recordSessionWorktree, sessionDir, sharedStateDir, sidOf,
} from "./lib/core.mjs";
import { transferClaim } from "./claim.mjs";
import { PATTERNS } from "./secrets-scan.mjs";

const RESTORE_LOG = "## Restore log";
const SNAPSHOT_HEADING = "## 11. Environment snapshot";

export const TEMPLATE = `# Handoff: <short title of the task>

> <"Written by /craftsman:account-switch prepare" | "Reconstructed by /craftsman:account-switch recover from <transcript> — no prepare was run">
> User note: <verbatim, or "none">

## 1. Goal
<What the user ultimately wants and what "done" looks like.>

### User requests (verbatim, in order)
1. "<quote — corrections and clarifications included>"

### Standing preferences and constraints
<Rules from the user, CLAUDE.md or memory: merge policy, style, "don't touch X", tests.>

## 2. Decisions and reasoning
| # | Decision | Why | Alternatives rejected (and why) |
|---|----------|-----|---------------------------------|
| 1 | ... | ... | ... |

## 3. Mental model
<How the relevant code fits together, invariants, gotchas — with path:line refs.>

## 4. Work done
- <change> — <files> — <commit sha | "uncommitted">
- Verified by: <commands and results>

## 5. Current state
- Stopped at: <exactly where — mid-edit or not; last prompt and whether it was answered>
- Uncommitted changes: <summary and why>
- Build/test status: <last result + command>
- Craftsman run: <plan slug, unit, tracker state — or "none">
- Will NOT survive the switch: <background tasks, servers, monitors, subagents — IDs and purpose>

## 6. Dead ends
- <approach> → <why it failed>

## 7. Open questions and blockers
- <question> — <who decides>

## 8. Next steps (ordered)
1. <concrete step, with file or command>

## 9. Re-read on restore
- \`path/to/file:120-180\` — why

## 10. Verify on restore
- <commands that confirm the baseline, e.g. the test command>
`;

// ------------------------------------------------------------------ args ---
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    if (["all", "confirm"].includes(key)) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

const claudeHome = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
// Claude Code names a project's transcript folder after its path, every
// non-alphanumeric character turned into "-".
export const projectSlug = (dir) => path.resolve(dir).replace(/[^A-Za-z0-9]/g, "-");

export function redact(text) {
  let count = 0;
  for (const { name, re } of PATTERNS) {
    text = text.replace(re, () => { count++; return `[REDACTED ${name}]`; });
  }
  return { text, count };
}

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trimEnd();
  } catch { return null; }
}

export function handoffDir(context) {
  return path.join(sharedStateDir(context), "account-handoffs");
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

// -------------------------------------------------------------- snapshot ---
function findTranscript(sid, dirs) {
  const projects = path.join(claudeHome(), "projects");
  for (const dir of dirs) {
    const file = path.join(projects, projectSlug(dir), `${sid}.jsonl`);
    if (fs.existsSync(file)) return file;
  }
  try {
    for (const slug of fs.readdirSync(projects)) {
      const file = path.join(projects, slug, `${sid}.jsonl`);
      if (fs.existsSync(file)) return file;
    }
  } catch {}
  return null;
}

function gitSection(dir) {
  const top = run("git", ["rev-parse", "--show-toplevel"], dir);
  if (!top) return [`## Git (${dir})`, "", "- not a git repository", ""];
  const upstream = run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], dir);
  const counts = upstream && run("git", ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], dir);
  const [behind, ahead] = (counts || "").split(/\s+/);
  const fence = (title, body) => [`### ${title}`, "```", body || "(none)", "```"];
  const status = (run("git", ["status", "--porcelain=v1"], dir) || "").split("\n");
  return [
    `## Git (${top})`, "",
    `- branch: ${run("git", ["branch", "--show-current"], dir) || "(detached)"}`,
    `- head: ${run("git", ["log", "-1", "--format=%H %s"], dir) || "(no commits)"}`,
    `- upstream: ${upstream ? `${upstream} (ahead ${ahead}, behind ${behind})` : "none"}`, "",
    ...fence("Status", status.slice(0, 100).join("\n") + (status.length > 100 ? `\n… ${status.length - 100} more` : "")),
    ...fence("Diff stat (uncommitted)", run("git", ["diff", "HEAD", "--stat"], dir)),
    ...fence("Recent commits", run("git", ["log", "--oneline", "-10"], dir)),
    ...fence("Worktrees", run("git", ["worktree", "list"], dir)),
    ...fence("Stashes", run("git", ["stash", "list", "-n", "10"], dir)),
    "",
  ];
}

export function ownedClaims(context, sid) {
  const dir = path.join(context.stateDir, "claims");
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.flatMap((name) => {
    try {
      const owner = JSON.parse(fs.readFileSync(path.join(dir, name, "owner.json"), "utf8"));
      return owner.session_id === sid ? [{ lock: path.join(dir, name), ...owner }] : [];
    } catch { return []; }
  });
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function craftsmanSection(context, sid) {
  const handoff = readJson(path.join(sessionDir(sid, context), "handoff.json"));
  const claims = ownedClaims(context, sid);
  const worktrees = readSessionWorktrees({ session_id: sid }, context);
  return [
    "## Craftsman session state", "",
    `- plan hand-off: ${handoff ? `plan ${handoff.plan}; unit ${handoff.unit || "phase"}; next: ${handoff.next_action} (${handoff.written_at})` : "none"}`,
    `- unit claims held: ${claims.length ? claims.map((c) => `${c.plan} / ${c.unit}`).join("; ") : "none"}`,
    `- worktrees this session prepared: ${worktrees.length ? worktrees.join("; ") : "none"}`,
    "",
  ];
}

export function snapshot({ context, sid, dir }) {
  const dirs = [...new Set([path.resolve(dir), context.root])];
  const lines = [
    "## Session", "",
    `- session_id: ${sid}`,
    `- cwd: ${path.resolve(dir)}`,
    `- project root: ${context.root}${context.id !== "." ? ` (workspace project ${context.id})` : ""}`,
    `- transcript: ${findTranscript(sid, dirs) || "not found"}`,
    `- captured_at: ${new Date().toISOString()}`, "",
  ];
  for (const d of dirs) lines.push(...gitSection(d));
  lines.push(...craftsmanSection(context, sid));
  return lines.join("\n");
}

// --------------------------------------------------------- handoff files ---
export function saveHandoff({ context, sid, dir, body }) {
  if (!body.trim()) throw new Error("save needs the handoff markdown on stdin");
  // The snapshot is always fresh and machine-written, and the restore log
  // always starts empty, whatever the body carried.
  const cut = [body.indexOf(SNAPSHOT_HEADING), body.indexOf(RESTORE_LOG)].filter((i) => i >= 0);
  const main = (cut.length ? body.slice(0, Math.min(...cut)) : body).trimEnd();
  const full = `${main}\n\n${SNAPSHOT_HEADING}\n\n${snapshot({ context, sid, dir })}\n${RESTORE_LOG}\n`;
  const { text, count } = redact(full);
  const folder = handoffDir(context);
  const file = path.join(folder, `${stamp()}-${sid.slice(0, 8)}.md`);
  fs.mkdirSync(folder, { recursive: true });
  atomicWrite(file, text);
  atomicWrite(path.join(folder, "LATEST"), file + "\n");
  logEvent({ ev: "account_handoff_saved", sid, file }, context);
  return { file, redacted: count };
}

export function listHandoffs(context) {
  const folder = handoffDir(context);
  let names = [];
  try { names = fs.readdirSync(folder); } catch { return []; }
  return names
    .filter((n) => n.endsWith(".md") && !n.endsWith(".digest.md"))
    .map((n) => {
      const file = path.join(folder, n);
      const text = fs.readFileSync(file, "utf8");
      const restores = text.slice(text.indexOf(RESTORE_LOG)).split("\n").filter((l) => l.startsWith("- ")).length;
      return { file, mtime: fs.statSync(file).mtimeMs, title: /^# (.*)$/m.exec(text)?.[1] || n, restores };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function resolveHandoff(context, ref) {
  if (ref && ref !== "latest") {
    if (fs.existsSync(ref)) return path.resolve(ref);
    const inDir = path.join(handoffDir(context), ref);
    if (fs.existsSync(inDir)) return inDir;
    throw new Error(`no handoff at ${ref}`);
  }
  try {
    const latest = fs.readFileSync(path.join(handoffDir(context), "LATEST"), "utf8").trim();
    if (latest && fs.existsSync(latest)) return latest;
  } catch {}
  const newest = listHandoffs(context)[0];
  if (newest) return newest.file;
  throw new Error(`no handoff for this project (looked in ${handoffDir(context)}) — use recover`);
}

export function showSlice(file, from = 1, count = 400) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const start = Math.max(1, from);
  const end = Math.min(lines.length, start + count - 1);
  const more = end < lines.length ? `; continue with --from ${end + 1}` : "; end of file";
  return `${file} — lines ${start}-${end} of ${lines.length}${more}\n\n${lines.slice(start - 1, end).join("\n")}`;
}

export function appendRestoreLog(file, entry) {
  const text = fs.readFileSync(file, "utf8");
  const body = text.includes(RESTORE_LOG) ? text.trimEnd() : `${text.trimEnd()}\n\n${RESTORE_LOG}`;
  atomicWrite(file, `${body}\n- ${new Date().toISOString()} ${entry.replace(/\n/g, " ")}\n`);
}

// ----------------------------------------------------------- transcripts ---
function loadRecords(file) {
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

const textOf = (content) => Array.isArray(content)
  ? content.filter((x) => x?.type === "text").map((x) => x.text || "").join("\n")
  : typeof content === "string" ? content : content == null ? "" : JSON.stringify(content);

function userPrompts(records) {
  return records
    .filter((d) => d.type === "user" && !d.isMeta && !d.isSidechain && !d.isCompactSummary)
    .map((d) => textOf(d.message?.content).trim())
    .filter(Boolean);
}

// Transcripts recover can rebuild from, newest first. The current session ranks
// last unless it holds more than the prompt that launched recovery — after an
// in-session /login it is the one to recover; in a fresh session it is empty.
export function listSessions({ context, dir, sid, all = false, limit = 12 }) {
  const projects = path.join(claudeHome(), "projects");
  let folders;
  if (all) {
    try { folders = fs.readdirSync(projects).map((s) => path.join(projects, s)); } catch { folders = []; }
  } else {
    const worktrees = (run("git", ["worktree", "list", "--porcelain"], context.root) || "")
      .split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9));
    folders = [...new Set([dir, context.root, ...worktrees].map((d) => path.join(projects, projectSlug(d))))];
  }
  const listed = folders.flatMap((folder) => {
    try { return fs.readdirSync(folder).filter((n) => n.endsWith(".jsonl")).map((n) => path.join(folder, n)); }
    catch { return []; }
  });
  // A session started above the repo (a workspace) files its transcript there.
  const own = findTranscript(sid, [dir, context.root]);
  const files = [...new Set(own ? [own, ...listed] : listed)]
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  const rows = files.flatMap(({ file, mtime }) => {
    const records = loadRecords(file);
    const prompts = userPrompts(records);
    if (!prompts.length) return [];
    const session = path.basename(file, ".jsonl");
    const cwd = records.find((d) => d.cwd)?.cwd || "?";
    return [{ file, session, mtime, cwd, prompts: prompts.length, first: prompts[0], last: prompts.at(-1), current: session === sid }];
  });
  return [...rows.filter((r) => !(r.current && r.prompts <= 1)), ...rows.filter((r) => r.current && r.prompts <= 1)];
}

function resolveTranscript(ref, dirs) {
  if (fs.existsSync(ref)) return path.resolve(ref);
  const exact = findTranscript(ref, dirs);
  if (exact) return exact;
  const projects = path.join(claudeHome(), "projects");
  const hits = [];
  try {
    for (const slug of fs.readdirSync(projects)) {
      for (const n of fs.readdirSync(path.join(projects, slug))) {
        if (n.startsWith(ref) && n.endsWith(".jsonl")) hits.push(path.join(projects, slug, n));
      }
    }
  } catch {}
  const sessions = new Set(hits.map((h) => path.basename(h)));
  if (sessions.size > 1) throw new Error(`session prefix ${ref} is ambiguous: ${[...sessions].join(", ")}`);
  if (!hits.length) throw new Error(`no transcript matches ${ref}`);
  return hits[0];
}

const short = (value, n) => {
  const s = (typeof value === "string" ? value : JSON.stringify(value ?? "")).trim();
  return s.length <= n ? s : `${s.slice(0, n)} …[+${s.length - n} chars]`;
};

function describeTool(name, input = {}) {
  if (name === "Bash") return `Bash${input.description ? ` (${input.description})` : ""}: \`${short(input.command, 400)}\``;
  if (name === "Edit") return `Edit \`${input.file_path}\`\n    - old: \`${short(input.old_string, 200)}\`\n    - new: \`${short(input.new_string, 300)}\``;
  if (name === "Write") return `Write \`${input.file_path}\` (${(input.content || "").length} chars)`;
  if (name === "Read" || name === "NotebookEdit") return `${name} \`${input.file_path || input.notebook_path}\``;
  if (name === "Agent" || name === "Task") return `${name} [${input.subagent_type || ""}] ${input.description || ""}: ${short(input.prompt, 400)}`;
  if (name === "Skill") return `Skill \`${input.skill}\` ${input.args || ""}`;
  return `${name}: ${short(input, 300)}`;
}

export function digestTranscript(file, { resultChars = 600 } = {}) {
  const records = loadRecords(file);
  const msgs = records.filter((d) => (d.type === "user" || d.type === "assistant") && !d.isSidechain);
  const first = msgs.find((d) => d.cwd) || {};
  const last = [...msgs].reverse().find((d) => d.cwd) || {};
  const title = records.filter((d) => d.type === "ai-title").map((d) => d.aiTitle || d.title).filter(Boolean).at(-1);
  const out = [
    `# Session digest: ${path.basename(file, ".jsonl")}`, "",
    `- transcript: ${file}`,
    `- title: ${title || "n/a"}`,
    `- span: ${first.timestamp || "?"} → ${last.timestamp || "?"}`,
    `- cwd (start → end): ${first.cwd || "?"} → ${last.cwd || "?"}`,
    `- git branch (start → end): ${first.gitBranch || "?"} → ${last.gitBranch || "?"}`, "",
    "Thinking blocks are omitted (unreadable after an account switch). Everything below is the visible record.", "",
  ];
  const files = new Map();
  const errors = [];
  const pending = new Map();
  let thinking = 0;
  for (const d of msgs) {
    const content = d.message?.content;
    const ts = (d.timestamp || "").slice(11, 19);
    if (d.type === "user") {
      if (d.isCompactSummary) { out.push("", "## [Earlier context — compaction summary]", "", textOf(content).trim(), ""); continue; }
      if (typeof content === "string") {
        if (!d.isMeta && content.trim()) out.push("", `## USER ${ts}`, "", content.trim(), "");
        continue;
      }
      for (const x of content || []) {
        if (x.type === "text" && !d.isMeta && x.text?.trim()) out.push("", `## USER ${ts}`, "", x.text.trim(), "");
        if (x.type !== "tool_result") continue;
        const text = textOf(x.content);
        const name = pending.get(x.tool_use_id) || "?";
        if (x.is_error) errors.push(`${ts} ${name}: ${short(text, 200)}`);
        if (text.trim()) out.push(`  - ${x.is_error ? "ERROR" : "result"}: ${short(text, resultChars).replace(/\n/g, "\n    ")}`);
      }
      continue;
    }
    for (const x of Array.isArray(content) ? content : []) {
      if (x.type === "thinking" || x.type === "redacted_thinking") thinking++;
      else if (x.type === "text" && x.text?.trim()) out.push("", `### CLAUDE ${ts}`, "", x.text.trim(), "");
      else if (x.type === "tool_use") {
        pending.set(x.id, x.name);
        out.push(`- **tool** ${describeTool(x.name, x.input || {})}`);
        const target = x.input?.file_path || x.input?.notebook_path;
        if (target) files.set(target, new Set([...(files.get(target) || []), x.name]));
      }
    }
  }
  // A last tool call with no result was cut off by the switch.
  const answered = new Set(msgs.flatMap((d) => Array.isArray(d.message?.content)
    ? d.message.content.filter((x) => x.type === "tool_result").map((x) => x.tool_use_id) : []));
  const unanswered = [...pending.entries()].filter(([id]) => !answered.has(id)).map(([, name]) => name);
  out.push("", "---", "", "## Files touched", "");
  out.push(...(files.size ? [...files].map(([f, k]) => `- \`${f}\` — ${[...k].sort().join(", ")}`) : ["- none"]));
  out.push("", "## Tool errors", "", ...(errors.length ? errors.map((e) => `- ${e}`) : ["- none"]));
  out.push("", "## Tool calls with no result", "", ...(unanswered.length ? unanswered.map((n) => `- ${n}`) : ["- none"]));
  out.push("", `_${thinking} thinking blocks omitted._`, "");
  return redact(out.join("\n"));
}

// ----------------------------------------------------------------- adopt ---
function liveSession(sid) {
  const dir = path.join(claudeHome(), "sessions");
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")); } catch { return null; }
  for (const n of names) {
    const record = readJson(path.join(dir, n));
    if (record?.sessionId !== sid || !record.pid) continue;
    try { process.kill(record.pid, 0); return record.pid; } catch {}
  }
  return null;
}

// Move what craftsman keys by session id from the session the account switch
// left behind to this one. Grants, scopes and the auto marker are not moved:
// re-invoking /craftsman:orchestrate or /craftsman:auto recreates them.
export function adopt({ context, from, to, confirm = false, checkLive = true }) {
  if (!from) throw new Error("adopt needs --from <previous session id>");
  if (from === to) return { actions: [], note: "same session — nothing to adopt" };
  if (checkLive) {
    const pid = liveSession(from);
    if (pid) throw new Error(`session ${from} is still running (pid ${pid}); close it before adopting its state`);
  }
  const actions = [];
  const oldHandoff = path.join(sessionDir(from, context), "handoff.json");
  const handoff = readJson(oldHandoff);
  if (handoff) actions.push({ what: `plan hand-off (${handoff.plan}, unit ${handoff.unit || "phase"})`,
    apply: () => atomicWrite(path.join(sessionDir(to, context), "handoff.json"), JSON.stringify({ ...handoff, session_id: to }, null, 2) + "\n") });
  for (const claim of ownedClaims(context, from)) {
    actions.push({ what: `unit claim ${claim.plan} / ${claim.unit}`, apply: () => transferClaim(claim.lock, from, to) });
  }
  for (const worktree of readSessionWorktrees({ session_id: from }, context)) {
    actions.push({ what: `worktree ${worktree}`, apply: () => {
      recordSessionWorktree({ session_id: to }, worktree, context);
      forgetSessionWorktree({ session_id: from }, worktree, context);
    } });
  }
  if (confirm) {
    for (const a of actions) a.apply();
    logEvent({ ev: "account_session_adopted", sid: to, previous_session: from, items: actions.length }, context);
  }
  return { actions: actions.map((a) => a.what), applied: confirm };
}

// ------------------------------------------------------------------- cli ---
async function main(argv) {
  const args = parseArgs(argv);
  const [cmd, ref, ...rest] = args._;
  const context = projectContext(args.project || ".");
  const sid = sidOf({ session_id: args.session || process.env.CLAUDE_CODE_SESSION_ID });
  const dir = path.resolve(args.dir || process.cwd());
  const say = (s) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");

  switch (cmd) {
    case "snapshot": return say(snapshot({ context, sid, dir }));
    case "template": return say(TEMPLATE);
    case "save": {
      const { file, redacted } = saveHandoff({ context, sid, dir, body: await readStdin() });
      return say(`handoff saved: ${file}${redacted ? ` (${redacted} secret(s) redacted)` : ""}`);
    }
    case "list": {
      const rows = listHandoffs(context);
      if (!rows.length) return say(`no handoffs in ${handoffDir(context)}`);
      return say(rows.slice(0, 10).map((r) =>
        `${r.file}\n    ${new Date(r.mtime).toISOString()}  ${r.title}  (restored ${r.restores}×)`).join("\n"));
    }
    case "show": return say(showSlice(resolveHandoff(context, ref), Number(args.from) || 1, Number(args.lines) || 400));
    case "log": {
      const file = resolveHandoff(context, ref);
      appendRestoreLog(file, rest.join(" ") || `restored in session ${sid} at ${dir}`);
      return say(`restore logged in ${file}`);
    }
    case "sessions": {
      const rows = listSessions({ context, dir, sid, all: args.all });
      if (!rows.length) return say("no transcripts found — try --all, or --dir <where the work happened>");
      const one = (s) => short(s.replace(/\s+/g, " "), 110);
      return say(rows.slice(0, 8).map((r) =>
        `${r.session}${r.current ? " (this session)" : ""}  ${new Date(r.mtime).toISOString()}  ${r.prompts} prompts  ${r.cwd}\n` +
        `    first: ${one(r.first)}\n    last:  ${one(r.last)}`).join("\n"));
    }
    case "digest": {
      if (!ref) throw new Error("digest needs a session id (or prefix) or a transcript path");
      const transcript = resolveTranscript(ref, [dir, context.root]);
      const { text, count } = digestTranscript(transcript, { resultChars: Number(args["result-chars"]) || 600 });
      const folder = handoffDir(context);
      const file = path.join(folder, `${stamp()}-${path.basename(transcript, ".jsonl").slice(0, 8)}.digest.md`);
      fs.mkdirSync(folder, { recursive: true });
      atomicWrite(file, text);
      return say(`digest written: ${file} (${text.split("\n").length} lines${count ? `, ${count} secret(s) redacted` : ""}) — read it with: show ${file}`);
    }
    case "adopt": {
      const result = adopt({ context, from: args.from && sidOf({ session_id: args.from }), to: sid, confirm: args.confirm });
      if (result.note) return say(result.note);
      if (!result.actions.length) return say(`session ${args.from} holds no craftsman state — nothing to adopt`);
      return say(`${result.applied ? "adopted" : "would adopt (re-run with --confirm)"}:\n${result.actions.map((a) => `- ${a}`).join("\n")}`);
    }
    default:
      throw new Error("usage: account-switch.mjs snapshot|template|save|list|show|log|sessions|digest|adopt");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`craftsman: account-switch: ${error.message}\n`);
    process.exitCode = 2;
  }
}
