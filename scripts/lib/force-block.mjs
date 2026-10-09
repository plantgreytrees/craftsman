// The force block (ARCH-LAND-05): the destructive git forms /auto must never
// run, found in a Bash command however it is quoted, split or wrapped.
import { shellSegments, UNEXPANDED } from "./shell-words.mjs";

const skipGlobals = (words, i) => {
  while (i < words.length && words[i].startsWith("-")) i += /^-[Cc]$|^--(?:git-dir|work-tree|namespace|attr-source|config-env)$/.test(words[i]) ? 2 : 1;
  return i;
};

// Every invocation a word list may hold: each `git` (or `…/git`) word with its
// global options skipped, and the word after an option tried as the subcommand
// too, in case that option takes an argument; each `git-<sub>` program as `<sub>`.
function invocationsIn(words) {
  const found = [];
  words.forEach((word, k) => {
    const program = /(?:^|\/)git-([a-z][a-z0-9-]*)$/.exec(word);
    if (program) found.push([program[1], ...words.slice(k + 1)]);
    if (word !== "git" && !word.endsWith("/git")) return;
    const i = skipGlobals(words, k + 1);
    found.push(words.slice(i));
    if (i > k + 1 && words[i - 1].startsWith("-") && i < words.length) found.push(words.slice(skipGlobals(words, i + 1)));
  });
  return found;
}

// Each `git …` in a compound command, read three ways — quote-aware, plain
// split, bash's own words; any may block. `&>` is a redirect, not a separator.
function gitInvocations(value) {
  const invocations = [];
  const segments = [""];
  for (const piece of value.match(/"[^"]*"|'[^']*'|&&|\|\||&(?!>)|[;|\n()`]|(?:&>|[^"';|&\n()`])+|["']/g) || []) {
    if (/^(?:&&|\|\||[;|&\n()`])$/.test(piece)) segments.push("");
    else segments[segments.length - 1] += piece;
  }
  segments.push(...value.split(/&&|\|\||&(?!>)|[;|\n()`]/));
  const lists = segments.map((segment) => (segment.match(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g) || []).map((word) => word.replace(/["']/g, "")).filter(Boolean));
  for (const words of [...lists, ...shellSegments(value)]) invocations.push(...invocationsIn(words));
  return invocations;
}

const shortFlag = (word, letter) => new RegExp(`^-[A-Za-z0-9]*${letter}[A-Za-z0-9]*$`).test(word);
// git takes any unambiguous prefix of a long option, so `--har` is `--hard`.
const longFlag = (word, ...options) => {
  const name = word.split("=")[0];
  return name.length >= 3 && options.some((option) => option.startsWith(name));
};

// Stops at ( ) ` $ too, so a substitution after a message is never one.
const MESSAGE_OPERAND = /\bgit\b[^;&|\n()`$]*\s(?:commit|tag)\b[^;&|\n()`$]*\s(?:-[A-Za-z]*m|--message|-F|--file)=?\s*$/;

// The destructive git forms /auto must never run (ARCH-LAND-05), or null.
// Every quoted string is checked as a command (`bash -c`, `python3 -c`, …)
// except a commit/tag message operand without $( ) or a backtick. Alias
// definitions are checked as what they define, and an alias call as its
// resolved words plus call-site flags.
export function destructiveGit(value) {
  for (const quoted of value.matchAll(/"([^"]*)"|'([^']*)'/g)) {
    const inner = quoted[1] ?? quoted[2];
    if (MESSAGE_OPERAND.test(value.slice(0, quoted.index)) && !/\$\(|`/.test(inner)) continue;
    const found = destructiveGit(inner);
    if (found) return found;
  }
  const aliases = new Map();
  for (const alias of value.matchAll(/\balias\.([\w.-]+)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    const defined = (alias[2] ?? alias[3] ?? alias[4]).replace(/^!\s*/, "");
    aliases.set(alias[1], defined.replace(/^git\s+/, "").split(/\s+/).filter(Boolean));
    const found = destructiveGit(/\bgit\b/.test(defined) ? defined : `git ${defined}`);
    if (found) return found;
  }
  for (let words of gitInvocations(value)) {
    for (let n = 0; n <= aliases.size && aliases.has(words[0]); n++) words = [...aliases.get(words[0]), ...words.slice(1)];
    const [sub, ...rest] = words;
    if (sub === "push" && rest.some((w) => w === UNEXPANDED || longFlag(w, "--force-with-lease", "--force-if-includes", "--mirror") || shortFlag(w, "f") || w.startsWith("+"))) return "git push --force";
    if (sub === "reset" && rest.some((w) => w === UNEXPANDED || longFlag(w, "--hard"))) return "git reset --hard";
    if (sub === "worktree" && rest[0] === "remove" && rest.slice(1).some((w) => w === UNEXPANDED || longFlag(w, "--force") || shortFlag(w, "f"))) return "git worktree remove --force";
  }
  return null;
}

// What pre-guard calls: a command the force block cannot read (a throw) is
// blocked, never let through — a hook that crashes exits 1, which fails open.
export function forceBlocked(value, check = destructiveGit) {
  try {
    return check(value);
  } catch {
    return "a command the force block cannot read";
  }
}
