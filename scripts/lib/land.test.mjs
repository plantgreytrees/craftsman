import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHost, openPullRequest, plainArgs, preflightHost, shellArgs } from "./land.mjs";

// A fake CLI: each call is recorded as "cli arg arg …" and answered by the
// first responder whose prefix matches.
function fakeRunner(responders) {
  const calls = [];
  const runner = (cli, args) => {
    const line = [cli, ...plainArgs(args)].join(" ");
    calls.push(line);
    for (const [prefix, reply] of responders) {
      if (line.startsWith(prefix)) return typeof reply === "function" ? reply(line) : reply;
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { runner, calls };
}
const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
const fail = (stderr) => ({ status: 1, stdout: "", stderr });
const base = { cwd: "/tmp", branch: "feat/unit-one", base: "main", title: "feat: one", body: "- feat: one" };
const LIST = { github: "gh pr list", gitlab: "glab mr list", azure: "az repos pr list" };
const CREATE = { github: "gh pr create", gitlab: "glab mr create", azure: "az repos pr create" };

test("land: detects each host from https and ssh origins", () => {
  const cases = {
    "https://github.com/o/r.git": "github",
    "git@github.com:o/r.git": "github",
    "ssh://git@ssh.github.com:443/o/r.git": "github",
    "https://gitlab.com/g/r.git": "gitlab",
    "git@gitlab.example.org:g/r.git": "gitlab",
    "https://dev.azure.com/org/proj/_git/r": "azure",
    "git@ssh.dev.azure.com:v3/org/proj/r": "azure",
    "https://org.visualstudio.com/proj/_git/r": "azure",
    "https://bitbucket.org/o/r.git": null,
    "https://github.com.evil.example/o/r.git": null,
    "/srv/git/r.git": null,
    "": null,
  };
  for (const [url, host] of Object.entries(cases)) assert.equal(detectHost(url), host, url);
});

test("land: a configured host overrides detection and must be known", () => {
  assert.equal(detectHost("https://git.internal/r.git", "gitlab"), "gitlab");
  assert.equal(detectHost("https://github.com/o/r.git", "auto"), "github");
  assert.throws(() => detectHost("x", "bitbucket"), /repoExec.host must be/);
});

test("land: exact argv per host and merge method for a fresh request", () => {
  const expected = {
    github: {
      merge: ["gh pr list --head feat/unit-one --base main --state open --json url,number --limit 1",
        "gh pr create --head feat/unit-one --base main --title feat: one --body - feat: one",
        "gh pr merge 7 --auto --merge"],
      squash: [null, null, "gh pr merge 7 --auto --squash"],
      rebase: [null, null, "gh pr merge 7 --auto --rebase"],
    },
    gitlab: {
      merge: ["glab mr list --source-branch feat/unit-one --target-branch main --output json",
        "glab mr create --source-branch feat/unit-one --target-branch main --title feat: one --description - feat: one --remove-source-branch --yes",
        "glab mr merge 7 --auto-merge --yes"],
      squash: [null, null, "glab mr merge 7 --auto-merge --yes --squash"],
      rebase: [null, null, "glab mr merge 7 --auto-merge --yes --rebase"],
    },
    azure: {
      merge: ["az repos pr list --source-branch feat/unit-one --target-branch main --status active --output json",
        "az repos pr create --source-branch feat/unit-one --target-branch main --title feat: one --description - feat: one --output json",
        "az repos pr update --id 7 --auto-complete true --delete-source-branch true --output none"],
      squash: [null, null, "az repos pr update --id 7 --auto-complete true --delete-source-branch true --squash true --output none"],
    },
  };
  const created = {
    github: ok("Creating pull request\nhttps://github.com/o/r/pull/7\n"),
    gitlab: ok("Creating merge request\nhttps://gitlab.com/g/r/-/merge_requests/7\n"),
    azure: ok(JSON.stringify({ pullRequestId: 7, repository: { webUrl: "https://dev.azure.com/org/proj/_git/r" } })),
  };
  const urls = {
    github: "https://github.com/o/r/pull/7",
    gitlab: "https://gitlab.com/g/r/-/merge_requests/7",
    azure: "https://dev.azure.com/org/proj/_git/r/pullrequest/7",
  };
  for (const [host, methods] of Object.entries(expected)) {
    for (const [mergeMethod, lines] of Object.entries(methods)) {
      const { runner, calls } = fakeRunner([[LIST[host], ok("[]")], [CREATE[host], created[host]]]);
      const result = openPullRequest({ ...base, host, mergeMethod }, runner);
      assert.deepEqual(result, { host, url: urls[host], id: "7", state: "opened", auto_merge: true }, `${host}/${mergeMethod}`);
      lines.forEach((line, index) => { if (line) assert.equal(calls[index], line, `${host}/${mergeMethod} call ${index}`); });
      assert.equal(calls.length, 3);
    }
  }
});

test("land: a retry finds the open request instead of opening another", () => {
  const { runner, calls } = fakeRunner([["gh pr list", ok(JSON.stringify([{ url: "https://github.com/o/r/pull/9", number: 9 }]))]]);
  const result = openPullRequest({ ...base, host: "github" }, runner);
  assert.equal(result.state, "existing");
  assert.equal(result.id, "9");
  assert.ok(!calls.some((line) => line.startsWith("gh pr create")));
});

test("land: an auto-merge refusal is reported, not thrown", () => {
  const { runner } = fakeRunner([["glab mr list", ok("[]")],
    ["glab mr create", ok("https://gitlab.com/g/r/-/merge_requests/3\n")],
    ["glab mr merge", fail("auto-merge is not enabled for this project")]]);
  const result = openPullRequest({ ...base, host: "gitlab" }, runner);
  assert.equal(result.auto_merge, false);
  assert.match(result.auto_merge_error, /auto-merge is not enabled/);
});

test("land: autoMerge:false only opens the request", () => {
  const { runner, calls } = fakeRunner([["gh pr list", ok("[]")], ["gh pr create", ok("https://github.com/o/r/pull/1")]]);
  const result = openPullRequest({ ...base, host: "github", autoMerge: false }, runner);
  assert.equal(result.auto_merge, false);
  assert.equal(result.auto_merge_error, undefined);
  assert.equal(calls.length, 2);
});

test("land: preflight names a missing CLI, a logged-out CLI and an unsupported method", () => {
  assert.throws(() => preflightHost({ ...base, host: "github" }, () => ({ missing: true })), /gh is not installed/);
  assert.throws(() => preflightHost({ ...base, host: "gitlab" }, () => fail("not logged in")), /glab is not ready.*not logged in/s);
  assert.throws(() => preflightHost({ ...base, host: "azure", mergeMethod: "rebase" }, () => ok()), /not supported on azure/);
  assert.doesNotThrow(() => preflightHost({ ...base, host: "azure", mergeMethod: "squash" }, () => ok()));
});

test("land: a failed create surfaces the CLI's error", () => {
  const { runner } = fakeRunner([["gh pr list", ok("[]")], ["gh pr create", fail("GraphQL: base branch not found")]]);
  assert.throws(() => openPullRequest({ ...base, host: "github" }, runner), /gh create failed:\nGraphQL: base branch not found/);
});

test("land: Windows shell args sanitise free text and refuse unsafe structured values", () => {
  const args = shellArgs(["repos", "pr", "create", "--source-branch", "feat/x", "--title", { free: 'fix: "quote" & del %PATH% ^| x\nline' }]);
  assert.deepEqual(args, ["repos", "pr", "create", "--source-branch", "feat/x", "--title", '"fix: quote  del PATH  x line"']);
  assert.throws(() => shellArgs(["--source-branch", "feat/a&calc"]), /refusing to pass/);
});
