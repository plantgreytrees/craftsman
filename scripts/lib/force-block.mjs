// The force block (ARCH-LAND-05): the destructive git forms /auto must never
// run, found in a Bash command however it is quoted, split or wrapped.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { shellSegments, UNEXPANDED } from "./shell-words.mjs";

const MAX_COMMAND_BYTES = 16 * 1024;
const MAX_INVOCATION_WORDS = 1 << 20;
const DEADLINE_MS = 4000;
const HEAP_MB = 128;
const UNREADABLE = "a command the force block cannot read";

const skipGlobals = (words, i) => {
  while (i < words.length && words[i].startsWith("-")) i += /^-[Cc]$|^--(?:git-dir|work-tree|namespace|attr-source|config-env)$/.test(words[i]) ? 2 : 1;
  return i;
};

// Every invocation a word list may hold: each `git` (or `…/git`) word with its
// global options skipped, and the word after an option tried as the subcommand
// too, in case that option takes an argument; each `git-<sub>` program as `<sub>`.
// Each invocation copies the rest of its list, so `budget.left` bounds the words
// copied across a whole command: past it, the command is unreadable (a throw).
function invocationsIn(words, budget) {
  const found = [];
  const take = (list) => {
    if ((budget.left -= list.length) < 0) throw new RangeError("too many git invocations");
    found.push(list);
  };
  words.forEach((word, k) => {
    const program = /(?:^|\/)git-([a-z][a-z0-9-]*)$/.exec(word);
    if (program) take([program[1], ...words.slice(k + 1)]);
    if (word !== "git" && !word.endsWith("/git")) return;
    const i = skipGlobals(words, k + 1);
    take(words.slice(i));
    if (i > k + 1 && words[i - 1].startsWith("-") && i < words.length) take(words.slice(skipGlobals(words, i + 1)));
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
  const budget = { left: MAX_INVOCATION_WORDS };
  for (const words of [...lists, ...shellSegments(value)]) invocations.push(...invocationsIn(words, budget));
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

// What pre-guard awaits. A hook that crashes (exit 1), runs out of heap
// (exit 134) or outlives its timeout fails open, and a timer cannot fire while
// a regex holds the thread. So the check runs in a worker with a deadline and a
// heap limit; anything but a clean answer in time — a throw, a crash, a miss —
// blocks, as does a command too large to read in time. `source` (worker code
// to eval) is the test seam for a stalled or exhausted check.
export function forceBlocked(value, { source, deadlineMs = DEADLINE_MS } = {}) {
  if (Buffer.byteLength(value) > MAX_COMMAND_BYTES) return Promise.resolve(`a command over ${MAX_COMMAND_BYTES} bytes (split it into smaller commands)`);
  return new Promise((resolve) => {
    const options = { workerData: { forceBlock: value }, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: HEAP_MB } };
    const worker = source ? new Worker(source, { ...options, eval: true }) : new Worker(new URL(import.meta.url), options);
    const settle = (verdict) => {
      clearTimeout(timer);
      resolve(verdict);
      worker.terminate();
    };
    const timer = setTimeout(() => settle(UNREADABLE), deadlineMs);
    worker.once("message", (message) => settle(message.ok ? message.verdict : UNREADABLE));
    worker.once("error", () => settle(UNREADABLE));
    worker.once("exit", () => settle(UNREADABLE));
  });
}

if (!isMainThread && typeof workerData?.forceBlock === "string") {
  let message;
  try {
    message = { ok: true, verdict: destructiveGit(workerData.forceBlock) };
  } catch {
    message = { ok: false };
  }
  parentPort.postMessage(message);
}
