// Bash's own word splitting, for guards that must read a command the way the
// shell will run it: one word list per simple command. Quotes and escapes are
// removed, `#` comments dropped, unquoted `{a,b}` expanded one level, and a
// `$( )` or backtick inside double quotes is split as a command of its own.
// Runtime constructs (`eval`, `${var}`, IFS) are out of a lexer's reach.

const ANSI = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v" };

function ansiC(body) {
  return body.replace(/\\(x[0-9A-Fa-f]{1,2}|[0-7]{1,3}|.)/gs, (_, esc) => {
    if (esc[0] === "x" && esc.length > 1) return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (/^[0-7]/.test(esc)) return String.fromCharCode(parseInt(esc, 8));
    return ANSI[esc] ?? esc;
  });
}

function braces(word) {
  const m = /^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/s.exec(word);
  return m ? m[2].split(",").map((part) => m[1] + part + m[3]) : [word];
}

export function shellSegments(value) {
  const segments = [[]];
  const nested = [];
  let word = null;
  let brace = false;
  const end = () => {
    if (word !== null) segments[segments.length - 1].push(...(brace ? braces(word) : [word]));
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
    } else if (c === " " || c === "\t") {
      end();
      i++;
    } else if (/[;&|\n()`]/.test(c)) {
      end();
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
