#!/usr/bin/env node
// Warn-only CI report: scripts/**/*.mjs byte delta against the PR base (ARCH-SLIM-07). Always exits 0.
import { execFileSync } from "node:child_process";

const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const size = (ref) =>
  git("ls-tree", "-r", "-l", ref, "--", "scripts")
    .split("\n")
    .reduce((t, l) => {
      const [meta, path] = l.split("\t");
      return path?.endsWith(".mjs") ? t + Number(meta.trim().split(/\s+/)[3]) : t;
    }, 0);
const has = (ref) => { try { git("cat-file", "-e", `${ref}^{commit}`); return true; } catch { return false; } };

try {
  const base = process.argv[2];
  if (!base) throw new Error("no base sha given");
  if (!has(base)) {
    try { execFileSync("git", ["fetch", "--depth=1", "origin", base], { stdio: "ignore", timeout: 60000 }); } catch { /* handled below */ }
  }
  if (!has(base)) {
    console.log(`::notice::script size delta skipped: base ${base} unavailable`);
  } else {
    const b = size(base), h = size("HEAD"), d = h - b;
    console.log(`scripts/**/*.mjs bytes: base ${b}, head ${h}, delta ${d}`);
    if (d > 0) console.log(`::warning::scripts/**/*.mjs grew by ${d} bytes against base`);
  }
} catch (e) {
  console.log(`::notice::script size delta skipped: ${String(e.message).split("\n")[0]}`);
}
process.exit(0);
