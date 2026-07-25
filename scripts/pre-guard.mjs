#!/usr/bin/env node
// PreToolUse (Write|Edit|MultiEdit|NotebookEdit): two deterministic checks in a
// SINGLE process (one Node spawn per edit) —
//   1. hard-block edits to protected / generated / lock / secret paths
//   2. enforce that only /plan, /orchestrate, /sync-docs may edit docs/
// Doc authority is SESSION-SCOPED: each session holds its own grant, so
// concurrent sessions never block or leak into one another.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, enabled, globToRe, STATE_DIR, sidOf, sessionDir, logEvent, readStdin } from "./lib/core.mjs";

const cfg = loadConfig();
if (!enabled(cfg)) process.exit(0);

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const file = input?.tool_input?.file_path;
if (!file) process.exit(0);
const rel = path.relative(process.cwd(), file).split(path.sep).join("/");

// 1) Protected paths — generated / vendored / lock / secret.
const hit = (cfg.protectedPaths || []).find((p) => globToRe(p).test(rel));
if (hit) {
  logEvent({ ev: "preguard", file: rel, pattern: hit, result: "blocked" });
  process.stderr.write(
    `craftsman: ${rel} is a protected path (matches "${hit}") — generated, vendored, ` +
    `lock, or secret file. Do not edit it directly. Change the source that generates it, ` +
    `or ask the user to make this change themselves.\n`
  );
  process.exit(2);
}

// 2) Doc-write authority — session-scoped.
const g = cfg.docWriteGuard || {};
if (g.enabled !== false) {
  const docPaths = g.docPaths || ["docs/**"];
  const isDoc = docPaths.some((p) => globToRe(p).test(rel) || globToRe(p).test("./" + rel));
  if (isDoc) {
    const sid = sidOf(input);
    const marker = path.join(sessionDir(sid), "doc-write");   // this session's own authority
    const pending = path.join(STATE_DIR, "doc-write-pending"); // grant dropped by doc-write.mjs
    const ttl = g.ttlMs ?? 3600000;
    const pendingTtl = g.pendingTtlMs ?? 1800000;
    let ok = false;

    // (a) this session already holds authority (refresh keeps long runs alive)
    try { if (Date.now() - fs.statSync(marker).mtimeMs < ttl) ok = true; } catch {}

    // (b) else CLAIM a fresh grant set by /plan|/orchestrate|/sync-docs. The grant
    //     is NOT consumed (so multiple concurrent writer sessions can each claim
    //     their own per-session marker); it simply expires by pendingTtl.
    if (!ok) {
      try {
        if (Date.now() - fs.statSync(pending).mtimeMs < pendingTtl) {
          fs.mkdirSync(sessionDir(sid), { recursive: true });
          fs.writeFileSync(marker, `claimed ${new Date().toISOString()}\n`);
          ok = true;
        }
      } catch {}
    }

    if (ok) {
      try { const now = new Date(); fs.utimesSync(marker, now, now); } catch {} // keep alive for long writer commands
    } else {
      logEvent({ ev: "docguard", file: rel, sid, result: "blocked" });
      process.stderr.write(
        `craftsman: "${rel}" is under docs/ — only /plan, /orchestrate and /sync-docs may edit docs. ` +
        `Do NOT write it directly. Hand the change to /plan (it persists plan docs + tracker rows) or ` +
        `/sync-docs (architecture/standards). If you ARE running one of those three commands, first run:  ` +
        `node "\${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on\n`
      );
      process.exit(2);
    }
  }
}

process.exit(0);
