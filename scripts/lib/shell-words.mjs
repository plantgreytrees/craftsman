// Bash's own word splitting, for guards that must read a command the way the
// shell will run it: one word list per simple command. Quotes and escapes are
// removed, `#` comments and redirect targets dropped, unquoted braces expanded
// until none remain, and a `$( )` or backtick inside double quotes is split as
// a command of its own. Runtime constructs (`eval`, `${var}`, IFS) are out of
// a lexer's reach.

const ANSI = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v" };
const MAX_WORDS = 256;

// Stands in for brace words past MAX_WORDS: a guard must treat it as unsafe.
export const UNEXPANDED = "\u0000unexpanded-braces";

function ansiC(body) {
  return body.replace(/\\(x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}|c.|[0-7]{1,3}|.)/gs, (_, esc) => {
    if (/^[xuU]./.test(esc)) {
      const code = parseInt(esc.slice(1), 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    if (esc[0] === "c" && esc.length > 1) return String.fromCharCode(esc.charCodeAt(1) & 31);
    if (/^[0-7]/.test(esc)) return String.fromCharCode(parseInt(esc, 8));
    return ANSI[esc] ?? esc;
  });
}

function sequence(from, to) {
  const numeric = /^-?\d+$/.test(from) && /^-?\d+$/.test(to);
  const [a, b] = numeric ? [Number(from), Number(to)] : [from.codePointAt(0), to.codePointAt(0)];
  const items = [];
  for (let n = a; items.length < MAX_WORDS; n += a <= b ? 1 : -1) {
    items.push(numeric ? String(n) : String.fromCodePoint(n));
    if (n === b) break;
  }
  return items;
}

// The first brace group that expands, split on its top-level commas or read as
// a `{x..y}` sequence; null when no group expands.
function expandOnce(word) {
  for (let s = word.indexOf("{"); s >= 0; s = word.indexOf("{", s + 1)) {
    const commas = [];
    for (let e = s, depth = 0; e < word.length; e++) {
      if (word[e] === "," && depth === 1) commas.push(e);
      if (word[e] === "{") depth++;
      if (word[e] !== "}" || --depth) continue;
      const head = word.slice(0, s);
      const tail = word.slice(e + 1);
      if (commas.length) return [s, ...commas].map((from, n) => head + word.slice(from + 1, [...commas, e][n]) + tail);
      const range = /^(-?\d+|.)\.\.(-?\d+|.)(?:\.\.-?\d+)?$/s.exec(word.slice(s + 1, e));
      if (range) return sequence(range[1], range[2]).map((item) => head + item + tail);
      break;
    }
  }
  return null;
}

// Every expansion of a word, in bash's order (word order decides which word a
// guard reads as the subcommand), cut at MAX_WORDS with UNEXPANDED appended.
function braces(word) {
  const words = [];
  let full = false;
  const walk = (next) => {
    if (words.length >= MAX_WORDS) full = true;
    if (full) return;
    const parts = expandOnce(next);
    if (parts) parts.forEach(walk);
    else words.push(next);
  };
  walk(word);
  return full ? [...words, UNEXPANDED] : words;
}

export function shellSegments(value) {
  const segments = [[]];
  const nested = [];
  let word = null;
  let brace = false;
  let redirect = false;
  const end = () => {
    if (word !== null && !redirect) segments[segments.length - 1].push(...(brace ? braces(word).filter(Boolean) : [word]));
    if (word !== null) redirect = false;
    word = null;
    brace = false;
  };
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    if (c === "\\") {
      if (value[i + 1] !== "\n") word = (word ?? "") + (value[i + 1] ?? "");
      i += 2;
    } else if (c === "'" || (c === "$" && value[i + 1] === "'")) {
      const start = c === "$" ? i + 2 : i + 1;
      let j = start;
      while (j < value.length && value[j] !== "'") j += c === "$" && value[j] === "\\" ? 2 : 1;
      const body = value.slice(start, j);
      word = (word ?? "") + (c === "$" ? ansiC(body) : body);
      i = j + 1;
    } else if (c === "$" && value[i + 1] === '"') {
      i++;
    } else if (c === '"') {
      let j = i + 1;
      let text = "";
      let substitution = false;
      while (j < value.length && value[j] !== '"') {
        if (value[j] === "\\" && /["\\$`\n]/.test(value[j + 1] ?? "")) j++;
        else if (value[j] === "`" || (value[j] === "$" && value[j + 1] === "(")) substitution = true;
        text += value[j++];
      }
      if (substitution) nested.push(...shellSegments(value.slice(i + 1, j)), ...shellSegments(text));
      word = (word ?? "") + text;
      i = j + 1;
    } else if (c === "#" && word === null) {
      while (i < value.length && value[i] !== "\n") i++;
    } else if (c === "<" || c === ">") {
      if (word !== null && /^\d+$/.test(word)) word = null;
      end();
      while (/[<>&|]/.test(value[i] ?? "")) i++;
      redirect = true;
    } else if (c === " " || c === "\t") {
      end();
      i++;
    } else if (/[;&|\n()`]/.test(c)) {
      end();
      redirect = false;
      segments.push([]);
      i++;
    } else {
      if (c === "{") brace = true;
      word = (word ?? "") + c;
      i++;
    }
  }
  end();
  return [...segments, ...nested].filter((words) => words.length);
}
