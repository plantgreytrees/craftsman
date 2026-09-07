#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
};
const claudeIgnoreStart = "# Craftsman managed .claudeignore";
const claudeIgnoreEnd = "# End Craftsman managed .claudeignore";

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

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
  }
  if (markers.some((marker) => ["pyproject.toml", "requirements.txt"].includes(marker))) languages.add("python");
  if (markers.includes("setup.py")) languages.add("python");
  if (markers.includes("go.mod")) languages.add("go");
  if (markers.includes("Cargo.toml")) languages.add("rust");
  if (markers.includes("Gemfile")) languages.add("ruby");
  if (markers.includes("pom.xml") || markers.includes("build.gradle") || markers.includes("build.gradle.kts")) languages.add("java");
  if (markers.some((marker) => marker.endsWith(".sln") || marker.endsWith(".csproj"))) languages.add("csharp");
  if (markers.includes("mix.exs")) languages.add("elixir");
  if (markers.includes("pubspec.yaml")) languages.add("dart");
  if (files.some((file) => /\.(c|cc|cpp|h|hpp)$/.test(file))) languages.add("cpp");
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
  return [...new Set(patterns)];
}

function updateClaudeIgnore(current, patterns) {
  const managed = `${claudeIgnoreStart}\n${patterns.join("\n")}\n${claudeIgnoreEnd}`;
  const block = new RegExp(`${claudeIgnoreStart}[\\s\\S]*?${claudeIgnoreEnd}`);
  if (block.test(current)) return current.replace(block, managed).replace(/\n{3,}/g, "\n\n");
  return `${current.replace(/\s*$/, "")}${current.trim() ? "\n\n" : ""}${managed}\n`;
}

function textAt(file) { return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null; }

function desiredFiles(plan) {
  const { root, config } = plan;
  const files = {};
  const claudeContext = path.join(root, ".claude", "CLAUDE.md");
  const claudeIgnore = path.join(root, ".claudeignore");
  const gitignore = path.join(root, ".gitignore");
  if (!fs.existsSync(claudeContext)) {
    const stack = plan.detected.languages.join(", ") || "undetected stack";
    files[claudeContext] = `# ${path.basename(root)}\n\nStack: ${stack}. Use the craftsman workflow: UNDERSTAND -> PLAN -> EXECUTE -> SCRUTINISE -> SYNC-DOCS. Plans live in \`docs/plans/\`.\n`;
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

export function buildInitPlan(root, { checkTools = true } = {}) {
  const detected = detectStack(root);
  const existingPath = path.join(root, "craftsman.config.json");
  const existing = fs.existsSync(existingPath) ? readJson(existingPath) : {};
  const config = removeDefaults(existing, readJson(defaultsPath)) || {};
  config.stopGate ||= {};
  config.stopGate.commands ||= {};
  for (const marker of detected.markers) config.stopGate.commands[marker] = commandFor(root, marker);
  if (!Object.keys(config.stopGate.commands).length) delete config.stopGate.commands;
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
  };
  plan.files = desiredFiles(plan);
  plan.changes = changedFiles(plan.files);
  plan.ready = plan.changes.length === 0;
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
    const modes = ["--check", "--diff", "--write"].filter((mode) => args.has(mode));
    if (modes.length > 1) throw new Error("choose only one of --check, --diff, or --write");
    const mode = modes[0] ? modes[0].slice(2) : "audit";
    const plan = buildInitPlan(process.cwd());
    if (mode === "diff") process.stdout.write(renderInitDiff(plan) + (plan.changes.length ? "\n" : ""));
    else if (mode === "write") process.stdout.write(JSON.stringify({ ...applyInitPlan(plan), mode }, null, 2) + "\n");
    else {
      process.stdout.write(JSON.stringify({ ...plan, mode }, null, 2) + "\n");
      if (mode === "check" && !plan.ready) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`craftsman init failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}