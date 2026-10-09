import { test } from "node:test";
import assert from "node:assert/strict";
import { shellSegments } from "./shell-words.mjs";

test("shell-words: quotes group words and are removed; single quotes are literal", () => {
  assert.deepEqual(shellSegments(`a "b c" 'd \\e' f"g"h`), [["a", "b c", "d \\e", "fgh"]]);
});

test("shell-words: double quotes honour their four escapes only", () => {
  assert.deepEqual(shellSegments(`"a\\"b\\\\c\\$d\\\`e\\nf"`), [["a\"b\\c$d`e\\nf"]]);
});

test("shell-words: an unquoted backslash escapes the next character, so \\\" is a literal quote", () => {
  assert.deepEqual(shellSegments(`x --n=\\"y reset --hard \\"`), [["x", "--n=\"y", "reset", "--hard", "\""]]);
});

test("shell-words: backslash-newline continues the line", () => {
  assert.deepEqual(shellSegments("re\\\nset --hard"), [["reset", "--hard"]]);
});

test("shell-words: a word-initial # comments to end of line; a mid-word # does not", () => {
  assert.deepEqual(shellSegments("a #b c\nd e#f"), [["a"], ["d", "e#f"]]);
});

test("shell-words: separators split only outside quotes", () => {
  assert.deepEqual(shellSegments(`a;b&&c||d|e&f\ng(h)i\`j\` "k;l"`), [["a"], ["b"], ["c"], ["d"], ["e"], ["f"], ["g"], ["h"], ["i"], ["j"], ["k;l"]]);
});

test("shell-words: unquoted {a,b} expands one level; quoted braces stay", () => {
  assert.deepEqual(shellSegments(`p {-f,o} x{1,2}y "{q,r}"`), [["p", "-f", "o", "x1y", "x2y", "{q,r}"]]);
});

test("shell-words: $'…' decodes ANSI-C escapes", () => {
  assert.deepEqual(shellSegments(`$'\\x2df' $'a\\'b' $'\\055\\055hard'`), [["-f", "a'b", "--hard"]]);
});

test("shell-words: $( ) and backticks inside double quotes split as commands of their own", () => {
  assert.deepEqual(shellSegments(`m "$(b -c 'r --hard')"`).slice(1), [["$"], ["b", "-c", "r --hard"], ["$"], ["b", "-c", "r --hard"]]);
  assert.deepEqual(shellSegments("m \"x `r --hard`\"").slice(1), [["x"], ["r", "--hard"], ["x"], ["r", "--hard"]]);
});
