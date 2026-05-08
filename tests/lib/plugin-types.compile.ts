// Compile-time smoke for plugin-types — referenced by plugin-types.test.ts
// (plan T3.1 case 1). Importing this module is enough to assert that the
// type names below resolve.

import type {
  AgentInfo,
  HookInfo,
  PluginDetail,
  PluginMeta,
  PluginState,
  SkillInfo,
} from "../../src/lib/plugin-types";

// Construct minimal values of each exported shape so any rename or
// signature drift surfaces as a compile error.
const _state: PluginState = "active";

const _skill: SkillInfo = { name: "s", description: "d" };

const _agent: AgentInfo = { name: "a", description: "d" };

const _hook: HookInfo = { event: "SessionStart", command: "echo" };

const _meta: PluginMeta = {
  name: "n",
  marketplace: "m",
  version: "0.0.0",
  gitCommitSha: "0".repeat(40),
  description: "d",
  installPath: "/p",
  state: _state,
  skillCount: 0,
  agentCount: 0,
  hookCount: 0,
  hasClaudeMd: false,
};

const _detail: PluginDetail = {
  ..._meta,
  skills: [_skill],
  agents: [_agent],
  hooks: [_hook],
};

// Re-export so the importing test sees a value (not a type-only import
// that gets tree-shaken before the type checker runs).
export const PLUGIN_TYPES_COMPILE_OK = true as const;
export type Constructed = typeof _detail;
