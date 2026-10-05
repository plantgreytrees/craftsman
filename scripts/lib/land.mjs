// Lands a pushed branch through the repository host's own review flow: finds
// or opens a pull/merge request with the host's CLI (gh, glab, az) and asks
// the host to merge it once its checks and approvals pass. Used by
// repo-exec.mjs when `repoExec.land` is "pr" — the alternative to pushing a
// protected base branch directly. Every CLI call goes through an injectable
// runner, so the per-host argv below is tested without a network or a CLI.
import { spawnSync } from "node:child_process";

export const HOSTS = ["github", "gitlab", "azure"];
export const MERGE_METHODS = ["merge", "squash", "rebase"];

// Which host an origin URL points at. A configured host wins over detection;
// self-hosted GitLab / GitHub Enterprise on other domains need it set.
export function detectHost(originUrl, override = "auto") {
  if (override && override !== "auto") {
    if (!HOSTS.includes(override)) throw new Error(`repoExec.host must be auto, ${HOSTS.join(", ")} (got ${override})`);
    return override;
  }
  const host = hostnameOf(originUrl);
  if (!host) return null;
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host === "dev.azure.com" || host === "ssh.dev.azure.com" || host.endsWith(".visualstudio.com")) return "azure";
  if (host.includes("gitlab")) return "gitlab";
  return null;
}

function hostnameOf(url) {
  if (!url) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try { return new URL(url).hostname.toLowerCase() || null; } catch { return null; }
  }
  const scp = url.match(/^(?:[^@/\s]+@)?([^:/\s]+):/); // git@github.com:owner/repo.git
  return scp ? scp[1].toLowerCase() : null;
}

// Free text (titles, descriptions) is marked so the Windows shell path can
// sanitise it; everything else must already be shell-safe there.
const free = (text) => ({ free: String(text) });

function parseJson(stdout, what) {
  try { return JSON.parse(stdout || "null"); }
  catch { throw new Error(`could not read ${what} output as JSON`); }
}

function lastUrl(stdout) {
  const urls = String(stdout || "").match(/https?:\/\/\S+/g);
  return urls ? urls[urls.length - 1] : null;
}

const ADAPTERS = {
  github: {
    cli: "gh",
    methods: MERGE_METHODS,
    preflight: () => ["auth", "status"],
    find: (o) => ["pr", "list", "--head", o.branch, "--base", o.base, "--state", "open", "--json", "url,number", "--limit", "1"],
    parseFind: (stdout) => {
      const [pr] = parseJson(stdout, "gh pr list") || [];
      return pr ? { url: pr.url, id: String(pr.number) } : null;
    },
    create: (o) => ["pr", "create", "--head", o.branch, "--base", o.base, "--title", free(o.title), "--body", free(o.body)],
    parseCreate: (stdout) => {
      const url = lastUrl(stdout);
      return url ? { url, id: url.match(/\/pull\/(\d+)/)?.[1] || url } : null;
    },
    autoMerge: (o) => ["pr", "merge", o.id, "--auto", `--${o.mergeMethod}`],
  },
  gitlab: {
    cli: "glab",
    methods: MERGE_METHODS,
    preflight: () => ["auth", "status"],
    find: (o) => ["mr", "list", "--source-branch", o.branch, "--target-branch", o.base, "--output", "json"],
    parseFind: (stdout) => {
      const [mr] = parseJson(stdout, "glab mr list") || [];
      return mr ? { url: mr.web_url, id: String(mr.iid) } : null;
    },
    create: (o) => ["mr", "create", "--source-branch", o.branch, "--target-branch", o.base,
      "--title", free(o.title), "--description", free(o.body), "--remove-source-branch", "--yes"],
    parseCreate: (stdout) => {
      const url = lastUrl(stdout);
      return url ? { url, id: url.match(/\/merge_requests\/(\d+)/)?.[1] || url } : null;
    },
    autoMerge: (o) => ["mr", "merge", o.id, "--auto-merge", "--yes",
      ...(o.mergeMethod === "squash" ? ["--squash"] : o.mergeMethod === "rebase" ? ["--rebase"] : [])],
  },
  azure: {
    cli: "az",
    // The azure-devops CLI extension can complete a PR as a merge or a
    // squash; a rebase strategy has to come from branch policy instead.
    methods: ["merge", "squash"],
    preflight: () => ["extension", "show", "--name", "azure-devops", "--output", "none"],
    find: (o) => ["repos", "pr", "list", "--source-branch", o.branch, "--target-branch", o.base, "--status", "active", "--output", "json"],
    parseFind: (stdout) => {
      const [pr] = parseJson(stdout, "az repos pr list") || [];
      return pr ? azurePr(pr) : null;
    },
    create: (o) => ["repos", "pr", "create", "--source-branch", o.branch, "--target-branch", o.base,
      "--title", free(o.title), "--description", free(o.body), "--output", "json"],
    parseCreate: (stdout) => azurePr(parseJson(stdout, "az repos pr create")),
    autoMerge: (o) => ["repos", "pr", "update", "--id", o.id, "--auto-complete", "true", "--delete-source-branch", "true",
      ...(o.mergeMethod === "squash" ? ["--squash", "true"] : []), "--output", "none"],
  },
};

function azurePr(pr) {
  if (!pr?.pullRequestId) return null;
  const web = pr.repository?.webUrl;
  return { url: web ? `${web}/pullrequest/${pr.pullRequestId}` : String(pr.url || ""), id: String(pr.pullRequestId) };
}

// Windows only: `az` is a .cmd shim, which Node starts only through a shell,
// and a shell re-parses every argument. Structured values (branch names, ids,
// flags) must already be plain; free text keeps only an allow-listed set of
// characters, so nothing in a commit subject can reach cmd.exe as syntax.
const SHELL_PLAIN = /^[\w./:@+=,-]+$/;
export function shellArgs(args) {
  return args.map((arg) => {
    if (arg && typeof arg === "object") {
      const text = arg.free.replace(/\s+/g, " ").replace(/[^\w .,:;()/#+@'[\]=-]/g, "").trim();
      return `"${text}"`;
    }
    if (!SHELL_PLAIN.test(arg)) throw new Error(`refusing to pass "${arg}" through the Windows shell`);
    return arg;
  });
}

export function plainArgs(args) {
  return args.map((arg) => (arg && typeof arg === "object" ? arg.free : arg));
}

export function defaultRunner(cli, args, { cwd }) {
  const viaShell = process.platform === "win32" && cli === "az";
  const result = viaShell
    ? spawnSync("az.cmd", shellArgs(args), { cwd, encoding: "utf8", shell: true, timeout: 120000 })
    : spawnSync(cli, plainArgs(args), { cwd, encoding: "utf8", shell: false, timeout: 120000 });
  if (result.error?.code === "ENOENT") return { missing: true };
  if (result.error) return { status: 1, stdout: "", stderr: result.error.message };
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function adapterFor(options) {
  const adapter = ADAPTERS[options.host];
  if (!adapter) throw new Error(`unknown host ${options.host}; expected ${HOSTS.join(", ")}`);
  const method = options.mergeMethod || "merge";
  if (!adapter.methods.includes(method)) {
    throw new Error(`repoExec.mergeMethod "${method}" is not supported on ${options.host} (use ${adapter.methods.join(" or ")})`);
  }
  return adapter;
}

function call(runner, adapter, step, args, cwd) {
  const result = runner(adapter.cli, args, { cwd });
  if (result.missing) throw new Error(`${adapter.cli} is not installed — install it or set repoExec.land to "direct"`);
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}${result.stdout || ""}`.trim().split("\n").slice(-10).join("\n");
    throw new Error(`${adapter.cli} ${step} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout || "";
}

// Run before anything is pushed: an unsupported merge method, a missing CLI
// or a logged-out CLI stops the landing with nothing changed remotely.
export function preflightHost(options, runner = defaultRunner) {
  const adapter = adapterFor(options);
  try { call(runner, adapter, "auth check", adapter.preflight(options), options.cwd); }
  catch (error) {
    if (/not installed/.test(error.message)) throw error;
    throw new Error(`${adapter.cli} is not ready to open pull requests (log in first): ${error.message}`);
  }
}

// Idempotent: a retry after a partial failure finds the open request instead
// of opening a second one. An auto-merge refusal (repo setting off, no
// permission) is reported, never fatal — the request is open either way.
export function openPullRequest(options, runner = defaultRunner) {
  const adapter = adapterFor(options);
  const o = { ...options, mergeMethod: options.mergeMethod || "merge" };
  const run = (step, args) => call(runner, adapter, step, args, o.cwd);
  let pr = adapter.parseFind(run("lookup", adapter.find(o)));
  let state = "existing";
  if (!pr) {
    pr = adapter.parseCreate(run("create", adapter.create(o)));
    state = "opened";
  }
  if (!pr?.url) throw new Error(`${adapter.cli} did not report the new request's URL`);
  const result = { host: o.host, url: pr.url, id: pr.id, state, auto_merge: false };
  if (o.autoMerge !== false) {
    try {
      run("auto-merge", adapter.autoMerge({ ...o, id: pr.id }));
      result.auto_merge = true;
    } catch (error) {
      result.auto_merge_error = error.message;
    }
  }
  return result;
}
