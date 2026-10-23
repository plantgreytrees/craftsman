// Machine-wide plugin options (plugin.json userConfig) reach hooks as
// CLAUDE_PLUGIN_OPTION_<KEY>. applyUserConfig layers them over the plugin
// defaults; project config files are merged after, so a project always wins.
// MODELTIER is reserved: accepted, maps to nothing yet.
const KNOBS = {
  AUTONOMYLEVEL: { path: ["repoExec", "approval", "prLines"], map: { attended: 100, standard: 400, unattended: 1000 } },
  REVIEWDEPTH: { path: ["planning", "blindRederivation"], map: { light: "never", standard: "auto", deep: "always" } },
  BUDGETSENFORCE: { path: ["docs", "budgets", "enforce"], map: { true: true, false: false } },
};

export function applyUserConfig(defaults, env = process.env) {
  const out = structuredClone(defaults);
  for (const [key, knob] of Object.entries(KNOBS)) {
    const raw = env?.[`CLAUDE_PLUGIN_OPTION_${key}`];
    if (typeof raw !== "string" || !Object.hasOwn(knob.map, raw)) continue;
    let node = out;
    for (const part of knob.path.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== "object") node[part] = {};
      node = node[part];
    }
    node[knob.path.at(-1)] = knob.map[raw];
  }
  return out;
}
