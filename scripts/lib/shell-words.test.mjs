import { test } from "node:test";
import assert from "node:assert/strict";
import { shellSegments, UNEXPANDED } from "./shell-words.mjs";

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

test("shell-words: a redirection ends the word and drops its target, fd numbers included", () => {
  assert.deepEqual(shellSegments("a -f>/dev/null b 2>&1 c <in d >>log e &>x f <<<s"), [["a", "-f", "b", "c", "d", "e"], ["f"]]);
  assert.deepEqual(shellSegments("cat <(r --hard)"), [["cat"], ["r", "--hard"]]);
});

test("shell-words: $\"…\" reads as a double-quoted string", () => {
  assert.deepEqual(shellSegments(`r $"--hard"`), [["r", "--hard"]]);
});

test("shell-words: $'…' decodes \\u, \\U and \\c", () => {
  assert.deepEqual(shellSegments(`$'\\u002d\\U0000002dhard' $'\\cA'`), [["--hard", "\x01"]]);
});

test("shell-words: braces expand until none remain, sequences included, capped by a sentinel", () => {
  assert.deepEqual(shellSegments("r {a,b}{,c} {{x,y},z} h{d..e} {1..3}"), [["r", "a", "ac", "b", "bc", "x", "y", "z", "hd", "he", "1", "2", "3"]]);
  assert.deepEqual(shellSegments("g {,} {{push,o},-f} {a}"), [["g", "push", "o", "-f", "{a}"]]);
  assert.equal(shellSegments("r " + "{a,b}".repeat(12))[0].at(-1), UNEXPANDED);
});
