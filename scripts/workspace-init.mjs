#!/usr/bin/env node
// Create or explicitly update a workspace manifest from caller-supplied roots.
import fs from "node:fs";
import path from "node:path";
import { atomicWrite, isGitRoot, loadWorkspaceManifest, readStdin, workspaceManifestPath } from "./lib/core.mjs";

function validateInput(input) {
  if (!input || typeof input !== "object" || !input.projects || typeof input.projects !== "object") {
    throw new Error("input.projects must be an object of id -> relative root mappings");
  }
  const ids = Object.keys(input.projects);
  if (!ids.length) throw new Error("at least one project mapping is required");
  for (const id of ids) {
    const root = input.projects[id];
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`invalid project id: ${id}`);
    if (typeof root !== "string" || !root.trim() || path.isAbsolute(root)) {
      throw new Error(`project ${id} needs a relative root`);
    }
  }
  return input;
}

export function buildManifest(input, existing = null) {
  validateInput(input);
  const projects = { ...(existing?.projects || {}) };
  for (const [id, root] of Object.entries(input.projects)) projects[id] = { root };
  return { version: 1, projects };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = validateInput(JSON.parse(await readStdin() || "{}"));
    const file = input.manifest_path ? path.resolve(input.manifest_path) : workspaceManifestPath();
    if (fs.existsSync(file) && !input.update) {
      throw new Error(`manifest already exists: ${file}; pass update:true to merge explicit entries`);
    }
    const previous = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
    process.env.CRAFTSMAN_WORKSPACE_MANIFEST = file;
    let existing = null;
    if (fs.existsSync(file)) existing = loadWorkspaceManifest();
    const manifest = buildManifest(input, existing);
    const workspaceRoot = fs.realpathSync(path.dirname(file));
    const roots = new Set();
    for (const [id, entry] of Object.entries(manifest.projects)) {
      const root = fs.realpathSync(path.resolve(workspaceRoot, entry.root));
      if (root !== workspaceRoot && !root.startsWith(workspaceRoot + path.sep)) {
        throw new Error(`project escapes workspace root: ${id}`);
      }
      if (roots.has(root)) throw new Error(`projects share a root: ${id}`);
      roots.add(root);
      if (!isGitRoot(root)) throw new Error(`project is not a Git root: ${id}`);
    }
    atomicWrite(file, JSON.stringify(manifest, null, 2) + "\n");
    const checked = loadWorkspaceManifest();
    if (previous === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
    else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = previous;
    process.stdout.write(`workspace manifest written: ${file}\n`);
    process.stdout.write(`${Object.keys(checked.projects).length} project(s) validated\n`);
  } catch (error) {
    process.stderr.write(`craftsman: workspace manifest failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
