// Every command name craftsman prints for a human to type is /craftsman:<name> (plan investigate-auto-flow-friction,
// r3a): a bare /plan or /auto is not a command in a Claude Code session. Scans string and template literals only, so
// comments, regex literals and paths such as docs/plans/, commands/plan.md or …/toggle.mjs never count.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = fs.readdirSync(path.join(ROOT, "commands")).filter((f) => f.endsWith(".md") && !f.startsWith("_")).map((f) => f.slice(0, -3));
const BARE = new RegExp(`(^|[^:\\w./-])/(${names.map((n) => n.replace(/[-]/g, "\\-")).sort((a, b) => b.length - a.length).join("|")})(?![\\w-]|\\.\\w|/)`, "g");

// Collect the text of string and template literals (template ${...} code is scanned for nested literals).
export function literals(src) {
  const out = [];
  let i = 0;
  let prev = ""; // last significant token char, to tell a regex literal from division
  const stack = []; // template-expression brace depth
  const scanString = (q) => {
    const start = ++i;
    while (i < src.length && src[i] !== q) i += src[i] === "\\" ? 2 : 1;
    out.push({ text: src.slice(start, i), line: src.slice(0, start).split("\n").length });
    i++;
  };
  const scanTemplate = () => {
    let start = ++i;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") {
        out.push({ text: src.slice(start, i), line: src.slice(0, start).split("\n").length });
        i += 2;
        stack.push(1);
        code();
        start = i;
        continue;
      }
      i++;
    }
    out.push({ text: src.slice(start, i), line: src.slice(0, start).split("\n").length });
    i++;
  };
  function code() {
    while (i < src.length) {
      const c = src[i];
      if (stack.length && c === "}") { if (--stack[stack.length - 1] === 0) { stack.pop(); i++; return; } }
      if (stack.length && c === "{") stack[stack.length - 1]++;
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2); i = i < 0 ? src.length : i + 2; continue; }
      if (c === '"' || c === "'") { scanString(c); prev = "a"; continue; }
      if (c === "`") { scanTemplate(); prev = "a"; continue; }
      if (c === "/" && (prev === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || prev === "r")) {
        i++; let cls = false;
        while (i < src.length && (src[i] !== "/" || cls) && src[i] !== "\n") { if (src[i] === "\\") i++; else if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; }
        i++; prev = "a"; continue;
      }
      if (!/\s/.test(c)) prev = /[\w$]/.test(c) ? (src.slice(Math.max(0, i - 5), i + 1).endsWith("return") ? "r" : "a") : c;
      i++;
    }
  }
  code();
  return out;
}

const files = () => {
  const list = [];
  for (const dir of ["scripts", "scripts/lib", "hooks"]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (/\.(mjs|js)$/.test(f) && !/\.test\./.test(f)) list.push(path.join(dir, f));
    }
  }
  return list;
};

test("command-prefix: no string or template literal names a craftsman command without /craftsman:", () => {
  const hits = [];
  for (const file of files()) {
    for (const lit of literals(fs.readFileSync(path.join(ROOT, file), "utf8"))) {
      for (const m of lit.text.matchAll(BARE)) hits.push(`${file}:${lit.line + lit.text.slice(0, m.index).split("\n").length - 1} — /${m[2]}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("command-prefix: the literal scanner skips comments and paths, and finds a bare command", () => {
  const found = (src) => literals(src).flatMap((l) => [...l.text.matchAll(BARE)].map((m) => m[2]));
  assert.deepEqual(found('// run /plan\nconst a = "docs/plans/x.md commands/plan.md /craftsman:plan …/toggle.mjs run /plan.";'), ["plan"]);
  assert.deepEqual(found("const re = /\\/plan/; const t = `${x} then /plan`;"), ["plan"]);
  assert.deepEqual(found('const a = "run /auto now";'), ["auto"]);
});
