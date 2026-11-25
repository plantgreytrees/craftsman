// ARCH-EVALS-01,02,04,05,08: the behaviour-eval suite under evals/ keeps the shape the
// rules decide — first-party `claude plugin eval` case files only, deterministic
// graders, one firing case per skill, exactly one hook case, and a documented
// run command with the cost and privacy flags. The suite itself is run by hand
// (ARCH-EVALS-06); this test only checks its structure.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DETERMINISTIC = new Set(["tool_used", "tool_order", "file_exists", "regex"]);
// Referenced by path from commands/plan.md, so it never relies on description-based firing.
const EXEMPT_SKILLS = new Set(["language-aware-planning"]);
const HOOK_TOOLS = new Set(["Read", "Glob", "Grep"]);
const RUN_FLAGS = [/--ablation none(?=[\s`]|$)/, /--max-cost-usd 5(?=[\s`]|$)/, /--no-publish(?=[\s`]|$)/];

const DQ_ESCAPES = { n: "\n", t: "\t" };
// YAML quoting: '' is a quote inside single quotes; backslash escapes apply only inside double quotes.
function unquote(v) {
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (/^".*"$/.test(v)) return v.slice(1, -1).replace(/\\(.)/g, (_, c) => DQ_ESCAPES[c] ?? c);
  return v;
}

// Flat YAML frontmatter only (key: scalar or key: [a, b]); the plugin has no YAML dependency.
// The block ends at a line that is exactly `---`, so a value containing `---` stays whole.
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const raw = kv[2].trim();
    out[kv[1]] = /^\[.*\]$/.test(raw)
      ? raw.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean)
      : unquote(raw);
  }
  return out;
}

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

// Top-level case-dir entries a case.yaml's context fields point at (add_dirs, history_file,
// scaffold_script), as a scalar, a flow list or a block list.
const CONTEXT_FIELDS = /^(\s+)(add_dirs|history_file|scaffold_script):\s*(.*)$/;
function contextEntries(caseYaml) {
  const named = new Set();
  const lines = (caseYaml || "").split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(CONTEXT_FIELDS);
    if (!m) return;
    let values = m[3].trim();
    values = /^\[.*\]$/.test(values) ? values.slice(1, -1).split(",") : values ? [values] : [];
    if (!values.length) {
      // Block form: the more-indented lines that follow, with or without a `- ` marker.
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].match(/^(\s+)(?:-\s*)?(\S.*)$/);
        if (!next || next[1].length <= m[1].length) break;
        values.push(next[2]);
      }
    }
    for (const v of values) {
      const first = unquote(v.trim()).replace(/^\.\//, "").split("/")[0];
      if (first) named.add(first);
    }
  });
  return named;
}
const dirs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

export function checkEvals(root) {
  const problems = [];
  const evalsDir = path.join(root, "evals");
  const cases = new Map();

  // ARCH-EVALS-01: evals/<case>/ holds only prompt.md, case.yaml and graders/*.md.
  for (const entry of fs.existsSync(evalsDir) ? fs.readdirSync(evalsDir, { withFileTypes: true }) : []) {
    if (entry.name === "results") continue;
    if (!entry.isDirectory()) { problems.push(`evals/${entry.name}: unexpected file outside a case directory (ARCH-EVALS-01)`); continue; }
    const caseDir = path.join(evalsDir, entry.name);
    const graders = [];
    const caseYaml = read(path.join(caseDir, "case.yaml"));
    const named = contextEntries(caseYaml);
    for (const item of fs.readdirSync(caseDir, { withFileTypes: true })) {
      if (item.isFile() && (item.name === "prompt.md" || item.name === "case.yaml")) continue;
      if (named.has(item.name) && item.name !== "graders") continue;
      if (item.isDirectory() && item.name === "graders") {
        for (const g of fs.readdirSync(path.join(caseDir, "graders"), { withFileTypes: true })) {
          if (g.isFile() && g.name.endsWith(".md")) graders.push({ file: `graders/${g.name}`, fm: frontmatter(fs.readFileSync(path.join(caseDir, "graders", g.name), "utf8")) || {} });
          else problems.push(`evals/${entry.name}/graders/${g.name}: unexpected file; graders are graders/*.md only (ARCH-EVALS-01)`);
        }
        continue;
      }
      problems.push(`evals/${entry.name}/${item.name}: unexpected file; a case holds prompt.md, case.yaml and graders/*.md only (ARCH-EVALS-01)`);
    }
    if (caseYaml && /^graders\s*:/m.test(caseYaml)) problems.push(`evals/${entry.name}/case.yaml: carries a graders: key; graders live in graders/*.md (ARCH-EVALS-01)`);
    const prompt = read(path.join(caseDir, "prompt.md"));
    if (!prompt) problems.push(`evals/${entry.name}: missing prompt.md (ARCH-EVALS-01)`);
    if (!graders.length) problems.push(`evals/${entry.name}: no graders/*.md grader (ARCH-EVALS-01)`);
    const fm = (prompt && frontmatter(prompt)) || {};
    if (String(fm.runs) !== "3") problems.push(`evals/${entry.name}: runs must be 3, the sample ARCH-EVALS-09's "2 of 3 runs" reads (found ${fm.runs ?? "none"})`);
    // ARCH-EVALS-02: deterministic grader types only.
    for (const g of graders) {
      if (!DETERMINISTIC.has(g.fm.type)) problems.push(`evals/${entry.name}/${g.file}: grader type ${g.fm.type ?? "missing"} is not deterministic (ARCH-EVALS-02)`);
    }
    cases.set(entry.name, { fm, graders });
  }

  const plugin = JSON.parse(read(path.join(root, ".claude-plugin", "plugin.json")) || "{}");
  for (const key of ["experimental", "dependencies"]) {
    if (key in plugin) problems.push(`.claude-plugin/plugin.json: has a ${key} key (ARCH-EVALS-01)`);
  }

  // ARCH-EVALS-08: one skill-fires-<name> case per skills/ directory except the exempt one.
  const required = new Set(dirs(path.join(root, "skills")).filter((d) => !EXEMPT_SKILLS.has(d)));
  const expected = new Set();
  for (const skill of required) {
    const name = `skill-fires-${skill}`;
    expected.add(name);
    const c = cases.get(name);
    if (!c) { problems.push(`evals/${name}: missing firing case for skill ${skill} (ARCH-EVALS-08)`); continue; }
    const fires = c.graders.some(({ fm }) => {
      if (fm.type !== "tool_used" || fm.tool !== "Skill" || !fm.input_match) return false;
      // It must match this skill's call and no other required skill's, or a wrong skill would score.
      try {
        const re = new RegExp(fm.input_match);
        const call = (s) => `{"skill":"craftsman:${s}"}`;
        return re.test(call(skill)) && [...required].every((other) => other === skill || !re.test(call(other)));
      } catch { return false; }
    });
    if (!fires) problems.push(`evals/${name}: no tool_used grader on Skill whose input_match matches ${skill} (ARCH-EVALS-08)`);
  }

  // ARCH-EVALS-04: exactly one hook case, read-only grants, regex on the guards line.
  const hooks = [...cases].filter(([, c]) => [].concat(c.fm.tags || []).includes("hook"));
  if (hooks.length !== 1) problems.push(`evals/: ${hooks.length} cases tagged hook; exactly one is allowed (ARCH-EVALS-04)`);
  for (const [name, c] of hooks) {
    expected.add(name);
    const extra = [].concat(c.fm.allowed_tools || []).filter((t) => !HOOK_TOOLS.has(t));
    if (extra.length) problems.push(`evals/${name}: hook case grants ${extra.join(", ")} beyond the read-only set (ARCH-EVALS-04)`);
    const quotes = c.graders.some(({ fm }) => fm.type === "regex" && (fm.target ?? "last_message") === "last_message" && String(fm.pattern || "").includes("craftsman guards:"));
    if (!quotes) problems.push(`evals/${name}: no regex grader on last_message for the "craftsman guards:" line (ARCH-EVALS-04)`);
  }
  for (const name of cases.keys()) {
    if (!expected.has(name)) problems.push(`evals/${name}: not a case ARCH-EVALS-08 or ARCH-EVALS-04 names`);
  }

  // ARCH-EVALS-05: results git-ignored; every documented suite run carries the three flags.
  const ignore = (read(path.join(root, ".gitignore")) || "").split(/\r?\n/).map((l) => l.trim());
  if (!ignore.includes("evals/results/")) problems.push(".gitignore: missing the evals/results/ line (ARCH-EVALS-05)");
  const runs = (read(path.join(root, "README.md")) || "").split(/\r?\n/).filter((l) => /claude plugin eval \.(?=[\s`]|$)/.test(l));
  if (!runs.length) problems.push("README.md: no documented `claude plugin eval .` run command (ARCH-EVALS-05)");
  for (const line of runs) {
    const missing = RUN_FLAGS.filter((re) => !re.test(line));
    if (missing.length) problems.push(`README.md: run command lacks ${missing.map((re) => re.source.split("(?=")[0]).join(", ")}: ${line.trim()} (ARCH-EVALS-05)`);
  }

  // ARCH-EVALS-06: never a CI gate.
  const workflows = path.join(root, ".github", "workflows");
  for (const f of fs.existsSync(workflows) ? fs.readdirSync(workflows, { withFileTypes: true }) : []) {
    if (f.isFile() && /plugin eval/.test(read(path.join(workflows, f.name)) || "")) problems.push(`.github/workflows/${f.name}: runs plugin eval; evals are never a CI gate (ARCH-EVALS-06)`);
  }
  return problems;
}

// ---------- fixtures ----------

// Synthetic skills plus deep-research; never a loop-discipline skill, so removing one leaves no trace (ARCH-EVALS-10).
const FIXTURE_SKILLS = ["deep-research", "alpha-skill", "beta-skill"];

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function validFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-evals-"));
  write(root, ".claude-plugin/plugin.json", JSON.stringify({ name: "craftsman" }));
  write(root, ".gitignore", "node_modules/\nevals/results/\n");
  write(root, "README.md", "Run:\n\n    claude plugin eval . --ablation none --max-cost-usd 5 --no-publish\n");
  for (const s of [...FIXTURE_SKILLS, ...EXEMPT_SKILLS]) write(root, `skills/${s}/SKILL.md`, "---\nname: x\n---\n");
  write(root, "evals/hook-guards-line/prompt.md", "---\nname: hook-guards-line\ntags: [hook]\nruns: 3\nallowed_tools: []\n---\nQuote it.\n");
  write(root, "evals/hook-guards-line/graders/guards-line.md", '---\ntype: regex\ntarget: last_message\npattern: "craftsman guards: on\\\\."\n---\n');
  for (const s of FIXTURE_SKILLS) skillCase(root, s);
  return root;
}

function skillCase(root, skill) {
  write(root, `evals/skill-fires-${skill}/prompt.md`, `---\nname: skill-fires-${skill}\nruns: 3\nallowed_tools: [Skill]\n---\nDo the task.\n`);
  write(root, `evals/skill-fires-${skill}/graders/skill-fired.md`, `---\ntype: tool_used\ntool: Skill\ninput_match: '"skill"\\s*:\\s*"(?:[\\w-]+:)?${skill}"'\n---\n`);
}

function problemsAfter(mutate) {
  const root = validFixture();
  try { mutate(root); return checkEvals(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function assertCaught(mutate, pattern) {
  const problems = problemsAfter(mutate);
  assert.ok(problems.some((p) => pattern.test(p)), `expected ${pattern} in:\n${problems.join("\n") || "(no problems)"}`);
}

// ---------- the real suite ----------

test("evals/: the shipped suite satisfies ARCH-EVALS-01..06", () => {
  assert.deepEqual(checkEvals(ROOT), []);
});

test("evals/: the reference fixture is clean, and a local results dir is ignored", () => {
  assert.deepEqual(problemsAfter(() => {}), []);
  assert.deepEqual(problemsAfter((r) => write(r, "evals/results/2026-11-24/report.html", "<html>")), []);
});

// ---------- ARCH-EVALS-01 ----------

test("ARCH-EVALS-01: a stray file in a case or loose in evals/ fails", () => {
  assertCaught((r) => write(r, "evals/hook-guards-line/notes.txt", "x"), /notes\.txt: unexpected file.*ARCH-EVALS-01/);
  assertCaught((r) => write(r, "evals/hook-guards-line/graders/check.js", "x"), /check\.js: unexpected file.*ARCH-EVALS-01/);
  assertCaught((r) => write(r, "evals/README.md", "x"), /evals\/README\.md: unexpected file.*ARCH-EVALS-01/);
});

test("ARCH-EVALS-01: case.yaml may carry context but not graders", () => {
  assert.deepEqual(problemsAfter((r) => write(r, "evals/hook-guards-line/case.yaml", 'schema_version: "1.1"\nname: hook-guards-line\ncontext:\n  add_dirs: [fixtures]\n')), []);
  assertCaught((r) => write(r, "evals/hook-guards-line/case.yaml", "name: hook-guards-line\ngraders:\n  - type: regex\n"), /case\.yaml: carries a graders: key/);
});

test("ARCH-EVALS-01: files a case.yaml context field names may sit in the case dir; unnamed ones may not", () => {
  const yaml = 'schema_version: "1.1"\nname: hook-guards-line\ncontext:\n  add_dirs: [fixtures]\n  history_file: history.jsonl\n  scaffold_script:\n    setup.sh\n';
  assert.deepEqual(problemsAfter((r) => {
    write(r, "evals/hook-guards-line/case.yaml", yaml);
    write(r, "evals/hook-guards-line/fixtures/data.txt", "x");
    write(r, "evals/hook-guards-line/history.jsonl", "{}");
    write(r, "evals/hook-guards-line/setup.sh", "true");
  }), []);
  assert.deepEqual(problemsAfter((r) => {
    write(r, "evals/hook-guards-line/case.yaml", 'name: x\ncontext:\n  add_dirs:\n    - fixtures/a\n    - more\n');
    write(r, "evals/hook-guards-line/fixtures/a/data.txt", "x");
    write(r, "evals/hook-guards-line/more/data.txt", "x");
  }), []);
  assertCaught((r) => {
    write(r, "evals/hook-guards-line/case.yaml", yaml);
    write(r, "evals/hook-guards-line/other/data.txt", "x");
  }, /hook-guards-line\/other: unexpected file/);
});

test("frontmatter: the block ends only at a whole --- line, and double quotes unescape", () => {
  assert.deepEqual(frontmatter("---\nname: a---b\nruns: 3\n---\nbody ---\n"), { name: "a---b", runs: "3" });
  assert.deepEqual(frontmatter('---\nm: "a\\\\sb\\"c"\n---\n'), { m: 'a\\sb"c' });
  assert.deepEqual(problemsAfter((r) => write(r, "evals/skill-fires-deep-research/prompt.md", "---\nname: a---b\nruns: 3\nallowed_tools: [Skill]\n---\n")), []);
  assert.deepEqual(problemsAfter((r) => write(r, "evals/skill-fires-deep-research/graders/skill-fired.md",
    '---\ntype: tool_used\ntool: Skill\ninput_match: "\\"skill\\"\\\\s*:\\\\s*\\"(?:[\\\\w-]+:)?deep-research\\""\n---\n')), []);
});

test("ARCH-EVALS-01: a case needs prompt.md and a grader", () => {
  assertCaught((r) => fs.rmSync(path.join(r, "evals/hook-guards-line/prompt.md")), /hook-guards-line: missing prompt\.md/);
  assertCaught((r) => fs.rmSync(path.join(r, "evals/hook-guards-line/graders"), { recursive: true }), /hook-guards-line: no graders/);
});

test("ARCH-EVALS-01: plugin.json declares no experimental or dependencies key", () => {
  assertCaught((r) => write(r, ".claude-plugin/plugin.json", JSON.stringify({ experimental: { evals: "x" } })), /plugin\.json: has a experimental key/);
  assertCaught((r) => write(r, ".claude-plugin/plugin.json", JSON.stringify({ dependencies: [] })), /plugin\.json: has a dependencies key/);
});

test("every case runs 3 times", () => {
  assertCaught((r) => write(r, "evals/skill-fires-deep-research/prompt.md", "---\nname: x\nruns: 1\nallowed_tools: [Skill]\n---\n"), /skill-fires-deep-research: runs must be 3/);
});

// ---------- ARCH-EVALS-02 ----------

test("ARCH-EVALS-02: llm, baseline or untyped graders fail", () => {
  for (const type of ["llm", "baseline"]) {
    assertCaught((r) => write(r, "evals/hook-guards-line/graders/judge.md", `---\ntype: ${type}\n---\nRubric.\n`), new RegExp(`judge\\.md: grader type ${type} is not deterministic`));
  }
  assertCaught((r) => write(r, "evals/hook-guards-line/graders/judge.md", "no frontmatter\n"), /judge\.md: grader type missing/);
});

// ---------- ARCH-EVALS-08 ----------

test("ARCH-EVALS-08: each skill needs its firing case", () => {
  for (const s of FIXTURE_SKILLS) {
    assertCaught((r) => fs.rmSync(path.join(r, `evals/skill-fires-${s}`), { recursive: true }), new RegExp(`skill-fires-${s}: missing firing case`));
  }
});

test("ARCH-EVALS-08: a skill added later needs a case; the exempt planner skill does not", () => {
  assertCaught((r) => write(r, "skills/new-skill/SKILL.md", "---\nname: new-skill\n---\n"), /skill-fires-new-skill: missing firing case/);
  assert.deepEqual(problemsAfter((r) => { write(r, "skills/new-skill/SKILL.md", "x"); skillCase(r, "new-skill"); }), []);
  assert.ok(!problemsAfter(() => {}).some((p) => /language-aware-planning/.test(p)));
});

test("ARCH-EVALS-08/10: a skill removed with its case leaves the suite clean", () => {
  assert.deepEqual(problemsAfter((r) => {
    fs.rmSync(path.join(r, "skills/deep-research"), { recursive: true });
    fs.rmSync(path.join(r, "evals/skill-fires-deep-research"), { recursive: true });
  }), []);
});

test("ARCH-EVALS-08: the firing grader must be tool_used on Skill matching the skill", () => {
  const grader = "evals/skill-fires-deep-research/graders/skill-fired.md";
  assertCaught((r) => write(r, grader, "---\ntype: tool_used\ntool: Bash\ninput_match: deep-research\n---\n"), /skill-fires-deep-research: no tool_used grader on Skill/);
  assertCaught((r) => write(r, grader, "---\ntype: tool_used\ntool: Skill\ninput_match: alpha-skill\n---\n"), /skill-fires-deep-research: no tool_used grader on Skill/);
  assertCaught((r) => write(r, grader, "---\ntype: regex\npattern: deep-research\n---\n"), /skill-fires-deep-research: no tool_used grader on Skill/);
  for (const loose of [".*", '"skill"', "research|skill"]) {
    assertCaught((r) => write(r, grader, `---\ntype: tool_used\ntool: Skill\ninput_match: '${loose}'\n---\n`), /skill-fires-deep-research: no tool_used grader on Skill/);
  }
});

test("ARCH-EVALS-08/04: evals/ holds only the cases the rules name", () => {
  assertCaught((r) => skillCase(r, "orchestrate"), /skill-fires-orchestrate: not a case ARCH-EVALS-08 or ARCH-EVALS-04 names/);
});

// ---------- ARCH-EVALS-04 ----------

test("ARCH-EVALS-04: exactly one hook case", () => {
  assertCaught((r) => write(r, "evals/hook-guards-line/prompt.md", "---\nname: x\nruns: 3\n---\n"), /0 cases tagged hook/);
  assertCaught((r) => write(r, "evals/skill-fires-deep-research/prompt.md", "---\nname: x\ntags: [hook, skill]\nruns: 3\nallowed_tools: [Skill]\n---\n"), /2 cases tagged hook/);
});

test("ARCH-EVALS-04: the hook case grants no tool beyond the read-only set", () => {
  assertCaught((r) => write(r, "evals/hook-guards-line/prompt.md", "---\nname: x\ntags: [hook]\nruns: 3\nallowed_tools: [Read, Bash]\n---\n"), /hook-guards-line: hook case grants Bash/);
});

test("ARCH-EVALS-04: the hook case greps the guards line in the final message", () => {
  const grader = "evals/hook-guards-line/graders/guards-line.md";
  assertCaught((r) => write(r, grader, '---\ntype: regex\ntarget: trace\npattern: "craftsman guards: on"\n---\n'), /hook-guards-line: no regex grader on last_message/);
  assertCaught((r) => write(r, grader, '---\ntype: regex\npattern: "guards"\n---\n'), /hook-guards-line: no regex grader on last_message/);
});

// ---------- ARCH-EVALS-05 / 06 ----------

test("ARCH-EVALS-05: .gitignore lists evals/results/", () => {
  assertCaught((r) => write(r, ".gitignore", "node_modules/\nevals/\n"), /\.gitignore: missing the evals\/results\/ line/);
});

test("ARCH-EVALS-05: the README run command carries all three flags", () => {
  assertCaught((r) => write(r, "README.md", "nothing here\n"), /README\.md: no documented/);
  for (const [flag, re] of [["--ablation none", /lacks --ablation none/], ["--max-cost-usd 5", /lacks --max-cost-usd 5/], ["--no-publish", /lacks --no-publish/]]) {
    const cmd = "claude plugin eval . --ablation none --max-cost-usd 5 --no-publish".replace(` ${flag}`, "");
    assertCaught((r) => write(r, "README.md", `    ${cmd}\n`), re);
  }
  assertCaught((r) => write(r, "README.md", "    claude plugin eval . --ablation none --max-cost-usd 50 --no-publish\n"), /lacks --max-cost-usd 5/);
});

test("ARCH-EVALS-06: no CI workflow runs plugin eval", () => {
  assertCaught((r) => write(r, ".github/workflows/ci.yml", "steps:\n  - run: claude plugin eval .\n"), /ci\.yml: runs plugin eval/);
  assert.deepEqual(problemsAfter((r) => write(r, ".github/workflows/shared/notes.md", "x")), []);
});
