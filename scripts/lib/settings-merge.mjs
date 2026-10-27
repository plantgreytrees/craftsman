// Merge, never overwrite, the sandbox settings /craftsman:init offers for a project's
// .claude/settings.json (ARCH-SAFETY-10), and find out whether the sandbox is on in any scope
// (ARCH-SAFETY-01 leaves outside-root writes, deletes and credential reads to it).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

function sandboxOn(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8"))?.sandbox?.enabled === true; } catch { return false; }
}

/** Is `sandbox.enabled` true in the user, project, local or a managed settings file? Unreadable counts as no. */
export function sandboxEnabledAnywhere({ root = process.cwd(), userDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), managedDirs: managed = managedDirs() } = {}) {
  const files = [path.join(userDir, "settings.json"), path.join(root, ".claude", "settings.json"), path.join(root, ".claude", "settings.local.json")];
  for (const dir of managed) {
    files.push(path.join(dir, "managed-settings.json"));
    try { for (const name of fs.readdirSync(path.join(dir, "managed-settings.d"))) if (name.endsWith(".json")) files.push(path.join(dir, "managed-settings.d", name)); } catch { /* no drop-ins */ }
  }
  return files.some(sandboxOn);
}
