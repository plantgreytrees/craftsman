import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui-gate.mjs");
const KEY = "artist@artist-marketplace";

function sh(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

// A temp HOME, a main checkout with a base commit, and a linked worktree on a branch.
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-uigate-")));
  const home = path.join(root, "home");
  const main = path.join(root, "main");
  const wt = path.join(root, "wt");
  fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
  fs.mkdirSync(main);
  sh(main, "init", "-q", "-b", "main");
  sh(main, "config", "user.email", "t@t");
  sh(main, "config", "user.name", "t");
  fs.writeFileSync(path.join(main, "a.txt"), "a\n");
  sh(main, "add", "-A");
  sh(main, "commit", "-qm", "base");
  sh(main, "worktree", "add", "-q", "-b", "feat", wt);
  fs.writeFileSync(path.join(wt, "b.txt"), "b\n");
  sh(wt, "add", "-A");
  sh(wt, "commit", "-qm", "work");
  const f = { root, home, main, wt };
  const install = path.join(home, ".claude", "plugins", "cache", "artist");
  fs.mkdirSync(path.join(install, "scripts"), { recursive: true });
  f.install = install;
  f.stub = (body) => fs.writeFileSync(path.join(install, "scripts", "reuse-check.mjs"), body);
  f.stub(`process.exit(0);\n`);
  f.installed = (entries) => fs.writeFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: entries }));
  f.installed({ [KEY]: [{ scope: "user", installPath: install }] });
  f.settings = (where, enabled) => {
    const file = where === "user" ? path.join(home, ".claude", "settings.json")
      : path.join(main, ".claude", where === "local" ? "settings.local.json" : "settings.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ enabledPlugins: { [KEY]: enabled } }));
  };
  f.settings("user", true);
  f.design = (text = "---\nformat: 2\n---\n# Design\n") => {
    fs.mkdirSync(path.join(wt, "docs", "design"), { recursive: true });
    fs.writeFileSync(path.join(wt, "docs", "design", "DESIGN.md"), text);
  };
  f.design();
  f.run = (args = [wt, "main"], env = {}) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: wt, encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home, ...env } });
    assert.equal(r.status, 0, `always exit 0: ${r.stderr}`);
    return JSON.parse(r.stdout);
  };
  f.clean = () => fs.rmSync(root, { recursive: true, force: true });
  return f;
}

function withFixture(fn) {
  const f = fixture();
  try { return fn(f); } finally { f.clean(); }
}

test("ui-gate: happy path routes to artist with the documented shape", () => {
  withFixture((f) => {
    const out = f.run();
    assert.equal(out.route, "artist", out.reason);
    assert.equal(typeof out.reason, "string");
    assert.equal(out.reuse.exit, 0);
    assert.match(out.reuse.json, /\.craftsman[\\/]ui-gate[\\/]run-[^\\/]+[\\/]reuse\.json$/);
    assert.ok(out.reuse.json.startsWith(f.main), "run dir is under the main checkout, outside the worktree");
    assert.ok(!out.reuse.json.startsWith(f.wt));
    assert.equal(out.critic, undefined);
    assert.equal(out.a11y, true, "no verify report -> a11y floor");
    assert.ok(Array.isArray(out.steps));
  });
});

const fallbackCases = [
  ["missing installed_plugins.json", (f) => fs.rmSync(path.join(f.home, ".claude", "plugins", "installed_plugins.json")), /installed_plugins/],
  ["other marketplace", (f) => f.installed({ "artist@other-marketplace": [{ scope: "user", installPath: f.install }] }), /artist@artist-marketplace/],
  ["installPath outside plugins dir", (f) => {
    const out = path.join(f.root, "elsewhere"); fs.mkdirSync(path.join(out, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(out, "scripts", "reuse-check.mjs"), "");
    f.installed({ [KEY]: [{ scope: "user", installPath: out }] });
  }, /installPath/],
  ["disabled at local over enabled at user", (f) => f.settings("local", false), /not enabled/],
  ["no DESIGN.md", (f) => fs.rmSync(path.join(f.wt, "docs"), { recursive: true }), /DESIGN\.md/],
  ["format 1 DESIGN.md", (f) => f.design("---\nformat: 1\n---\n"), /format 2/],
];
for (const [name, mutate, re] of fallbackCases) {
  test(`ui-gate: ${name} -> fallback`, () => {
    withFixture((f) => {
      mutate(f);
      const out = f.run();
      assert.equal(out.route, "fallback");
      assert.match(out.reason, re);
      assert.equal(out.a11y, true);
      assert.equal(out.reuse, undefined);
      assert.equal(out.critic, undefined);
    });
  });
}

test("ui-gate: enabled at local over disabled at user routes to artist; project entry needs projectPath", () => {
  withFixture((f) => {
    f.settings("user", false);
    f.settings("local", true);
    assert.equal(f.run().route, "artist");
    f.installed({ [KEY]: [{ scope: "project", projectPath: path.join(f.root, "other"), installPath: f.install }] });
    assert.equal(f.run().route, "fallback");
    f.installed({ [KEY]: [{ scope: "project", projectPath: f.main, installPath: f.install }] });
    assert.equal(f.run().route, "artist");
  });
});

test("ui-gate: DESIGN.md at the worktree root is accepted", () => {
  withFixture((f) => {
    fs.rmSync(path.join(f.wt, "docs"), { recursive: true });
    fs.writeFileSync(path.join(f.wt, "DESIGN.md"), "---\nformat: 2\n---\n");
    assert.equal(f.run().route, "artist");
  });
});

test("ui-gate: reuse-check receives the documented argv; exit 1 is advisory", () => {
  withFixture((f) => {
    f.stub(`import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(path.join(f.root, "argv.json"))}, JSON.stringify(process.argv.slice(2))); fs.writeFileSync(process.argv[5] + "/reuse.json", "{}"); process.exit(1);\n`);
    const out = f.run();
    assert.equal(out.route, "artist");
    assert.equal(out.reuse.exit, 1);
    const argv = JSON.parse(fs.readFileSync(path.join(f.root, "argv.json"), "utf8"));
    const mb = sh(f.wt, "merge-base", "main", "HEAD").trim();
    assert.deepEqual(argv.slice(0, 2), ["--project", f.wt]);
    assert.equal(argv[2], "--run");
    assert.deepEqual(argv.slice(4), ["--base", mb]);
  });
});

test("ui-gate: reuse-check exit 2 or a throw falls back with the error as reason", () => {
  withFixture((f) => {
    f.stub(`process.stderr.write("boom-two"); process.exit(2);\n`);
    let out = f.run();
    assert.equal(out.route, "fallback");
    assert.match(out.reason, /boom-two/);
    f.stub(`throw new Error("kaboom");\n`);
    out = f.run();
    assert.equal(out.route, "fallback");
    assert.match(out.reason, /kaboom/);
    assert.equal(out.a11y, true);
  });
});

test("ui-gate: a bad merge-base falls back without crashing", () => {
  withFixture((f) => {
    const out = f.run([f.wt, "no-such-ref"]);
    assert.equal(out.route, "fallback");
    assert.match(out.reason, /merge-base/);
  });
});

// A report whose screenshots are real files beside it (Artist verify.mjs layout).
function report(wt, ts, body) {
  const dir = path.join(wt, ".artist", "runs", ts);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "home.png"), "png");
  fs.writeFileSync(path.join(dir, "report.json"), body ?? JSON.stringify({ screenshots: { home: "home.png" } }));
  return path.join(dir, "report.json");
}
const future = (ms) => new Date(Date.now() + 3600_000 + ms);

test("ui-gate: an untracked report.json yields critic and a11y false; newest wins", () => {
  withFixture((f) => {
    const old = report(f.wt, "20260101");
    const fresh = report(f.wt, "20260202");
    fs.utimesSync(old, future(1000), future(1000));
    fs.utimesSync(fresh, future(2000000), future(2000000));
    const out = f.run();
    assert.equal(out.route, "artist");
    assert.equal(out.critic.report, fresh);
    assert.equal(out.critic.design, path.join(f.wt, "docs", "design", "DESIGN.md"));
    assert.equal(out.critic.rubric, path.join(f.install, "skills", "create", "references", "rubric.md"));
    assert.equal(out.a11y, false);
  });
});

test("ui-gate: an ignored report.json counts; a tracked one is ignored", () => {
  withFixture((f) => {
    fs.writeFileSync(path.join(f.wt, ".gitignore"), ".artist/runs/*/report.json\n");
    const rep = report(f.wt, "r1");
    assert.equal(f.run().critic.report, rep, "ignored report is picked");
    sh(f.wt, "add", "-f", rep);
    sh(f.wt, "commit", "-qm", "track report");
    const out = f.run();
    assert.equal(out.critic, undefined);
    assert.equal(out.a11y, true);
  });
});

test("ui-gate: steps appear exactly under their conditions", () => {
  withFixture((f) => {
    const A11Y = "dispatch ui-ux-reviewer with the diff";
    const REUSE = "report reuse.json findings (advisory)";
    const has = (out, s) => out.steps.filter((x) => x.includes(s)).length;
    let out = f.run();
    assert.equal(has(out, A11Y), 1);
    assert.equal(has(out, REUSE), 1);
    assert.equal(has(out, "artist:design-critic"), 0);
    report(f.wt, "r1");
    out = f.run();
    assert.equal(has(out, A11Y), 0);
    assert.equal(has(out, REUSE), 1);
    assert.equal(has(out, "dispatch artist:design-critic once with only"), 1);
    assert.equal(has(out, "NOT ISOLATED"), 1);
    assert.equal(has(out, "never retry"), 1);
    assert.equal(has(out, "execution.builtinAgents"), 1);
    f.design("---\nformat: 1\n---\n");
    out = f.run();
    assert.deepEqual(out.steps, [A11Y]);
  });
});

test("ui-gate: usage error prints the usage line and exits 0 with route fallback", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /usage: ui-gate\.mjs <worktree> <base-ref>/);
  const out = JSON.parse(r.stdout);
  assert.equal(out.route, "fallback");
  assert.equal(out.a11y, true);
});

test("ui-gate: a missing worktree path falls back with worktree not found", () => {
  withFixture((f) => {
    const gone = path.join(f.root, "nope");
    const out = f.run([gone, "main"]);
    assert.equal(out.route, "fallback");
    assert.equal(out.reason, `worktree not found: ${gone}`);
    assert.equal(out.a11y, true);
  });
});

test("ui-gate: critic.screenshots are absolute paths from report.json, named in the step", () => {
  withFixture((f) => {
    const rep = report(f.wt, "r1", JSON.stringify({ screenshots: { home: "home.png", out: "../escape.png", gone: "missing.png" } }));
    fs.writeFileSync(path.join(path.dirname(rep), "..", "escape.png"), "x");
    const out = f.run();
    const shot = path.join(path.dirname(rep), "home.png");
    assert.deepEqual(out.critic.screenshots, [shot]);
    assert.equal(out.a11y, false);
    const step = out.steps.find((x) => x.includes("design-critic"));
    assert.ok(step.includes(shot), step);
    assert.ok(!step.includes("escape.png"));
    assert.ok(!step.includes(" screenshots,"));
  });
});

test("ui-gate: unparseable report, no screenshots key or no surviving path falls back to a11y", () => {
  withFixture((f) => {
    for (const body of ["not json", "{}", JSON.stringify({ screenshots: { a: "../x.png", b: "none.png" } })]) {
      report(f.wt, "r1", body);
      const out = f.run();
      assert.equal(out.route, "artist");
      assert.equal(out.critic, undefined, body);
      assert.equal(out.a11y, true, body);
    }
  });
});

test("ui-gate: a report older than the HEAD commit is ignored", () => {
  withFixture((f) => {
    const rep = report(f.wt, "r1");
    fs.utimesSync(rep, new Date(1000), new Date(1000));
    const out = f.run();
    assert.equal(out.critic, undefined);
    assert.equal(out.a11y, true);
  });
});

test("ui-gate: run-* dirs older than 7 days are pruned; fresh and other names stay", () => {
  withFixture((f) => {
    const parent = path.join(f.main, ".craftsman", "ui-gate");
    for (const n of ["run-old", "run-new", "keep-old"]) fs.mkdirSync(path.join(parent, n), { recursive: true });
    const old = new Date(Date.now() - 8 * 86400_000);
    fs.utimesSync(path.join(parent, "run-old"), old, old);
    fs.utimesSync(path.join(parent, "keep-old"), old, old);
    assert.equal(f.run().route, "artist");
    assert.ok(!fs.existsSync(path.join(parent, "run-old")));
    assert.ok(fs.existsSync(path.join(parent, "run-new")));
    assert.ok(fs.existsSync(path.join(parent, "keep-old")));
  });
});

test("ui-gate: CRAFTSMAN_UI_GATE_TIMEOUT_MS bounds reuse-check; odd exits fall back", () => {
  withFixture((f) => {
    f.stub(`setTimeout(() => {}, 4000);\n`);
    let out = f.run(undefined, { CRAFTSMAN_UI_GATE_TIMEOUT_MS: "200" });
    assert.equal(out.route, "fallback");
    assert.match(out.reason, /timed out/);
    f.stub(`process.exit(3);\n`);
    out = f.run();
    assert.equal(out.route, "fallback");
    f.stub(`process.kill(process.pid, "SIGKILL"); setTimeout(() => {}, 4000);\n`);
    out = f.run();
    assert.equal(out.route, "fallback");
  });
});

test("ui-gate: project tier beats user; local beats project", () => {
  withFixture((f) => {
    f.settings("user", true);
    f.settings("project", false);
    let out = f.run();
    assert.equal(out.route, "fallback");
    assert.match(out.reason, /not enabled/);
    f.settings("local", true);
    assert.equal(f.run().route, "artist");
  });
});
