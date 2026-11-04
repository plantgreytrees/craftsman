// craftsman's own gitignored state is not the user's work: the one test for it, over a `git status
// --porcelain` (v1) line, shared by the Stop secrets re-scan and the unpushed-work report (ARCH-STATE-04).
export function isCraftsmanStateLine(line) {
  const p = String(line).slice(3); // "XY PATH": strip the two status columns and the space
  return p === ".craftsman" || p.startsWith(".craftsman/");
}

// A `git status --porcelain` text without craftsman's own state lines, every other line as it was. The hash SessionStart and
// snapshot.mjs compare is taken over this, so a repo that does not gitignore `.craftsman/` does not see the state written
// after the starting hash (snapshot-started above all) as a change to the user's tree (ARCH-STATE-04).
export function withoutCraftsmanState(porcelain) {
  return String(porcelain).split("\n").filter((line) => !isCraftsmanStateLine(line)).join("\n");
}
