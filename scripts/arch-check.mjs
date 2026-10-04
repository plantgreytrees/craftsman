#!/usr/bin/env node
// Architecture rules: parse, lint, and enforce `docs/architecture/<area>.rules.md`.
//
// Each architecture area is two files. `<area>.md` is the human reference
// (plain English, mermaid, rationale) and is never loaded by the loop.
// `<area>.rules.md` is the terse, Claude-facing contract: frontmatter naming
// the paths it `governs`, then one line per rule —
//   - **ARCH-AUTH-01** [decided] MUST ... — check: ... — cite: src/auth/x.ts:12
// States: `decided` (binding), `observed` (inferred by /architect --init,
// advisory until confirmed), `superseded by ARCH-...` (history, never citable).
//
// The enforcement point is scope activation (scope.mjs imports checkScope): a
// unit whose write allow-list touches a governed path must load that rules doc
// in `scope.docs` and cite at least one of its live rule ids in `arch`, or the
// scope never activates and pre-guard.mjs keeps every edit blocked.
//
// CLI (exit 1 on any violation):
//   arch-check.mjs lint                 validate every rules doc + its cites
//   arch-check.mjs governs <path>...    which rules docs govern these paths
//   arch-check.mjs scope < manifest     dry-run the scope.mjs check for one step
//   arch-check.mjs unmanaged            list prose under the dir with no rules pair
// `--root <dir>` overrides the project root (defaults to the current project).
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, globToRe, loadConfig, projectContext, readStdin } from "./lib/core.mjs";

export const DEFAULT_DIR = "docs/architecture";
const RULE_LINE = /^\s*-\s+\*\*(ARCH-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\*\*\s+\[([^\]]+)\]/;
const CITE = /([A-Za-z0-9_\-./]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g;

const norm = (p) => String(p).replaceAll("\\", "/").replace(/^\.\//, "");
const isGlob = (p) => /[*?{]/.test(p);
const staticPrefix = (p) => { const i = p.search(/[*?{]/); return i < 0 ? p : p.slice(0, i); };

// Does a scope entry (a path or a narrow glob) overlap a `governs` glob?
// Two globs are compared by their static prefixes — deliberately conservative:
// an over-match only ever demands a citation, never lets one slide.
export function overlaps(entry, glob) {
  const a = norm(entry);
  const b = norm(glob);
  if (!isGlob(a)) return globToRe(b).test(a);
  if (!isGlob(b)) return globToRe(a).test(b);
  const pa = staticPrefix(a);
  const pb = staticPrefix(b);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

function parseValue(raw) {
  const value = raw.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((v) => v.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, "");
}

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = parseValue(kv[2]);
  }
  return data;
}

export function parseRulesDoc(rel, text) {
  const errors = [];
  const fm = parseFrontmatter(text);
  if (!fm) errors.push(`${rel}: missing frontmatter`);
  const governs = Array.isArray(fm?.governs) ? fm.governs.map(norm) : [];
  if (!governs.length) errors.push(`${rel}: frontmatter \`governs\` must list at least one path or glob`);
  if (!fm?.area) errors.push(`${rel}: frontmatter \`area\` is required`);
  const rules = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const match = RULE_LINE.exec(line);
    if (!match) return;
    const [, id, rawState] = match;
    const state = rawState.trim();
    const superseded = /^superseded by (ARCH-[A-Z0-9-]+)$/.exec(state);
    if (!["decided", "observed"].includes(state) && !superseded) {
      errors.push(`${rel}:${index + 1}: ${id} has unknown state [${state}] (decided | observed | superseded by ARCH-...)`);
    }
    const citePart = /\bcite:\s*(.*)$/.exec(line)?.[1] || "";
    const cites = [...citePart.matchAll(CITE)].map((c) => ({ file: c[1], from: Number(c[2]), to: Number(c[3] || c[2]) }));
    rules.push({
      id,
      state: superseded ? "superseded" : state,
      supersededBy: superseded?.[1] || null,
      line: index + 1,
      cites,
    });
  });
  if (!rules.length) errors.push(`${rel}: no rule lines (\`- **ARCH-<AREA>-NN** [decided] ...\`)`);
  return { file: rel, area: fm?.area || null, governs, human: fm?.human ? norm(fm.human) : null, rules, errors };
}

export function rulesDirFor(root, cfg) {
  return path.join(root, cfg?.architecture?.dir || DEFAULT_DIR);
}

export function loadRules(root, dir = DEFAULT_DIR) {
  const absolute = path.join(root, dir);
  let names;
  try { names = fs.readdirSync(absolute); } catch { return []; }
  return names.filter((n) => n.endsWith(".rules.md")).sort().map((name) => {
    const rel = norm(path.join(dir, name));
    return parseRulesDoc(rel, fs.readFileSync(path.join(absolute, name), "utf8"));
  });
}

export function governingDocs(paths, docs) {
  return docs.filter((doc) => paths.some((p) => doc.governs.some((g) => overlaps(p, g))));
}

const citable = (rule) => rule.state === "decided" || rule.state === "observed";

// The scope.mjs gate. Returns human-readable violations; empty = allowed.
export function checkScope(scope, docs) {
  const violations = [];
  const write = (scope.scope?.write || scope.write || []).map(norm);
  const docsList = (scope.scope?.docs || scope.docs || []).map(norm);
  const arch = (scope.arch || []).map(String);
  const byId = new Map(docs.flatMap((doc) => doc.rules.map((rule) => [rule.id, { doc, rule }])));

  for (const id of arch) {
    const hit = byId.get(id);
    if (!hit) violations.push(`cites ${id}, which no ${DEFAULT_DIR}/*.rules.md defines`);
    else if (!citable(hit.rule)) violations.push(`cites ${id}, which is superseded by ${hit.rule.supersededBy}`);
  }
  for (const doc of governingDocs(write, docs)) {
    if (doc.errors.some((e) => /governs|frontmatter/.test(e))) continue; // can't govern what it can't name
    const touched = write.filter((p) => doc.governs.some((g) => overlaps(p, g)));
    if (!docsList.some((d) => d === doc.file || (isGlob(d) && globToRe(d).test(doc.file)))) {
      violations.push(`writes ${touched.join(", ")} governed by ${doc.file}, but scope.docs does not load it`);
    }
    if (!doc.rules.some((rule) => citable(rule) && arch.includes(rule.id))) {
      violations.push(`writes ${touched.join(", ")} governed by ${doc.file}, but \`arch\` cites none of its rules`);
    }
  }
  // A malformed doc can't say what it governs, so it can't be enforced — fail
  // closed rather than silently waiving every rule it holds.
  for (const doc of docs) {
    if (doc.errors.some((e) => /governs|frontmatter/.test(e))) {
      violations.push(`${doc.file} is malformed (${doc.errors[0]}) — fix it with /architect --update`);
    }
  }
  return violations;
}

function lineCount(file) {
  try { return fs.readFileSync(file, "utf8").replace(/\r?\n$/, "").split(/\r?\n/).length; } catch { return -1; }
}

// Full validation: structure, unique ids, supersession targets, human-doc
// pairing, and that every `cite: file:line` still resolves in the tree.
export function lintRules(root, docs, dir = DEFAULT_DIR) {
  const errors = docs.flatMap((doc) => doc.errors);
  const seen = new Map();
  for (const doc of docs) {
    for (const rule of doc.rules) {
      if (seen.has(rule.id)) errors.push(`${doc.file}:${rule.line}: duplicate id ${rule.id} (also ${seen.get(rule.id)})`);
      else seen.set(rule.id, `${doc.file}:${rule.line}`);
    }
  }
  for (const doc of docs) {
    for (const rule of doc.rules) {
      if (rule.supersededBy && !seen.has(rule.supersededBy)) {
        errors.push(`${doc.file}:${rule.line}: ${rule.id} is superseded by unknown ${rule.supersededBy}`);
      }
      if (rule.state === "decided" && !rule.cites.length) {
        errors.push(`${doc.file}:${rule.line}: decided rule ${rule.id} has no \`cite: file:line\``);
      }
      for (const cite of rule.cites) {
        const lines = lineCount(path.join(root, cite.file));
        if (lines < 0) errors.push(`${doc.file}:${rule.line}: ${rule.id} cites missing file ${cite.file}`);
        else if (cite.to > lines) errors.push(`${doc.file}:${rule.line}: ${rule.id} cites ${cite.file}:${cite.to}, past its ${lines} lines`);
      }
    }
    const human = doc.human || doc.file.replace(/\.rules\.md$/, ".md");
    if (!fs.existsSync(path.join(root, human))) errors.push(`${doc.file}: human doc ${human} is missing`);
  }
  for (const file of unmanagedDocs(root, docs, dir)) {
    let text = "";
    try { text = fs.readFileSync(path.join(root, file), "utf8"); } catch {}
    if (text.includes(HUMAN_BANNER)) {
      errors.push(`${file}: human doc whose ${path.basename(file).replace(/\.md$/, ".rules.md")} is missing — restore it or run /architect --update`);
    }
  }
  return errors;
}

// The opening line of every human doc /architect writes.
export const HUMAN_BANNER = "> **Human reference.**";

// Prose under the architecture dir that no rules doc pairs with — usually
// architecture writing that predates /architect. Ownership is by pair, so it is
// not an error: /sync-docs keeps maintaining it until /architect --backfill
// pairs it. Only a file still carrying HUMAN_BANNER (a pair that lost its
// rules file) fails lint.
export function unmanagedDocs(root, docs, dir = DEFAULT_DIR) {
  const paired = new Set(docs.flatMap((d) => [d.file, norm(d.human || d.file.replace(/\.rules\.md$/, ".md"))]));
  const found = [];
  const walk = (rel) => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = norm(path.join(rel, entry.name));
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".md") && !entry.name.endsWith(".rules.md")
        && !/^(README|INDEX)\.md$/i.test(entry.name) && !paired.has(child)) found.push(child);
    }
  };
  walk(dir);
  return found.sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const rootFlag = args.indexOf("--root");
  const root = rootFlag >= 0 ? path.resolve(args.splice(rootFlag, 2)[1]) : PROJECT_ROOT;
  const cfg = loadConfig({ ...projectContext("."), root });
  const dir = cfg?.architecture?.dir || DEFAULT_DIR;
  const docs = loadRules(root, dir);
  const [mode, ...rest] = args;
  let problems = [];
  if (mode === "lint") {
    problems = lintRules(root, docs, dir);
    if (!problems.length) console.log(`arch-check: ${docs.length} rules doc(s), ${docs.reduce((n, d) => n + d.rules.length, 0)} rule(s) — PASS`);
    const unmanaged = unmanagedDocs(root, docs, dir).length;
    if (unmanaged) console.log(`arch-check: ${unmanaged} unmanaged doc(s) under ${dir} (no rules pair; /sync-docs maintains them, /architect --backfill pairs them)`);
  } else if (mode === "unmanaged") {
    const unmanaged = unmanagedDocs(root, docs, dir);
    console.log(unmanaged.length ? unmanaged.join("\n") : `arch-check: no unmanaged docs under ${dir}`);
  } else if (mode === "governs") {
    const hits = governingDocs(rest, docs);
    console.log(hits.length ? hits.map((d) => d.file).join("\n") : "arch-check: no architecture rules govern these paths");
  } else if (mode === "scope") {
    let manifest;
    try { manifest = JSON.parse(await readStdin() || "{}"); } catch (e) { problems = [`manifest is not JSON: ${e.message}`]; }
    if (manifest) problems = checkScope(manifest, docs);
    if (!problems.length) console.log("arch-check: scope cites every governing rules doc — PASS");
  } else {
    problems = ["usage: arch-check.mjs lint | governs <path>... | scope < manifest.json | unmanaged  [--root <dir>]"];
  }
  if (problems.length) {
    process.stderr.write(problems.map((p) => `craftsman: ${p}`).join("\n") + "\n");
    process.exitCode = 1;
  }
}
