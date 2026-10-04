import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { overlaps, parseRulesDoc, checkScope, lintRules, loadRules, governingDocs, unmanagedDocs } from "./arch-check.mjs";

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
