// Pure readers behind `tracker.mjs init --merge|--from-block` (ARCH-TRACKER-13/14): text in, rows out.
import path from "node:path";

export const planSlug = (plan) => path.posix.basename(String(plan).split(path.sep).join("/"), ".md");
export const slugKey = (plan, unit) => `${planSlug(plan)}|${unit}`;

// Rows of the committed TRACKER.md generated block (plan, unit, module, status).
export function parseBlockRows(block, statuses) {
  if (!block) return [];
  const split = (line) => line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replaceAll("\\|", "|"));
  const table = block.split("\n").filter((line) => line.startsWith("|"));
  if (table.length < 3) return [];
  const header = split(table[0]);
  const at = (name) => header.indexOf(name);
  const rows = [];
  for (const line of table.slice(2)) {
    const cells = split(line);
    const link = /^\[([^\]]*)\]\(([^)]*)\)/.exec(cells[at("plan")] ?? "");
    const unit = (cells[at("unit")] ?? "").replace(/\s*\(([^)]*)\)$/, "");
    const status = cells[at("status")];
    if (!link || !unit || unit === "—" || !statuses.includes(status)) continue;
    const project = at("project") >= 0 && cells[at("project")] && cells[at("project")] !== "—" ? cells[at("project")] : ".";
    const module = cells[at("module")];
    rows.push({ project, plan: path.posix.normalize(path.posix.join("docs/plans", link[2])), unit, module: module && module !== "—" ? module : null, status });
  }
  return rows;
}

// Plan slugs that have a TRACKER-archive.md heading.
export function archivedSlugsOf(text, parseHeading) {
  const slugs = new Set();
  for (const line of text.split("\n")) {
    const rec = parseHeading(line);
    if (rec && rec.kind === "plan") slugs.add(planSlug(rec.plan));
  }
  return slugs;
}
