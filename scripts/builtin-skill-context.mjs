#!/usr/bin/env node
// PreToolUse (Skill): when the model invokes one of Claude Code's own built-in
// review skills from inside the loop (_shared-execution.md steps 6 and 8),
// hand that skill craftsman's rules as additionalContext — the governing
// standards, the ARCH rule files, and the acceptance criteria still open — so
// the built-in does the well-maintained generic work and craftsman's rules
// still decide. Advisory only: it never blocks, and any failure is silent.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, enabled, projectContext, readStdin, acceptancePath, uncheckedAcceptance } from "./lib/core.mjs";

const WRAPPED = {
  "code-review": "Treat every finding as a candidate: craftsman's code-reviewer verdict (step 8) confirms or drops it against the docs below, and a broken `decided` ARCH rule is a REJECT even if this review missed it.",
  simplify: "Every edit must stay inside the active unit's scope manifest and keep behaviour identical — never weaken a test, an assertion, or an error path to make code shorter.",
  "security-review": "Treat every finding as a candidate: craftsman's security-auditor brief and the docs below decide severity and whether it blocks.",
};

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const skill = String(input?.tool_input?.skill || "").replace(/^\//, "");
if (!Object.hasOwn(WRAPPED, skill)) process.exit(0);

const context = projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);

function docs(dir, suffix) {
  try {
    return fs.readdirSync(path.join(context.root, dir))
      .filter((f) => f.endsWith(suffix))
      .map((f) => `${dir}/${f}`);
  } catch { return []; }
}
let open = [];
try { open = uncheckedAcceptance(fs.readFileSync(acceptancePath(context), "utf8")); } catch {}

const standards = docs("docs/standards", ".md");
const archRules = docs("docs/architecture", ".rules.md");
const lines = [
  `craftsman: built-in /${skill} is running inside the craftsman loop. ${WRAPPED[skill]}`,
  standards.length ? `Governing standards: ${standards.join(", ")}.` : "",
  archRules.length ? `ARCH rules: ${archRules.join(", ")} (\`arch-check.mjs governs <changed files>\` narrows them).` : "",
  open.length ? `Open acceptance criteria (.craftsman/acceptance.md): ${open.slice(0, 8).map((c) => c.line).join(" | ")}${open.length > 8 ? ` | …+${open.length - 8} more` : ""}` : "",
].filter(Boolean);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: lines.join("\n") },
}));
