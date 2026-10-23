// ARCH-STATE-14 / ARCH-STATE-13 / ARCH-LAND-23: heredoc prose is not a hook-bypass flag unless the heredoc feeds a
// shell or interpreter; the removal-word refusal stays fail-closed; a lease push to the run's own branch is allowed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { forceBlocked, ownBranchesOf } from "./lib/force-block.mjs";

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), "pre-guard.mjs");
const BYPASS = "--no-" + "verify"; // spelled in two parts so this file never trips the hook-bypass check itself
const FORCE = "--for" + "ce"; // likewise for the force block

function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-narrow-"));
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "plans", "x.md"), "# x\n");
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const bash = (command) => spawnSync(process.execPath, [GUARD], {
      cwd: dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({ session_id: "narrow", tool_name: "Bash", tool_input: { command } }),
    });
    const events = () => {
      try { return fs.readFileSync(path.join(dir, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
      catch { return []; }
    };
    fn({ bash, events });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("narrow: the bypass flag as prose in a heredoc body is allowed, as a real flag it is refused", () => {
  fixture(({ bash }) => {
    assert.equal(bash(`git commit -F - <<'EOF'\nnever pass ${BYPASS} to git commit\nEOF`).status, 0);
    assert.equal(bash(`cat <<EOF\ngit push ${BYPASS}\nEOF`).status, 0);
    assert.equal(bash(`git commit ${BYPASS} -m x`).status, 2);
    assert.equal(bash(`git commit -F - ${BYPASS} <<'EOF'\nbody\nEOF`).status, 2);
    assert.equal(bash(`git commit -m x <<'EOF'\nprose\nEOF\ngit push ${BYPASS} origin x`).status, 2);
  });
});

test("narrow: a heredoc fed to a shell or interpreter still runs its body, so the bypass flag in it is refused", () => {
  fixture(({ bash }) => {
    for (const shell of ["bash", "sh", "zsh", "dash", "env bash", "python3", "node"]) {
      assert.equal(bash(`${shell} <<'EOF'\ngit commit ${BYPASS} -m x\nEOF`).status, 2, `refused: ${shell} heredoc`);
    }
    assert.equal(bash(`cat <<'EOF' | bash\ngit push ${BYPASS}\nEOF`).status, 2);
  });
});

test("narrow: the hard lines stay (ARCH-STATE-13): guarded removals and redirects still refuse", () => {
  fixture(({ bash }) => {
    assert.equal(bash("rm -rf docs/plans").status, 2);
    assert.equal(bash("rm \"$X\"").status, 2);
    assert.equal(bash("echo x > docs/plans/x.md").status, 2);
    // PR #1's fail-closed removal-word refusal stays (owner decision 2026-10-23): unreadable forms are still refused.
    for (const c of ["FOO=1 rm build/x", "while true; do rm build/x; done", "(rm build/x)"]) assert.equal(bash(c).status, 2, `still refused: ${c}`);
  });
});

test("narrow: the lease exception covers the run's own branches only (ARCH-LAND-23)", async () => {
  const own = ownBranchesOf({ branch: "feat/guard-narrowing" }, { plan: "docs/plans/dev-lifecycle-docs-plan.md" });
  assert.ok(own.includes("feat/guard-narrowing"));
  assert.ok(own.includes("feature/dev-lifecycle-docs-plan-*"));
  assert.deepEqual(ownBranchesOf(null, null), []);
  const ok = ["git push --force-with-lease origin feat/guard-narrowing", "git push --force-with-lease origin feature/dev-lifecycle-docs-plan-3"];
  const refused = [
    "git push --force-with-lease origin main", "git push --force-with-lease origin feat/other-unit",
    `git push ${FORCE} origin feat/guard-narrowing`, "git push --force-with-lease origin +feat/guard-narrowing",
  ];
  for (const c of ok) assert.equal(await forceBlocked(c, { ownBranches: own }), null, `allowed: ${c}`);
  for (const c of refused) assert.ok(await forceBlocked(c, { ownBranches: own }), `refused: ${c}`);
  assert.ok(await forceBlocked(ok[0]), "without own branches the lease push is still refused");
});
