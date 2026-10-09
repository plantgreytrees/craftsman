// Run with `claude plugin test .` (ARCH-MOD-05). Each launch path of the mod
// (ARCH-MOD-02), its band and telemetry sample (ARCH-MOD-03).
import { describe, expect, test } from "claude-code/testing";

// The kit loads each fake from its own source, so the fake shares nothing with
// this file: the scenario rides in on turn.complete's answer, and the fake's
// log comes back out through a `report` command.
const engine = {
  name: "fake-engine",
  register(on) {
    const log = [];
    const store = new Map();
    let scenario = "";
    const arg = (e) => (typeof e === "string" ? e : e && (e.path ?? e.key ?? e));
    on("turn.complete", ($, e) => { scenario = String(e.answer); return { text: "" }; });
    on("session.id", () => ({ value: "sid1" }));
    on("session.usage", () => ({ value: { startedAt: 1000, context: { tokens: 5000, window: 200000, percent: 2.5 }, cost: { usd: 0.1 } } }));
    on("fs.list", ($, e) => {
      log.push({ list: e });
      const p = arg(e);
      if (p.endsWith("/.craftsman/instructions")) {
        if (scenario.includes("no-goal-file")) return { value: [] };
        return { value: [
          { name: "old.goal.txt", kind: "file", size: 9, mtimeMs: 500, isLink: false },
          { name: "x.goal.txt", kind: "file", size: 17, mtimeMs: 2000, isLink: false },
        ] };
      }
      if (p.endsWith("/.craftsman/sessions/sid1")) return { value: [{ name: "scope.json", kind: "file", size: 2, mtimeMs: 1, isLink: false }] };
      return { value: [] };
    });
    on("fs.read", ($, e) => {
      log.push({ read: e });
      const p = arg(e);
      if (p.endsWith("scope.json")) return { value: JSON.stringify({ plan: "docs/plans/p.md", unit: "u2" }) };
      if (p.endsWith("tracker/events.jsonl")) {
        return { value: [{ plan: "docs/plans/p.md", unit: "u1", status: "MERGED" }, { plan: "docs/plans/p.md", unit: "u2", status: "IN_PROGRESS" }]
          .map((r) => JSON.stringify(r)).join("\n") };
      }
      if (p.endsWith("x.goal.txt")) return { value: "/goal Deliver x.\n" };
      throw new Error(`no such file ${p}`);
    });
    on("store.get", ($, e) => { log.push({ storeGet: e }); return { value: store.get(arg(e)) }; });
    on("store.set", ($, e) => { log.push({ storeSet: e }); store.set(arg(e), e && e.value); return { value: undefined }; });
    on("process.run", ($, e) => { log.push({ run: e }); return { value: { exitCode: 0, stdout: "", stderr: "" } }; });
    on("ui.status", ($, e) => { log.push({ status: e.text, raw: e }); return { value: undefined }; });
    on("prompt.submit", ($, e) => {
      if (scenario.includes("no-submit")) throw new Error("prompt.submit unsupported");
      log.push({ submit: e.text });
      return {};
    });
    on("command.run", ($, e) => {
      if (e.command === "report") return { text: JSON.stringify(log) };
      if (e.command === "goal") {
        if (scenario.includes("no-goal-command")) throw new Error("$.command.run: no command named /goal in this session");
        log.push({ goal: e.args });
        return { text: "" };
      }
      return { text: `unhandled ${e.command}` };
    });
  },
};

async function turn(t, scenario) {
  await t.turn.complete({ answer: scenario });
  const report = await t.command.run({ command: "report", args: "" });
  return JSON.parse(report.text);
}

describe("craftsman mod", () => {
  test("a new goal file launches through command.run('goal'), once", { plugins: [engine] }, async (t) => {
    const log = await turn(t, "plain");
    expect(log.filter((l) => l.goal)).toEqual([{ goal: "Deliver x." }]);
    expect(log.some((l) => l.submit)).toBe(false);
    const again = await turn(t, "plain");
    expect(again.filter((l) => l.goal).length).toBe(1);
  });

  test("without /goal it submits the goal directive as the user", { plugins: [engine] }, async (t) => {
    const log = await turn(t, "no-goal-command");
    expect(log.filter((l) => l.submit)).toEqual([{ submit: "Deliver x." }]);
  });

  test("with neither, the band asks for /craftsman:auto-go, which answers with the goal", { plugins: [engine] }, async (t) => {
    const log = await turn(t, "no-goal-command no-submit");
    const status = log.filter((l) => l.status).pop().status;
    expect(status.includes("type /craftsman:auto-go to launch x.goal.txt")).toBe(true);
    const go = await t.command.run({ command: "craftsman:auto-go", args: "" });
    expect(go.text).toBe("/goal Deliver x.");
  });

  test("a goal file older than the session never launches", { plugins: [engine] }, async (t) => {
    const log = await turn(t, "no-goal-file");
    expect(log.some((l) => l.goal || l.submit)).toBe(false);
  });

  test("the band shows plan, unit, tracker % and context %; the sample goes to telemetry.mjs", { plugins: [engine] }, async (t) => {
    const log = await turn(t, "no-goal-file");
    expect(log.filter((l) => l.status).pop().status).toBe("craftsman · p · u2 · tracker 50% · ctx 2.5%");
    const run = log.find((l) => l.run).run;
    const argv = Array.isArray(run) ? run : run.argv;
    expect(argv[1].endsWith("/scripts/telemetry.mjs")).toBe(true);
    expect(argv.slice(2)).toEqual(["--sid", "sid1", "--tokens", "5000", "--percent", "2.5", "--cost", "0.1", "--unit", "u2"]);
  });
});
