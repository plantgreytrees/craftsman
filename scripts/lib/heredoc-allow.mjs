// ARCH-STATE-14: heredoc bodies are prose only when every command left after stripping them is a listed
// prose consumer; any other head (a shell, an interpreter, a file run) keeps the bodies in view.
import { shellSegments } from "./shell-words.mjs";

const PLAIN = new Set(["cat", "tee", "echo", "printf", "true", "wc", "sort", "uniq", "head", "tail"]);

export function proseOnly(stripped) {
  return shellSegments(stripped).every((words) => {
    const [head, sub] = words;
    if (PLAIN.has(head)) return true;
    return head === "git" && ["commit", "tag", "notes"].includes(sub);
  });
}
