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
blocked.push(
  `echo "${g}" |& sh`,
  `echo "${g}" | sudo sh`,
  `echo "${g}" | command sh`,
  `echo "${g}" | nice sh`,
);
blocked.push(
  `echo "${g}" > x.sh`,
  `printf '${g}' >> f`,
  `echo "${g}" | tee x.sh`,
  `echo "${g}" | dd of=x.sh`,
);
blocked.push(
  `x=$(echo "${g}"); $x`,
  "x=`echo \"" + g + "\"`; $x",
  `printf -v c '${g}'; $c`,
  `read c <<< "${g}"; $c`,
  `x=$(echo "${g}")`,
);
for (const c of allowed)
  test(`allows ${c}`, async () => assert.equal(await forceBlocked(c), null));
for (const c of blocked)
  test(`blocks ${c}`, async () => assert.ok(await forceBlocked(c)));

// Fail-closed prose (ARCH-STATE-16): escapes, shadowed or path-qualified programs are live.
const pf = ["git", "push", "-f", "origin", "main"].join(" ");
const rh = ["git", "reset", "--hard"].join(" ");
const cf = ["git", "clean", "-fd"].join(" ");
const failClosed = [
  `echo \\"; ${pf}; echo "x"`,
  `echo \\'; ${rh}; echo 'x'`,
  `echo a\\"b; ${cf}; echo "c"`,
  `echo() { bash -c "$1"; }; echo "${pf}"`,
  `function grep { sh -c "$1"; }; grep "${rh}" x`,
  `/tmp/p/echo "${pf}"`,
  `./grep "${rh}" x`,
  `for f in a; do ${["git", "push", "-f"].join(" ")}; done`,
];
for (const c of failClosed)
  test(`blocks ${c}`, async () => assert.ok(await forceBlocked(c)));
for (const c of [
  `for f in a; do echo "${cf}"; done`,
  `/bin/echo "${cf}"`,
  `/usr/bin/grep "${rh}" x`,
])
  test(`allows ${c}`, async () => assert.equal(await forceBlocked(c), null));
