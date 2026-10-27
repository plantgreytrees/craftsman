import { test } from "node:test";
import assert from "node:assert/strict";
import { forceBlocked } from "./lib/force-block.mjs";

const allowed = [
  'grep -n "git reset --hard" scripts/x.mjs',
  `printf '%s' "do not git push --force"`,
  'echo "git clean -fd is blocked"',
];
const blocked = [
  "git reset --hard",
  "git -C w push --force",
  "a && git clean -fd",
  "sh -c 'git push -f'",
  "env X=1 git reset --hard HEAD~1",
  'echo "git reset --hard" | sh',
  'echo "$(git reset --hard)"',
  'echo "x" && git reset --hard',
];
const g = ["git", "reset", "--hard"].join(" ");
blocked.push(`echo "${g}" > x.sh`, `printf '${g}' >> f`, `echo "${g}" | tee x.sh`, `echo "${g}" | dd of=x.sh`);
for (const c of allowed)
  test(`allows ${c}`, async () => assert.equal(await forceBlocked(c), null));
for (const c of blocked)
  test(`blocks ${c}`, async () => assert.ok(await forceBlocked(c)));
