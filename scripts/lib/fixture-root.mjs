// Test fixture roots that call tracker.mjs must be their own git root
// (ARCH-TRACKER-20). tracker.mjs resolves its ledger through the main checkout
// of the root, so a bare temp dir inside another repository (TMPDIR in a repo)
// would write that repository's ledger. An inherited GIT_DIR/GIT_WORK_TREE
// overrides git's repo discovery altogether, so a git-init alone cannot stop
// that case: they are cleared on import.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

delete process.env.GIT_DIR;
delete process.env.GIT_WORK_TREE;

export function gitRootedTmp(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
  return root;
}
