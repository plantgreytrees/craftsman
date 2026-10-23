import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { overlaps, parseRulesDoc, checkScope, lintRules, loadRules, governingDocs, unmanagedDocs, unitContextBytes, checkUnitContext, lintPlans, lintBudgets, DEFAULT_UNIT_CONTEXT_BYTES } from "./arch-check.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const AUTH_RULES = `---
area: auth
governs: ["src/auth/**", "src/session.ts"]
human: docs/architecture/auth.md
---
# ARCH auth — enforced rules
- **ARCH-AUTH-01** [decided] MUST verify tokens only in src/auth/verify.ts — check: grep jwt.verify — cite: src/auth/verify.ts:2
- **ARCH-AUTH-02** [observed] SHOULD keep session state server-side — cite: src/session.ts:1
- **ARCH-AUTH-03** [superseded by ARCH-AUTH-01] MAY verify in middleware
`;

function project(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-arch-"));
  // A git root: a non-git CLAUDE_PROJECT_DIR is "above a repo" and leaves craftsman off.
  spawnSync("git", ["init", "-q"], { cwd: dir });
  const all = {
    "docs/architecture/auth.rules.md": AUTH_RULES,
    "docs/architecture/auth.md": "# Auth\nhuman reference\n",
    "src/auth/verify.ts": "export function verify() {\n  return true;\n}\n",
    "src/session.ts": "export const session = {};\n",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    if (text === null) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

const manifest = (overrides = {}) => ({
  plan: "docs/plans/x.md", unit: "u1", project: ".",
  scope: { read: [], docs: [], write: ["src/auth/login.ts"] },
  ...overrides,
});

test("overlaps: concrete paths match governs globs; two globs compare static prefixes", () => {
  assert.equal(overlaps("src/auth/login.ts", "src/auth/**"), true);
  assert.equal(overlaps("./src/session.ts", "src/session.ts"), true);
  assert.equal(overlaps("src/billing/a.ts", "src/auth/**"), false);
  assert.equal(overlaps("src/auth/*.ts", "src/auth/**"), true);
  assert.equal(overlaps("src/**", "src/auth/**"), true, "a broader write glob still reaches the governed area");
  assert.equal(overlaps("tests/**", "src/auth/**"), false);
});

test("parseRulesDoc: reads governs, rule states, supersession and cites", () => {
  const doc = parseRulesDoc("docs/architecture/auth.rules.md", AUTH_RULES);
  assert.deepEqual(doc.errors, []);
  assert.deepEqual(doc.governs, ["src/auth/**", "src/session.ts"]);
  assert.deepEqual(doc.rules.map((r) => [r.id, r.state]), [
    ["ARCH-AUTH-01", "decided"], ["ARCH-AUTH-02", "observed"], ["ARCH-AUTH-03", "superseded"],
  ]);
  assert.equal(doc.rules[2].supersededBy, "ARCH-AUTH-01");
  assert.deepEqual(doc.rules[0].cites, [{ file: "src/auth/verify.ts", from: 2, to: 2 }]);
});

test("parseRulesDoc: missing governs and unknown states are errors", () => {
  const doc = parseRulesDoc("x.rules.md", "---\narea: x\n---\n- **ARCH-X-01** [maybe] something\n");
  assert.ok(doc.errors.some((e) => /governs/.test(e)));
  assert.ok(doc.errors.some((e) => /unknown state \[maybe\]/.test(e)));
});

test("checkScope: a write into a governed area must load the rules doc and cite a live rule", () => {
  const docs = [parseRulesDoc("docs/architecture/auth.rules.md", AUTH_RULES)];
  const bare = checkScope(manifest(), docs);
  assert.equal(bare.length, 2);
  assert.match(bare[0], /scope\.docs does not load it/);
  assert.match(bare[1], /cites none of its rules/);

  const good = manifest({ arch: ["ARCH-AUTH-01"], scope: { read: [], docs: ["docs/architecture/auth.rules.md"], write: ["src/auth/login.ts"] } });
  assert.deepEqual(checkScope(good, docs), []);
});

test("checkScope: superseded and invented ids never satisfy the gate", () => {
  const docs = [parseRulesDoc("docs/architecture/auth.rules.md", AUTH_RULES)];
  const scope = { read: [], docs: ["docs/architecture/auth.rules.md"], write: ["src/auth/login.ts"] };
  const superseded = checkScope(manifest({ arch: ["ARCH-AUTH-03"], scope }), docs);
  assert.ok(superseded.some((v) => /superseded by ARCH-AUTH-01/.test(v)));
  assert.ok(superseded.some((v) => /cites none of its rules/.test(v)));
  const invented = checkScope(manifest({ arch: ["ARCH-AUTH-99", "ARCH-AUTH-01"], scope }), docs);
  assert.deepEqual(invented, ["cites ARCH-AUTH-99, which no docs/architecture/*.rules.md defines"]);
});

test("checkScope: ungoverned writes pass with no citation; a malformed rules doc fails closed", () => {
  const docs = [parseRulesDoc("docs/architecture/auth.rules.md", AUTH_RULES)];
  assert.deepEqual(checkScope(manifest({ scope: { read: [], docs: [], write: ["src/billing/a.ts"] } }), docs), []);
  const broken = [...docs, parseRulesDoc("docs/architecture/data.rules.md", "no frontmatter\n- **ARCH-DATA-01** [decided] x\n")];
  const violations = checkScope(manifest({ scope: { read: [], docs: [], write: ["src/billing/a.ts"] } }), broken);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /data\.rules\.md is malformed/);
});

test("lintRules: passes a well-formed pair; catches stale cites, duplicates, missing pairs and uncited decisions", () => {
  const good = project();
  try {
    assert.deepEqual(lintRules(good, loadRules(good)), []);
  } finally { fs.rmSync(good, { recursive: true, force: true }); }

  const bad = project({
    "src/auth/verify.ts": "one line\n",
    "docs/architecture/data.md": "> **Human reference.** The loop never reads this file.\n# Data\n",
    "docs/architecture/BUILD.md": "# Build\nlegacy prose\n",
    "docs/architecture/auth.md": null,
    "docs/architecture/billing.rules.md":
      "---\narea: billing\ngoverns: [src/billing/**]\n---\n- **ARCH-AUTH-01** [decided] duplicate id, no cite\n",
  });
  try {
    const errors = lintRules(bad, loadRules(bad));
    assert.ok(errors.some((e) => /cites src\/auth\/verify\.ts:2, past its 1 lines/.test(e)), errors.join("\n"));
    assert.ok(errors.some((e) => /duplicate id ARCH-AUTH-01/.test(e)));
    assert.ok(errors.some((e) => /decided rule ARCH-AUTH-01 has no `cite/.test(e)));
    assert.ok(errors.some((e) => /human doc docs\/architecture\/auth\.md is missing/.test(e)));
    assert.ok(errors.some((e) => /data\.md: human doc whose data\.rules\.md is missing/.test(e)));
    assert.ok(!errors.some((e) => /BUILD\.md/.test(e)), "legacy prose without the banner is not a lint error");
  } finally { fs.rmSync(bad, { recursive: true, force: true }); }
});

test("5.1 lintRules fails a rules doc whose source: file is missing, naming the path", () => {
  const withSource = (src) => AUTH_RULES.replace(/^---\n/, `---\nsource: ${src}\n`);
  const bad = project({ "docs/architecture/auth.rules.md": withSource("docs/ideas/gone.md") });
  try {
    const errors = lintRules(bad, loadRules(bad));
    assert.ok(errors.some((e) => /auth\.rules\.md: source docs\/ideas\/gone\.md is missing/.test(e)), errors.join("\n"));
  } finally { fs.rmSync(bad, { recursive: true, force: true }); }
  const good = project({ "docs/architecture/auth.rules.md": withSource("docs/ideas/here.md"), "docs/ideas/here.md": "# idea\n" });
  try {
    assert.deepEqual(lintRules(good, loadRules(good)), []);
  } finally { fs.rmSync(good, { recursive: true, force: true }); }
});

test("unmanagedDocs: lists unpaired prose (nested too), never the pairs, README, or rules files", () => {
  const dir = project({
    "docs/architecture/README.md": "# Index\n",
    "docs/architecture/BUILD.md": "# Build\n",
    "docs/architecture/contracts/events.md": "# Events\n",
  });
  try {
    assert.deepEqual(unmanagedDocs(dir, loadRules(dir)),
      ["docs/architecture/BUILD.md", "docs/architecture/contracts/events.md"]);
    assert.deepEqual(lintRules(dir, loadRules(dir)), []);
    const cli = spawnSync(process.execPath, [path.join(ROOT, "arch-check.mjs"), "lint", "--root", dir], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /2 unmanaged doc\(s\)/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("governingDocs: returns only the rules docs whose area the paths touch", () => {
  const dir = project();
  try {
    const docs = loadRules(dir);
    assert.deepEqual(governingDocs(["src/session.ts"], docs).map((d) => d.file), ["docs/architecture/auth.rules.md"]);
    assert.deepEqual(governingDocs(["README.md"], docs), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function activate(dir, scopeInput) {
  return spawnSync(process.execPath, [path.join(ROOT, "scope.mjs")], {
    cwd: dir,
    input: JSON.stringify({ session_id: "s1", ...scopeInput }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

test("scope.mjs: refuses to activate a step that writes a governed area without citing it", () => {
  const dir = project();
  try {
    const refused = activate(dir, manifest());
    assert.equal(refused.status, 2, refused.stderr);
    assert.match(refused.stderr, /architecture rules not honoured by u1/);

    const allowed = activate(dir, manifest({
      arch: ["ARCH-AUTH-01"],
      scope: { read: [], docs: ["docs/architecture/auth.rules.md"], write: ["src/auth/login.ts"] },
    }));
    assert.equal(allowed.status, 0, allowed.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("scope.mjs: architecture.enforce:false switches the gate off", () => {
  const dir = project({ "craftsman.config.json": JSON.stringify({ architecture: { enforce: false } }) });
  try {
    const result = activate(dir, manifest());
    assert.equal(result.status, 0, result.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("arch-check CLI: lint and scope modes exit non-zero on violations", () => {
  const dir = project({ "src/auth/verify.ts": "x\n" });
  try {
    const run = (args, input) => spawnSync(process.execPath, [path.join(ROOT, "arch-check.mjs"), ...args, "--root", dir], {
      cwd: dir, input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
    assert.equal(run(["lint"]).status, 1);
    assert.equal(run(["scope"], JSON.stringify(manifest())).status, 1);
    const governs = run(["governs", "src/auth/a.ts"]);
    assert.equal(governs.status, 0);
    assert.match(governs.stdout, /auth\.rules\.md/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ARCH-ENGINE-08: /plan's dry-run refuses a unit too big for one fresh agent.
test("unit context: scope.read + scope.docs + task text over execution.unitContextBytes is refused", () => {
  const dir = project({ "src/big.ts": "x".repeat(4000), "src/lib/a.ts": "x".repeat(1000), "src/lib/b.ts": "x".repeat(500) });
  try {
    const step = { id: "u1", task: "t".repeat(100), scope: { read: ["src/big.ts", "src/lib/*.ts", "src/not-yet.ts"], docs: ["src/session.ts"], write: [] } };
    assert.equal(unitContextBytes(step, dir), 4000 + 1500 + "export const session = {};\n".length + 100, "globs expand, missing files count zero");
    assert.deepEqual(checkUnitContext(step, dir, 10000), []);
    assert.match(checkUnitContext(step, dir, 5000)[0], /u1 needs \d+ bytes.*over execution\.unitContextBytes 5000/);

    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ execution: { unitContextBytes: 5000 } }));
    const cli = spawnSync(process.execPath, [path.join(ROOT, "arch-check.mjs"), "scope", "--root", dir], {
      cwd: dir, input: JSON.stringify({ ...step, scope: { ...step.scope, write: ["src/other.ts"] } }), encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /unitContextBytes 5000/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Every step of the plan that introduced the check fits the default budget.
test("unit context: every step of docs/plans/autonomous-e2e-loop.md fits the default budget", () => {
  const repo = path.join(ROOT, "..");
  const plan = fs.readFileSync(path.join(repo, "docs", "plans", "autonomous-e2e-loop.md"), "utf8");
  const list = (block, key) => (new RegExp(`^\\s+${key}: \\[([^\\]]*)\\]`, "m").exec(block)?.[1] || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const steps = plan.split(/^\s+- id: /m).slice(1).map((block) => block.split("\n")[0].trim())
    .map((id, i, ids) => {
      const block = plan.split(/^\s+- id: /m)[i + 1];
      const section = plan.split(/^### Step \d+[a-z]? — /m).find((s) => s.startsWith(`${id} `)) || "";
      return { id, task: section, scope: { read: list(block, "read"), docs: list(block, "docs") } };
    });
  assert.ok(steps.length >= 10, `found ${steps.length} steps`);
  for (const step of steps) assert.ok(step.task, `step ${step.id} has task text`);
  assert.deepEqual(steps.flatMap((step) => checkUnitContext(step, repo, DEFAULT_UNIT_CONTEXT_BYTES)), []);
});

test("lint: plan-index refusals fail lint with the plan path; a clean plan set passes", () => {
  const plan = (fm) => `---\n${fm}\n---\n# plan\n`;
  const dir = project({
    "docs/plans/a.md": plan("level: epic\nparent: b"),
    "docs/plans/b.md": plan("level: epic\nparent: a"),
  });
  try {
    const errors = lintPlans(dir);
    assert.ok(errors.some((e) => /^docs\/plans\/a\.md: .*cyclic/.test(e)), errors.join("\n"));
    const cli = spawnSync(process.execPath, [path.join(ROOT, "arch-check.mjs"), "lint", "--root", dir], { encoding: "utf8" });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /docs\/plans\/a\.md: .*cyclic/);
    fs.writeFileSync(path.join(dir, "docs/plans/a.md"), plan("level: epic"));
    fs.writeFileSync(path.join(dir, "docs/plans/b.md"), plan("level: feature\nparent: a"));
    assert.deepEqual(lintPlans(dir), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("10.2 lint names the right file for a renamed slug and a duplicate slug", () => {
  const plan = (fm) => `---\n${fm}\n---\n# plan\n`;
  const dir = project({
    "docs/plans/a.md": plan("slug: renamed\nlevel: epic\nparent: ghost"),
    "docs/plans/b.md": plan("slug: other"),
  });
  try {
    const errors = lintPlans(dir);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /^docs\/plans\/a\.md: renamed: dangling parent/);
    fs.writeFileSync(path.join(dir, "docs/plans/a.md"), plan("slug: same"));
    fs.writeFileSync(path.join(dir, "docs/plans/b.md"), plan("slug: same"));
    const dup = lintPlans(dir);
    assert.equal(dup.length, 1, dup.join("\n"));
    assert.match(dup[0], /^docs\/plans\/b\.md: duplicate plan slug: same \(also docs\/plans\/a\.md\)/);
    fs.writeFileSync(path.join(dir, "docs/plans/b.md"), plan('slug: "../.."'));
    const bad = lintPlans(dir);
    assert.match(bad[0], /^docs\/plans\/b\.md: invalid plan slug/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("lint: the repo's current plans pass", () => {
  assert.deepEqual(lintPlans(path.resolve(ROOT, "..")), []);
});

test("7.1 lintRules skips the source: check only for the init and backfill sentinels", () => {
  const withSource = (src) => AUTH_RULES.replace(/^---\n/, `---\nsource: ${src}\n`);
  const run = (src) => {
    const dir = project({ "docs/architecture/auth.rules.md": withSource(src) });
    try { return lintRules(dir, loadRules(dir)); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  assert.deepEqual(run("init"), []);
  assert.deepEqual(run("backfill"), []);
  assert.ok(run("docs/ideas/gone.md").some((e) => /source docs\/ideas\/gone\.md is missing/.test(e)));
  assert.ok(run("gone").some((e) => /source gone is missing/.test(e)));
});

test("9.1 shipped config carries docs.budgets and parses", () => {
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "craftsman.config.json"), "utf8")).docs.budgets;
  // claudeMdLines and openPlans are never plugin defaults: a repo sets them in its own config, at its own size.
  assert.deepEqual(Object.keys(b).sort(), ["enforce", "planBytes", "scrutiniseBytes"]);
  assert.equal(b.enforce, true);
  assert.equal(b.planBytes, 61440);
  assert.equal(b.scrutiniseBytes, 30720);
});

test("9.2 budgets: growth fails lint, shrink passes, new files default, enforce:false only reports", () => {
  const git = (dir, ...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, encoding: "utf8" });
  const dir = project({ "docs/plans/old.md": "x".repeat(1000), "docs/plans/scrutinise-old.md": "y".repeat(500) });
  const cfg = (extra = {}) => ({ docs: { budgets: { planBytes: 2000, scrutiniseBytes: 800, enforce: true, ...extra } } });
  const write = (rel, n) => fs.writeFileSync(path.join(dir, rel), "z".repeat(n));
  try {
    git(dir, "add", "-A"); git(dir, "commit", "-qm", "base"); git(dir, "branch", "-M", "main");
    const base = git(dir, "rev-parse", "HEAD").stdout.trim();
    assert.deepEqual(lintBudgets(dir, cfg(), base).errors, []);
    write("docs/plans/old.md", 1001);
    const grown = lintBudgets(dir, cfg(), base);
    assert.match(grown.errors[0], /^docs\/plans\/old\.md: 1001 bytes exceeds its 1000-bytes? budget/);
    write("docs/plans/old.md", 900);
    assert.deepEqual(lintBudgets(dir, cfg(), base).errors, []);
    write("docs/plans/new.md", 2001);
    write("docs/plans/scrutinise-new.md", 801);
    const fresh = lintBudgets(dir, cfg(), base).errors;
    assert.equal(fresh.length, 2, fresh.join("\n"));
    write("docs/plans/new.md", 2000);
    write("docs/plans/scrutinise-new.md", 800);
    assert.deepEqual(lintBudgets(dir, cfg(), base).errors, []);
    // ratchet: a config that raises a limit above the merge-base config does not raise the cap
    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify(cfg()));
    git(dir, "add", "-A"); git(dir, "commit", "-qm", "cfg");
    const base2 = git(dir, "rev-parse", "HEAD").stdout.trim();
    write("docs/plans/new.md", 2500);
    assert.equal(lintBudgets(dir, cfg({ planBytes: 9000 }), base2).errors.length, 1, "limit cannot rise above the merge-base value");
    // enforce:false reports, CLI exits 0; enforce:true exits 1
    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify(cfg({ enforce: false })));
    const run = () => spawnSync(process.execPath, [path.join(ROOT, "arch-check.mjs"), "lint", "--root", dir], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    const quiet = run();
    assert.match(quiet.stdout, /budget docs\/plans\/old\.md: 900\/900 bytes/);
    assert.doesNotMatch(quiet.stderr, /exceeds/);
    assert.match(quiet.stdout, /report only/);
    assert.equal(lintBudgets(dir, cfg({ enforce: false }), base2).enforce, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
