// ARCH-STATE-24: the one same-repository test, shared by Stop's baseline lookup and scope.mjs's worktree check.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Equal real paths are the same repository. Otherwise both roots must share one git common directory, each resolved against its
// own directory (git prints it relative to the cwd) and compared by real path, so a symlinked spelling (/home against /var/home)
// of one repository agrees. A git failure, a missing directory or a directory that is not a repository is NOT the same
// repository. Git is asked only when the two roots differ.
export function sameRepository(rootDir, scopeDir) {
  try {
    if (fs.realpathSync(rootDir) === fs.realpathSync(scopeDir)) return true;
    const commonDir = (dir) => fs.realpathSync(path.resolve(dir, execFileSync(
      "git", ["rev-parse", "--git-common-dir"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }
    ).trim()));
    return commonDir(rootDir) === commonDir(scopeDir);
  } catch { return false; }
}
