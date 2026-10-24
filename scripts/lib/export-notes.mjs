// Generated notes folder and idea inbox for other tools (ARCH-VIEWS-11..14).
// Everything lives under the main checkout's .craftsman/export/: notes/ is
// generated (every file carries `generated: true`), inbox/ is user-owned and
// is never written by the generator. Notes hold frontmatter, one goal line
// and the repo-relative source path, never a document body.
import fs from "node:fs";
import path from "node:path";
import { mainCheckoutRoot } from "./core.mjs";
import { loadIndex, parseFrontmatter, SLUG_RE } from "./plan-index.mjs";
import { currentState, parseArchiveHeading, archivePath } from "../tracker.mjs";

export const INBOX_MAX_BYTES = 20 * 1024;
const MARKER = /^generated:[ \t]*true[ \t]*$/m;

export function exportRoot(context) {
  return path.join(mainCheckoutRoot(context.root), ".craftsman", "export");
}
// Proves .craftsman and .craftsman/export under the main checkout are real
// directories inside it (lstat, then realpath) and creates them when absent;
// throws otherwise (ARCH-VIEWS-11). Returns the export directory.
export function verifiedExportDir(context) {
  const main = mainCheckoutRoot(context.root);
  let mainReal;
  try { mainReal = fs.realpathSync(main); } catch { throw new Error("refusing export: main checkout not found"); }
  let cur = main;
  for (const part of [".craftsman", "export"]) {
    cur = path.join(cur, part);
    let st = null;
    try { st = fs.lstatSync(cur); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (!st) { fs.mkdirSync(cur); st = fs.lstatSync(cur); }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`refusing export: ${part} is not a real directory`);
    const real = fs.realpathSync(cur);
    if (!inside(mainReal, real)) throw new Error(`refusing export: ${part} resolves outside the checkout`);
  }
  return cur;
}

// Writes text to file through a temp file in the same directory and renames it
// into place; refuses a symlinked or non-regular target. The temp file is
// removed on failure, so a write killed before the rename leaves file intact.
export function atomicWrite(file, text) {
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile()) throw new Error(`refusing export target: ${path.basename(file)} is not a regular file`);
  } catch (e) { if (e.code !== "ENOENT") throw e; }
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, text, { flag: "wx" });
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
}

// Writes one file directly under the verified export directory.
export function writeExportFile(context, name, text) {
  const file = path.join(verifiedExportDir(context), name);
  atomicWrite(file, text);
  return file;
}

export const notesRoot = (context) => path.join(exportRoot(context), "notes");
export const inboxRoot = (context) => path.join(exportRoot(context), "inbox");

const oneLine = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const goodSlug = (s) => SLUG_RE.test(String(s)) && !/^\.+$/.test(String(s));
const slugOf = (p) => path.posix.basename(String(p || "").split(path.sep).join("/"), ".md");

// ---- frontmatter emit: every value stays on one line ----
function scalar(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = oneLine(v);
  return /^[A-Za-z0-9._\/-]+$/.test(s) && !/^(true|false|null|yes|no|on|off|~|[-+.]?\d[\d.]*)$/i.test(s) ? s : JSON.stringify(s);
}
function value(v) {
  return Array.isArray(v) ? `[${v.map((x) => scalar(x)).join(", ")}]` : scalar(v);
}
function note(fm, goal, source) {
  const lines = Object.entries({ ...fm, generated: true }).map(([k, v]) => `${k}: ${value(v)}`);
  return `---\n${lines.join("\n")}\n---\n${oneLine(goal)}\n\n${source}\n`;
}

// ---- status rollup of a plan's ledger rows ----
export function planStatusRollup(rows) {
  const live = rows.filter((r) => r.status !== "CANCELLED");
  if (!live.length) return "UNTRACKED";
  if (live.some((r) => r.status === "BLOCKED")) return "BLOCKED";
  if (live.some((r) => r.status === "PARKED")) return "PARKED";
  if (live.every((r) => r.status === "COMPLETE")) return "COMPLETE";
  if (live.every((r) => ["MERGED", "FEATURE_MERGED", "COMPLETE"].includes(r.status))) return "MERGED";
  if (live.every((r) => r.status === "PENDING")) return "PENDING";
  return "IN_PROGRESS";
}

function listMd(dir, filter = () => true) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".md") && filter(f)).sort()
      .filter((f) => fs.lstatSync(path.join(dir, f)).isFile());
  } catch { return []; }
}
const readFm = (file) => { try { return parseFrontmatter(fs.readFileSync(file, "utf8")); } catch { return {}; } };

// Map of notes-relative path -> note text.
export function buildNotes(context) {
  const root = context.root;
  const out = new Map();
  const rows = context.rows ?? currentState(context);
  let index = null;
  try { index = context.index ?? loadIndex(root); } catch { index = null; }

  // plans
  const planDir = path.join(root, "docs", "plans");
  const live = new Set();
  for (const f of listMd(planDir, (n) => n !== "TRACKER.md" && n !== "TRACKER-archive.md" && n !== "NEXT.md")) {
    const fm = readFm(path.join(planDir, f));
    const slug = String(fm.slug || f.slice(0, -3));
    if (!goodSlug(slug) || f.slice(0, -3) !== slug) continue;
    live.add(slug);
    const mine = rows.filter((r) => slugOf(r.plan) === slug);
    const done = mine.filter((r) => r.status === "COMPLETE").length;
    const node = index?.nodes.get(slug);
    const updated = mine.map((r) => r.updated_at).filter(Boolean).sort().pop() ?? "";
    const source = `docs/plans/${f}`;
    out.set(`plans/${slug}.md`, note({
      type: "plan", slug, status: planStatusRollup(mine), progress: `${done}/${mine.length}`,
      priority: node?.priority ?? (fm.priority ? String(fm.priority) : "P2"),
      parent: node?.parent ?? "", goal: oneLine(fm.goal), updated, source,
    }, fm.goal || slug, source));
  }

  // ideas
  const ideaDir = path.join(root, "docs", "ideas");
  for (const f of listMd(ideaDir)) {
    const fm = readFm(path.join(ideaDir, f));
    const slug = f.slice(0, -3);
    if (!goodSlug(slug)) continue;
    const source = `docs/ideas/${f}`;
    out.set(`ideas/${slug}.md`, note({
      type: "idea", slug, verdict: oneLine(fm.verdict), status: oneLine(fm.status),
      confidence: oneLine(fm.confidence), updated: oneLine(fm.updated), source,
    }, fm.goal || fm.title || slug, source));
  }

  // architecture areas
  const archDir = path.join(root, "docs", "architecture");
  for (const f of listMd(archDir, (n) => n.endsWith(".rules.md"))) {
    const file = path.join(archDir, f);
    const fm = readFm(file);
    const slug = String(fm.area || f.replace(/\.rules\.md$/, ""));
    if (!goodSlug(slug)) continue;
    let text = "";
    try { text = fs.readFileSync(file, "utf8"); } catch { /* unreadable: counts stay 0 */ }
    const ruleLines = text.split("\n").filter((l) => /^- \*\*ARCH-[A-Z0-9-]+\*\*/.test(l));
    const governs = Array.isArray(fm.governs) ? fm.governs.map(String) : fm.governs ? [String(fm.governs)] : [];
    const source = `docs/architecture/${f}`;
    out.set(`areas/${slug}.md`, note({
      type: "area", slug, rules: ruleLines.length, superseded: ruleLines.filter((l) => /\[superseded/.test(l)).length,
      governs, from_idea: oneLine(fm.source), source,
    }, `Architecture area ${slug}`, source));
  }

  // archived plans (a retired plan's note is replaced by one of these)
  let archiveText = "";
  try { archiveText = fs.readFileSync(archivePath(context), "utf8"); } catch { /* no archive yet */ }
  const source = "docs/plans/TRACKER-archive.md";
  for (const line of archiveText.split("\n")) {
    const rec = parseArchiveHeading(line);
    if (!rec || rec.kind !== "plan") continue;
    const slug = slugOf(rec.plan);
    if (!goodSlug(slug) || live.has(slug)) continue;
    out.set(`archive/${slug}.md`, note({
      type: "archived-plan", slug, goal: oneLine(rec.goal), doc_sha: rec.doc ?? "", archive_sha: rec.archive ?? "",
    }, rec.goal || slug, source));
  }

  out.set("README.md", note({ type: "readme" },
    "This folder is generated by Craftsman; edits are overwritten. Put your own notes in ../inbox/.", "docs/plans/TRACKER.md"));
  return out;
}

function inside(base, target) {
  const rel = path.relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function walkGenerated(dir, base, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkGenerated(full, base, acc);
    else if (e.isFile() && e.name.endsWith(".md")) acc.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return acc;
}

const isGenerated = (file) => {
  try { return MARKER.test((/^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, "utf8")) || [])[1] ?? ""); } catch { return false; }
};

function assertNotesRoot(context) {
  const notes = notesRoot(context);
  const base = exportRoot(context);
  if (!inside(base, notes) || inside(inboxRoot(context), notes)) throw new Error("refusing notes root outside the export tree");
  // an existing notes/ must be a real directory, not a link out of the tree
  try {
    if (fs.lstatSync(notes).isSymbolicLink()) throw new Error("refusing symlinked notes root");
  } catch (e) { if (e.code !== "ENOENT") throw e; }
  return notes;
}

// True when file's parent directory resolves (symlinks followed) inside notes.
function realParentInside(notes, file) {
  try {
    const base = fs.realpathSync(notes);
    const parent = fs.realpathSync(path.dirname(file));
    return parent === base || inside(base, parent);
  } catch { return false; }
}

// Creates dir (under notes) one component at a time; false if any existing
// component is a symlink or not a directory.
function ensureRealDir(notes, dir) {
  const parts = path.relative(notes, dir).split(path.sep).filter(Boolean);
  let cur = notes;
  for (const part of parts) {
    cur = path.join(cur, part);
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink() || !st.isDirectory()) return false;
    } catch (e) {
      if (e.code !== "ENOENT") return false;
      fs.mkdirSync(cur);
    }
  }
  return realParentInside(notes, path.join(dir, "x"));
}

// Writes and updates notes; removes only generated files whose source is gone.
export function writeNotes(context) {
  verifiedExportDir(context);
  const notes = assertNotesRoot(context);
  const wanted = buildNotes(context);
  const result = { written: [], removed: [], skipped: [] };
  fs.mkdirSync(notes, { recursive: true });
  for (const [rel, text] of wanted) {
    const file = path.join(notes, rel);
    if (!inside(notes, file)) throw new Error(`refusing note outside notes root: ${rel}`);
    let existing = null;
    try { existing = fs.lstatSync(file); } catch { /* new */ }
    if (existing && (!existing.isFile() || !isGenerated(file))) { result.skipped.push(rel); continue; }
    if (existing && fs.readFileSync(file, "utf8") === text) continue;
    if (!ensureRealDir(notes, path.dirname(file))) { result.skipped.push(rel); continue; }
    atomicWrite(file, text);
    result.written.push(rel);
  }
  for (const rel of walkGenerated(notes, notes)) {
    if (wanted.has(rel)) continue;
    const file = path.join(notes, rel);
    if (realParentInside(notes, file) && isGenerated(file)) { fs.unlinkSync(file); result.removed.push(rel); }
  }
  return result;
}

// Removes every generated file (including README.md); foreign files stay.
export function clearNotes(context) {
  const notes = assertNotesRoot(context);
  const removed = [];
  for (const rel of walkGenerated(notes, notes)) {
    const file = path.join(notes, rel);
    if (realParentInside(notes, file) && isGenerated(file)) { fs.unlinkSync(file); removed.push(rel); }
  }
  return removed;
}

// Reads one inbox note as untrusted text (ARCH-VIEWS-14). The note moves to
// inbox/done/ only when the caller calls confirm(), after docs/ideas is written.
export function takeInboxNote(context, file) {
  const inbox = inboxRoot(context);
  let inboxReal;
  try { inboxReal = fs.realpathSync(inbox); } catch { throw new Error("inbox note refused: no inbox folder"); }
  let real;
  try { real = fs.realpathSync(path.resolve(inbox, String(file))); } catch { throw new Error("inbox note refused: not found"); }
  if (!inside(inboxReal, real)) throw new Error("inbox note refused: path escapes inbox/");
  if (inside(path.join(inboxReal, "done"), real)) throw new Error("inbox note refused: already done");
  const st = fs.statSync(real);
  if (!st.isFile()) throw new Error("inbox note refused: not a regular file");
  if (st.size > INBOX_MAX_BYTES) throw new Error(`inbox note refused: ${st.size} bytes exceeds ${INBOX_MAX_BYTES}`);
  const buf = fs.readFileSync(real);
  if (buf.length > INBOX_MAX_BYTES) throw new Error("inbox note refused: oversize");
  let moved = null;
  return {
    file: path.relative(inboxReal, real).split(path.sep).join("/"),
    text: buf.toString("utf8"),
    untrusted: true,
    confirm() {
      if (moved) return moved;
      const done = path.join(inboxReal, "done");
      fs.mkdirSync(done, { recursive: true });
      if (!inside(inboxReal, fs.realpathSync(done))) throw new Error("inbox note refused: done/ escapes inbox/");
      const base = path.basename(real);
      let dest = path.join(done, base);
      for (let n = 1; fs.existsSync(dest); n++) dest = path.join(done, `${n}-${base}`);
      fs.renameSync(real, dest);
      moved = dest;
      return dest;
    },
  };
}
