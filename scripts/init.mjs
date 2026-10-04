#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDocSizes } from "./doc-size-policy.mjs";
import { DEFAULT_DIR, loadRules, unmanagedDocs } from "./arch-check.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultsPath = path.join(pluginRoot, "craftsman.config.json");
const markerDefaults = {
  "package.json": "npm test --silent", "Cargo.toml": "cargo test --quiet",
  "pyproject.toml": "pytest -q", "requirements.txt": "pytest -q",
  "go.mod": "go test ./...", "pom.xml": "mvn -q test", "build.gradle": "gradle test -q",
  "build.gradle.kts": "gradle test -q", "setup.py": "pytest -q", "Gemfile": "bundle exec rake",
  "*.sln": "dotnet test --nologo -v quiet", "*.csproj": "dotnet test --nologo -v quiet",
  "composer.json": "composer test", "mix.exs": "mix test", "pubspec.yaml": "dart test", "CMakeLists.txt": "ctest --test-dir build",
};
const qualityTools = {
  javascript: ["eslint", "prettier"], typescript: ["eslint", "prettier"], python: ["ruff"],
  go: ["gofmt", "staticcheck"], rust: ["rustfmt", "cargo"], ruby: ["rubocop"],
  java: ["google-java-format", "checkstyle"], csharp: ["dotnet"], cpp: ["clang-format", "clang-tidy"],
  php: ["php-cs-fixer", "phpstan"], shell: ["shellcheck"], elixir: ["mix"], dart: ["dart"],
  terraform: ["terraform", "tflint"], dockerfile: ["hadolint"],
  kotlin: ["ktlint"], swift: ["swiftformat", "swiftlint"], kubernetes: ["kube-linter"],
};
const claudeIgnoreStart = "# Craftsman managed .claudeignore";
const claudeIgnoreEnd = "# End Craftsman managed .claudeignore";

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

// plugin.json leaves `version` unset so installs track commits (a pinned
// version keeps every install on its cached copy until the string changes).
// The release lives in `metadata.release`; an installed copy also carries the
// commit Claude Code named its cache directory after: `2.1.0+3f2a9c1d0b4e`.
export function pluginVersion(manifest, root = pluginRoot) {
  const release = manifest?.metadata?.release || manifest?.version || null;
  const build = /^[0-9a-f]{12}$/.test(path.basename(root)) ? path.basename(root) : null;
  return release && build ? `${release}+${build}` : release || build;
}

// Rules docs vs legacy prose under the architecture dir, and the command that
// closes the gap — so `--update` tells an older project how to adopt /architect.
function architectureAudit(root) {
  let dir = DEFAULT_DIR;
  try { dir = readJson(path.join(root, "craftsman.config.json")).architecture?.dir || dir; } catch {}
  const docs = loadRules(root, dir);
  const unmanaged = unmanagedDocs(root, docs, dir);
  const hasPlans = fs.existsSync(path.join(root, "docs", "plans"));
  const next = docs.length
    ? (unmanaged.length ? "/architect --backfill <area> — pair the remaining legacy docs" : null)
    : (unmanaged.length || hasPlans ? "/architect --backfill — create rules from legacy docs, plans and code" : null);
  return { dir, rulesDocs: docs.length, unmanagedDocs: unmanaged.length, next };
}

function filesIn(root) {
  try {
    const listed = execFileSync("git", ["-C", root, "ls-files", "--others", "--cached", "--exclude-standard"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (listed.trim()) return listed.split("\n").filter(Boolean);
  } catch {}
  const result = [];
  const visit = (dir, relative, depth) => {
    if (depth > 4) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", ".craftsman", "vendor", "target"].includes(entry.name)) continue;
      const rel = path.join(relative, entry.name).split(path.sep).join("/");
      if (entry.isFile()) result.push(rel);
      else if (entry.isDirectory()) visit(path.join(dir, entry.name), rel, depth + 1);
    }
  };
  visit(root, "", 0);
  return result;
}

function markerMatches(file, marker) {
  return marker.includes("*")
    ? new RegExp(`^${marker.replaceAll(".", "\\.").replaceAll("*", ".*")}$`).test(path.basename(file))
    : path.basename(file) === marker;
}

function findMarker(files, marker) { return files.find((file) => markerMatches(file, marker)); }

function packageTest(root) {
  const file = path.join(root, "package.json");
  if (!fs.existsSync(file)) return null;
  try {
    if (!(readJson(file).scripts || {}).test) return null;
    const manager = fs.existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm"
      : fs.existsSync(path.join(root, "yarn.lock")) ? "yarn" : "npm";
    return manager === "npm" ? "npm test --silent" : `${manager} test`;
  }
  catch (error) { throw new Error(`invalid package.json: ${error.message}`); }
}

function makeTest(root) {
  const file = path.join(root, "Makefile");
  return fs.existsSync(file) && /^test\s*:/m.test(fs.readFileSync(file, "utf8")) ? "make test" : null;
}

function ciTest(root) {
  for (const file of filesIn(root).filter((entry) => /(^|\/)(\.github\/workflows|\.gitlab-ci\.yml)/.test(entry))) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const match = text.match(/(?:run|script):\s*["']?([^"'\n]+(?:test|pytest|cargo test|go test)[^"'\n]*)/i);
    if (match) return match[1].trim();
  }
  return null;
}

function commandFor(root, marker) {
  if (marker === "package.json") return packageTest(root) || markerDefaults[marker];
  return makeTest(root) || ciTest(root) || markerDefaults[marker];
}

function detectStack(root) {
  const files = filesIn(root);
  const markers = Object.keys(markerDefaults).filter((marker) => findMarker(files, marker));
  const languages = new Set();
  if (markers.includes("package.json")) {
    let packageData = {};
    try { packageData = readJson(path.join(root, "package.json")); } catch {}
    const deps = { ...(packageData.dependencies || {}), ...(packageData.devDependencies || {}) };
    languages.add(Object.keys(deps).some((name) => /typescript|ts-node/.test(name)) ? "typescript" : "javascript");
    if ("react-native" in deps || "expo" in deps) languages.add("react-native");
  }
  if (markers.some((marker) => ["pyproject.toml", "requirements.txt"].includes(marker))) languages.add("python");
  if (markers.includes("setup.py")) languages.add("python");
  if (markers.includes("go.mod")) languages.add("go");
  if (markers.includes("Cargo.toml")) languages.add("rust");
  if (markers.includes("Gemfile")) languages.add("ruby");
  if (markers.includes("pom.xml") || markers.includes("build.gradle") || markers.includes("build.gradle.kts")) languages.add("java");
  if (markers.includes("build.gradle.kts") || files.some((file) => /\.kt(s)?$/.test(file))) languages.add("kotlin");
  if (files.some((file) => /\.swift$/.test(file)) || files.includes("Package.swift") || files.includes("Podfile")) languages.add("swift");
  if (markers.some((marker) => marker.endsWith(".sln") || marker.endsWith(".csproj"))) languages.add("csharp");
  if (markers.includes("mix.exs")) languages.add("elixir");
  if (markers.includes("pubspec.yaml")) languages.add("dart");
  if (files.some((file) => /\.(c|cc|cpp|h|hpp)$/.test(file))) languages.add("cpp");
  if (files.some((file) => /\.tf(vars)?$/.test(file))) languages.add("terraform");
  if (files.some((file) => /(^|\/)Dockerfile$/.test(file))) languages.add("dockerfile");
  if (files.some((file) => /(^|\/)(k8s|kubernetes|manifests)\/.*\.ya?ml$/.test(file) || /(^|\/)charts\/.*\/templates\/.*\.ya?ml$/.test(file))) languages.add("kubernetes");
  const packageManager = files.includes("pnpm-lock.yaml") ? "pnpm"
    : files.includes("yarn.lock") ? "yarn" : files.includes("package-lock.json") ? "npm" : null;
  const ci = files.some((file) => file.startsWith(".github/workflows/") || file === ".gitlab-ci.yml");
  return { files, markers, languages: [...languages], packageManager, ci };
}

function toolAvailable(tool) {
  try { execFileSync(process.platform === "win32" ? "where" : "which", [tool], { stdio: "ignore" }); return true; }
  catch { return false; }
}

function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function removeDefaults(value, defaults) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return equal(value, defaults) ? undefined : value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    const cleaned = removeDefaults(child, defaults?.[key]);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  return Object.keys(result).length ? result : undefined;
}

export function claudeIgnorePatterns(detected) {
  const patterns = [
    ".git/", ".craftsman/", ".claude/settings.local.json", ".DS_Store",
    // Machine-generated, write-only: no command reads this back (see baseline.md /
    // sync-docs.md's explicit docs/errors/ exclusion) — pure human-visibility debt log.
    "docs/errors/KNOWN_ISSUES.md",
    "*.log", "*.tmp", "*.swp", ".env", ".env.*", "node_modules/", "**/node_modules/**",
    "coverage/", "**/coverage/**", "dist/", "**/dist/**", "build/", "**/build/**",
    "out/", "**/out/**", "tmp/", "temp/", "*.min.js", "*.map",
    ".cache/", "**/.cache/**", ".idea/", "*.pyc", "__pycache__/", "**/__pycache__/**",
  ];
  const languages = new Set(detected.languages);
  if (languages.has("javascript") || languages.has("typescript")) {
    patterns.push(".next/", ".nuxt/", ".output/", ".svelte-kit/", ".angular/", ".parcel-cache/");
  }
  if (languages.has("python")) patterns.push(".pytest_cache/", ".mypy_cache/", ".ruff_cache/", ".venv/", "venv/", "htmlcov/");
  if (languages.has("rust")) patterns.push("target/");
  if (languages.has("go")) patterns.push("bin/", "*.test");
  if (languages.has("java")) patterns.push(".gradle/", "*.class", "*.jar");
  if (languages.has("ruby")) patterns.push(".bundle/");
  if (languages.has("csharp")) patterns.push("bin/", "obj/", "TestResults/");
  if (languages.has("cpp")) patterns.push("cmake-build-*/", "CMakeFiles/", "*.o", "*.a");
  if (languages.has("react-native")) patterns.push("ios/Pods/", "ios/build/", "android/build/", "android/.gradle/", ".expo/", ".expo-shared/");
  return [...new Set(patterns)];
}

function updateClaudeIgnore(current, patterns) {
  const managed = `${claudeIgnoreStart}\n${patterns.join("\n")}\n${claudeIgnoreEnd}`;
  const block = new RegExp(`${claudeIgnoreStart}[\\s\\S]*?${claudeIgnoreEnd}`);
  if (block.test(current)) return current.replace(block, managed).replace(/\n{3,}/g, "\n\n");
  return `${current.replace(/\s*$/, "")}${current.trim() ? "\n\n" : ""}${managed}\n`;
}

function textAt(file) { return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null; }

function pluginFiles() {
  const roots = ["commands", "agents", "hooks", "scripts", "skills", "craftsman.config.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"];
  const files = [];
  const walk = (relative) => {
    const absolute = path.join(pluginRoot, relative);
    if (!fs.existsSync(absolute)) return;
    if (fs.statSync(absolute).isFile()) { files.push(relative); return; }
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".craftsman") continue;
      walk(path.join(relative, entry.name));
    }
  };
  roots.forEach(walk);
  return files.sort();
}

function pluginInventory() {
  const manifest = path.join(pluginRoot, ".claude-plugin", "plugin.json");
  const version = fs.existsSync(manifest) ? pluginVersion(readJson(manifest)) : null;
  const files = pluginFiles();
  const required = [
    "craftsman.config.json", ".claude-plugin/plugin.json", "hooks/hooks.json",
    "commands/init.md", "scripts/init.mjs", "scripts/lib/core.mjs",
  ];
  const missing = required.filter((file) => !files.includes(file));
  const syntaxErrors = [];
  const jsonErrors = [];
  for (const file of files) {
    const absolute = path.join(pluginRoot, file);
    if (/\.mjs$/.test(file)) {
      try { execFileSync(process.execPath, ["--check", absolute], { stdio: "ignore" }); }
      catch { syntaxErrors.push(file); }
    } else if (/\.json$/.test(file)) {
      try { readJson(absolute); } catch { jsonErrors.push(file); }
    }
  }
  // Oversized shipped .md is a hard-block dimension of plugin health, same
  // status as a missing file or a syntax error — not a live runtime check
  // (command/agent/skill bodies are harness-injected, not Read-tool fetched,
  // so nothing can intercept "about to load this" mid-turn), but this is the
  // mechanically-enforceable equivalent: an oversized doc fails --update.
  const sizeErrors = checkDocSizes(pluginRoot);
  return {
    root: pluginRoot, version, files, missing, syntaxErrors, jsonErrors, sizeErrors,
    healthy: !missing.length && !syntaxErrors.length && !jsonErrors.length && !sizeErrors.length,
  };
}

function trackerPlanState(root) {
  const file = path.join(root, "docs", "plans", "TRACKER.md");
  const states = new Map();
  if (!fs.existsSync(file)) return states;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const slug = line.match(/\[([^\]]+)\]\([^)]*\.md\)/)?.[1];
    const status = line.match(/\b(IN_PROGRESS|BLOCKED|PARKED|PENDING|MERGED|COMPLETE)\b/)?.[1];
    const date = line.match(/\b(20\d{2}-\d{2}-\d{2})\s*\|?\s*$/)?.[1] || "";
    if (!slug || !status) continue;
    const state = states.get(slug) || { statuses: new Set(), updated: "" };
    state.statuses.add(status);
    if (date > state.updated) state.updated = date;
    states.set(slug, state);
  }
  return states;
}

function planDocuments(root, version) {
  const directory = path.join(root, "docs", "plans");
  if (!fs.existsSync(directory)) return { files: {}, order: [], audit: [] };
  const states = trackerPlanState(root);
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "TRACKER.md")
    .map((entry) => {
      const file = path.join(directory, entry.name);
      const text = fs.readFileSync(file, "utf8");
      const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
      const slug = frontmatter?.[1].match(/^slug:\s*([^\s#]+)/m)?.[1] || path.basename(entry.name, ".md");
      const state = states.get(slug) || { statuses: new Set(), updated: "" };
      const active = [...state.statuses].some((status) => ["IN_PROGRESS", "BLOCKED", "PARKED", "PENDING"].includes(status));
      const openTasks = (text.match(/^\s*- \[ \]/gm) || []).length;
      const canonical = Boolean(frontmatter);
      let updated = text;
      if (canonical) {
        const marker = /^craftsman_version:\s*.*$/m;
        const replacement = `craftsman_version: ${version}`;
        updated = marker.test(updated)
          ? updated.replace(marker, replacement)
          : updated.replace(/^slug:.*$/m, (line) => `${line}\n${replacement}`);
      }
      return {
        file, relative: path.relative(root, file).split(path.sep).join("/"), slug,
        statuses: [...state.statuses].sort(), active, openTasks, canonical,
        updated: state.updated, changed: updated !== text, content: updated,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active)
      || Number(b.openTasks > 0) - Number(a.openTasks > 0)
      || b.updated.localeCompare(a.updated) || a.slug.localeCompare(b.slug));
  return {
    files: Object.fromEntries(entries.filter((entry) => entry.changed).map((entry) => [entry.file, entry.content])),
    order: entries.map((entry) => entry.relative),
    audit: entries.map(({ file, content, ...entry }) => entry),
  };
}

function desiredFiles(plan) {
  const { root, config } = plan;
  const files = {};
  const claudeContext = path.join(root, ".claude", "CLAUDE.md");
  const claudeIgnore = path.join(root, ".claudeignore");
  const gitignore = path.join(root, ".gitignore");
  if (!fs.existsSync(claudeContext)) {
    // Deliberately near-empty: stack detection and the workflow loop are
    // already injected fresh every session by the SessionStart hook (see
    // session-context.mjs), computed live from the repo instead of frozen
    // as prose here. Duplicating them into a static file only adds tokens
    // to every session (paid on top of the hook's line, not instead of it)
    // and risks going stale as the stack evolves. This file is yours —
    // craftsman only claims the placeholder line below, once, when absent.
    files[claudeContext] = `# ${path.basename(root)}\n\n<!-- Project-specific instructions for Claude go here. Craftsman's own workflow/stack context is injected automatically each session — no need to restate it. -->\n`;
  }
  files[claudeIgnore] = updateClaudeIgnore(textAt(claudeIgnore) || "", claudeIgnorePatterns(plan.detected));
  files[path.join(root, "craftsman.config.json")] = JSON.stringify(config, null, 2) + "\n";
  const currentGitignore = textAt(gitignore) || "";
  files[gitignore] = currentGitignore.split(/\r?\n/).includes(".craftsman/")
    ? currentGitignore
    : `${currentGitignore}${currentGitignore && !currentGitignore.endsWith("\n") ? "\n" : ""}.craftsman/\n`;
  return files;
}

function changedFiles(files) {
  return Object.entries(files).filter(([file, content]) => textAt(file) !== content).map(([file]) => file);
}

export function buildInitPlan(root, { checkTools = true, auditPlugin = false } = {}) {
  const detected = detectStack(root);
  const existingPath = path.join(root, "craftsman.config.json");
  const existing = fs.existsSync(existingPath) ? readJson(existingPath) : {};
  const config = removeDefaults(existing, readJson(defaultsPath)) || {};
  config.stopGate ||= {};
  // Declared stop-gate commands are project tuning (an empty map included): keep them verbatim. Detect only when none are declared.
  const declared = existing.stopGate?.commands;
  if (declared && typeof declared === "object" && !Array.isArray(declared)) config.stopGate.commands = { ...declared };
  else {
    config.stopGate.commands = {};
    for (const marker of detected.markers) config.stopGate.commands[marker] = commandFor(root, marker);
    if (!Object.keys(config.stopGate.commands).length) delete config.stopGate.commands;
  }
  if (!Object.keys(config.stopGate).length) delete config.stopGate;
  const tools = [...new Set([...detected.languages.flatMap((language) => qualityTools[language] || []), "gitleaks"])]
  const claudeContext = path.join(root, ".claude", "CLAUDE.md");
  const claudeIgnore = path.join(root, ".claudeignore");
  const gitignore = path.join(root, ".gitignore");
  const plan = {
    root,
    detected: { markers: detected.markers, languages: detected.languages, packageManager: detected.packageManager, ci: detected.ci },
    testCommands: Object.fromEntries(detected.markers.map((marker) => [marker, commandFor(root, marker)])),
    tools: { installed: checkTools ? tools.filter(toolAvailable) : [], missing: checkTools ? tools.filter((tool) => !toolAvailable(tool)) : tools },
    required: {
      config: { path: existingPath, present: fs.existsSync(existingPath), changed: !equal(existing, config) },
      claudeContext: { path: claudeContext, present: fs.existsSync(claudeContext) },
      claudeIgnore: { path: claudeIgnore, present: fs.existsSync(claudeIgnore) },
      gitignore: { path: gitignore, present: fs.existsSync(gitignore) && fs.readFileSync(gitignore, "utf8").split(/\r?\n/).includes(".craftsman/") },
    },
    config,
    plugin: auditPlugin ? pluginInventory() : null,
  };
  plan.files = desiredFiles(plan);
  plan.changes = changedFiles(plan.files);
  plan.ready = plan.changes.length === 0;
  return plan;
}

export function buildUpdatePlan(root, options = {}) {
  const plan = buildInitPlan(root, { ...options, auditPlugin: true });
  // Plans record the format release, not the build: a commit-tracked install must not rewrite every plan on each update.
  const plans = planDocuments(root, plan.plugin.version?.split("+")[0] ?? null);
  Object.assign(plan.files, plans.files);
  plan.changes = changedFiles(plan.files);
  plan.ready = plan.changes.length === 0;
  plan.mode = "update";
  plan.update = {
    scope: ["craftsman.config.json", ".claude/CLAUDE.md", ".claudeignore", ".gitignore"],
    pluginVersion: plan.plugin.version,
    pluginFiles: plan.plugin.files.length,
    pluginFileList: plan.plugin.files,
    pluginMissing: plan.plugin.missing,
    pluginSyntaxErrors: plan.plugin.syntaxErrors,
    pluginJsonErrors: plan.plugin.jsonErrors,
    pluginSizeErrors: plan.plugin.sizeErrors,
    pluginHealthy: plan.plugin.healthy,
    projectChanges: plan.changes,
    planOrder: plans.order,
    planAudit: plans.audit,
    planChanges: Object.keys(plans.files),
    architecture: architectureAudit(root),
  };
  return plan;
}

export function renderInitDiff(plan) {
  return plan.changes.map((file) => {
    const before = textAt(file) || "";
    const after = plan.files[file];
    return `--- ${path.relative(plan.root, file) || "."}\n+++ ${path.relative(plan.root, file) || "."}\n- ${before.replaceAll("\n", "\n- ")}\n+ ${after.replaceAll("\n", "\n+ ")}`;
  }).join("\n");
}

export function applyInitPlan(plan) {
  const backups = [];
  const originals = new Map(plan.changes.map((file) => [file, textAt(file)]));
  const backupRoot = path.join(plan.root, ".craftsman", "init-backups", new Date().toISOString().replaceAll(/[:.]/g, "-"));
  const temporary = [];
  try {
    for (const file of plan.changes) {
      if (originals.get(file) !== null) {
        const backup = path.join(backupRoot, path.relative(plan.root, file));
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(file, backup);
        backups.push(backup);
      }
    }
    for (const file of plan.changes) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.init.tmp`;
      fs.writeFileSync(temp, plan.files[file]);
      temporary.push([temp, file]);
    }
    for (const [temp, file] of temporary) fs.renameSync(temp, file);
  } catch (error) {
    for (const [temp] of temporary) fs.rmSync(temp, { force: true });
    for (const [file, original] of originals) {
      if (original === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, original);
    }
    throw new Error(`init write rolled back: ${error.message}`);
  }
  const result = buildInitPlan(plan.root, { checkTools: false });
  result.backupDir = backups.length ? backupRoot : null;
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = new Set(process.argv.slice(2));
    const modes = ["--check", "--diff", "--write", "--update"].filter((mode) => args.has(mode));
    if (modes.length > 1) throw new Error("choose only one of --check, --diff, --write, or --update");
    const mode = modes[0] ? modes[0].slice(2) : "audit";
    const plan = mode === "update" ? buildUpdatePlan(process.cwd()) : buildInitPlan(process.cwd());
    if (mode === "update" && !plan.plugin.healthy) {
      throw new Error(`plugin health check failed: ${JSON.stringify({ missing: plan.plugin.missing, syntaxErrors: plan.plugin.syntaxErrors, jsonErrors: plan.plugin.jsonErrors, sizeErrors: plan.plugin.sizeErrors })}`);
    }
    if (mode === "diff") process.stdout.write(renderInitDiff(plan) + (plan.changes.length ? "\n" : ""));
    else if (mode === "write" || mode === "update") {
      const result = applyInitPlan(plan);
      process.stdout.write(JSON.stringify({ ...result, ...(plan.update ? { update: plan.update } : {}), mode }, null, 2) + "\n");
    }
    else {
      process.stdout.write(JSON.stringify({ ...plan, mode }, null, 2) + "\n");
      if (mode === "check" && !plan.ready) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`craftsman init failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}