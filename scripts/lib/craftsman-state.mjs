// craftsman's own gitignored state is not the user's work: the one test for it, over a `git status
// --porcelain` (v1) line, shared by the Stop secrets re-scan and the unpushed-work report (ARCH-STATE-04).
export function isCraftsmanStateLine(line) {
  const p = String(line).slice(3); // "XY PATH": strip the two status columns and the space
  return p === ".craftsman" || p.startsWith(".craftsman/");
}
