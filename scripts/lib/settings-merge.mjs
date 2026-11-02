// Merge, never overwrite, the sandbox settings /craftsman:init offers for a project's
// .claude/settings.json (ARCH-SAFETY-10), and find out whether the sandbox is on in any scope
// (ARCH-SAFETY-01 leaves outside-root writes, deletes and credential reads to it).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const SANDBOX_BLOCK = {
  sandbox: { enabled: true },
  permissions: { ask: ["Bash(sudo *)", "Bash(git push --force *)", "Bash(git reset --hard *)", "Bash(git clean *)"] },
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => JSON.parse(JSON.stringify(v));

function leaves(prefix, value, added) {
  if (isObject(value)) for (const [k, v] of Object.entries(value)) leaves(`${prefix}.${k}`, v, added);
  else if (Array.isArray(value)) for (const item of value) added.push(`${prefix}: ${typeof item === "string" ? item : JSON.stringify(item)}`);
  else added.push(`${prefix}: ${JSON.stringify(value)}`);
}

function merge(target, source, prefix, added, kept) {
  const out = { ...target }; // the file's own keys keep their order; new ones go at the end
  for (const [key, value] of Object.entries(source)) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (!(key in out)) { out[key] = clone(value); leaves(at, value, added); }
    else if (isObject(out[key]) && isObject(value)) out[key] = merge(out[key], value, at, added, kept);
    else if (Array.isArray(out[key]) && Array.isArray(value)) {
      out[key] = [...out[key]];
      for (const item of value) if (!out[key].some((existing) => same(existing, item))) { out[key].push(clone(item)); added.push(`${at}: ${typeof item === "string" ? item : JSON.stringify(item)}`); }
    } else if (!same(out[key], value)) kept.push(`${at} stays ${JSON.stringify(out[key])} (set in your file)`);
  }
  return out;
}

/** `currentText` is the file's text (or null). Never throws; `ok: false` means write nothing. */
export function mergeSettings(currentText, block = SANDBOX_BLOCK) {
  let current = {};
  if (currentText !== null && currentText !== undefined && String(currentText).trim() !== "") {
    try { current = JSON.parse(currentText); }
    catch (error) { return { ok: false, error: `.claude/settings.json is not valid JSON (${error.message}); fix it, then run init again` }; }
    if (!isObject(current)) return { ok: false, error: ".claude/settings.json must hold a JSON object; fix it, then run init again" };
  }
  const added = [];
  const kept = [];
  const merged = merge(current, block, "", added, kept);
  const changed = added.length > 0;
  return { ok: true, changed, added, kept, next: changed ? JSON.stringify(merged, null, 2) + "\n" : currentText ?? "" };
}

export function renderSettingsDiff(result) {
  if (!result.ok) return result.error;
  const notes = result.kept.map((line) => `= ${line}`);
  if (!result.changed) return ["nothing to add: .claude/settings.json already has the sandbox block", ...notes].join("\n");
  return ["craftsman: sandbox settings to merge into .claude/settings.json (nothing already in the file is changed):",
    ...result.added.map((line) => `+ ${line}`), ...notes].join("\n");
}

const MANAGED_DEFAULTS = ["/etc/claude-code", "/Library/Application Support/ClaudeCode", "C:\\Program Files\\ClaudeCode"];
// CRAFTSMAN_MANAGED_SETTINGS_DIR replaces the search list; it exists so tests do not read the machine's real policy.
const managedDirs = (env = process.env) => (env.CRAFTSMAN_MANAGED_SETTINGS_DIR ? [env.CRAFTSMAN_MANAGED_SETTINGS_DIR] : MANAGED_DEFAULTS);

const readSettings = (file) => {
  try { const value = JSON.parse(fs.readFileSync(file, "utf8")); return isObject(value) ? value : null; } catch { return null; }
};

const defaultUserDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");

// The settings files Claude Code merges for a project: user, project, local, then every managed file and drop-in.
function settingsFiles({ root, userDir, managed }) {
  const files = [path.join(userDir, "settings.json"), path.join(root, ".claude", "settings.json"), path.join(root, ".claude", "settings.local.json")];
  for (const dir of managed) {
    files.push(path.join(dir, "managed-settings.json"));
    try { for (const name of fs.readdirSync(path.join(dir, "managed-settings.d"))) if (name.endsWith(".json")) files.push(path.join(dir, "managed-settings.d", name)); } catch { /* no drop-ins */ }
  }
  return files;
}

/** Is `sandbox.enabled` true in the user, project, local or a managed settings file? Unreadable counts as no. */
export function sandboxEnabledAnywhere({ root = process.cwd(), userDir = defaultUserDir(), managedDirs: managed = managedDirs() } = {}) {
  return settingsFiles({ root, userDir, managed }).some((file) => readSettings(file)?.sandbox?.enabled === true);
}

/** The lower-case host of a git remote URL (https, ssh or scp-style), or null for a path, a file: URL or nothing. */
export function originHostOf(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  const text = url.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try { return new URL(text).hostname.toLowerCase() || null; } catch { return null; }
  }
  if (/^[A-Za-z]:/.test(text)) return null; // a Windows drive path (`C:\srv\r.git`), not host:path
  const scp = /^(?:[^@\s/]+@)?([A-Za-z0-9.-]+):(?!\/)\S+$/.exec(text) || /^[^@\s/]+@([A-Za-z0-9.-]+):\/\S*$/.exec(text); // `host:path`, or `user@host:/absolute/path`
  return scp ? scp[1].toLowerCase() : null;
}

const originUrl = (root) => {
  try { return execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
};

// A `*.` pattern covers its apex and subdomains: unsure which Claude Code means, an advisory stays quiet.
const domainCovers = (entry, host) => {
  const pattern = entry.trim().toLowerCase();
  if (pattern === "*" || pattern === host) return true;
  return pattern.startsWith("*.") && (host === pattern.slice(2) || host.endsWith(pattern.slice(1)));
};

// A single token that is a directory or a path glob (`src/**`, `build/`, `./out/*`) names no command. A path-spelled command
// (`/usr/local/bin/docker *`, `./gradlew build`) is a legitimate pattern: Claude Code matches the text of the call.
const isPathGlob = (entry) => { const t = entry.trim(); return !/\s/.test(t) && (t.endsWith("/") || /^(?!\/).*\/\*+$/.test(t)); };

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

/**
 * With the sandbox on, what keeps git, docker and registry calls from running inside it? Each gap is
 * `{ gap, detail }`: such a call fails sandboxed and is retried outside it, which auto mode refuses.
 * Advisory (ARCH-SAFETY-04): [] when the sandbox is off or anything cannot be read, never throws.
 * `origin` is the remote URL; left undefined it is read with `git remote get-url origin` (2 s limit).
 */
export function sandboxGaps({ root = process.cwd(), userDir = defaultUserDir(), managedDirs: managed = managedDirs(), origin } = {}) {
  try {
    const all = settingsFiles({ root, userDir, managed }).map(readSettings).filter(Boolean);
    if (!all.some((settings) => settings.sandbox?.enabled === true)) return [];
    const strings = (pick) => all.flatMap((settings) => { const value = pick(settings); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; });
    const allowed = strings((settings) => settings.sandbox?.network?.allowedDomains);
    const excluded = strings((settings) => settings.sandbox?.excludedCommands);
    const gaps = [];
    const host = originHostOf(origin === undefined ? originUrl(root) : origin);
    if (host && !allowed.some((entry) => domainCovers(entry, host))) gaps.push({ gap: "network", detail: `${host} is not in sandbox.network.allowedDomains` });
    if (COMPOSE_FILES.some((name) => fs.existsSync(path.join(root, name))) && !excluded.some((entry) => /^\s*docker\b/.test(entry))) {
      gaps.push({ gap: "docker", detail: "this project has a compose file but sandbox.excludedCommands has no docker entry (docker does not run sandboxed; an excludedCommands entry runs docker outside the sandbox)" });
    }
    for (const entry of excluded) {
      if (!entry.trim() || /,\s/.test(entry) || isPathGlob(entry)) gaps.push({ gap: "excluded-malformed", detail: `sandbox.excludedCommands entry ${JSON.stringify(entry)} is not a command pattern` });
    }
    return gaps;
  } catch { return []; }
}

/** The one SessionStart line for `sandboxGaps`, or "" when there are none. */
export function sandboxGapLine(gaps) {
  if (!Array.isArray(gaps) || !gaps.length) return "";
  return `craftsman: the Claude Code sandbox is on, but ${gaps.map((gap) => gap.detail).join("; ")}. Commands that need them fail sandboxed and get retried with dangerouslyDisableSandbox, which auto mode refuses; ask the user to add them to the sandbox settings.`;
}
