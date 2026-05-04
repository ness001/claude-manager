// Plugin-loading orchestrator — see spec §6.1, §6.4, §10 (refresh).
//
// Pipeline:
//   1. Read `~/.claude/plugins/installed_plugins.json` (raw string via Rust).
//   2. Read `~/.claude/settings.json` (raw string via Rust); extract
//      `enabledPlugins` map.
//   3. For each `name@marketplace` registry key, iterate the installation
//      array; for each installation, check `installPath` existence on disk
//      (Tauri `fs.exists`) and derive `PluginState` per spec §6.4.
//   4. For each `enabledPlugins` key NOT in the registry, emit a single
//      orphaned `PluginMeta`.
//   5. Sort by name.
//
// `loadPluginDetail(plugin)` calls the Rust `read_plugin_contents` IPC and
// merges its return into a `PluginDetail`.
//
// `update-available` state is set later by T3.4 (git ls-remote comparison).

import { invoke } from "@tauri-apps/api/core";
import { exists } from "@tauri-apps/plugin-fs";

import type {
  AgentInfo,
  HookInfo,
  PluginDetail,
  PluginMeta,
  PluginState,
  SkillInfo,
} from "./plugin-types";

/** Wire shape of one installation entry inside `installed_plugins.json`. */
export interface RegistryInstallation {
  scope?: string;
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt?: string;
  lastUpdated?: string;
  gitCommitSha?: string;
}

/** Top-level shape of `installed_plugins.json`. */
export interface InstalledPluginsFile {
  version?: number;
  plugins?: Record<string, RegistryInstallation[]>;
}

/** Wire shape returned by the Rust `read_plugin_contents` IPC. */
export interface PluginContentsWire {
  skills: SkillInfo[];
  agents: AgentInfo[];
  hooks: HookInfo[];
  hasClaudeMd: boolean;
  manifestName: string;
  manifestDescription: string;
}

/** Split `"<name>@<marketplace>"` into its parts. Tolerates `@` in name
 *  by treating the LAST `@` as the separator. */
function splitRegistryKey(key: string): { name: string; marketplace: string } {
  const at = key.lastIndexOf("@");
  if (at < 0) return { name: key, marketplace: "" };
  return { name: key.slice(0, at), marketplace: key.slice(at + 1) };
}

/** Best-effort JSON parse — never throws. */
function parseJsonOr<T>(text: string, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Extract `enabledPlugins` map from raw settings.json text. */
export function extractEnabledPlugins(
  settingsText: string,
): Record<string, boolean> {
  interface SettingsShape {
    enabledPlugins?: Record<string, boolean>;
  }
  const parsed = parseJsonOr<SettingsShape>(settingsText, {});
  return parsed.enabledPlugins ?? {};
}

/** Per spec §6.4 — see header for state derivation. `installPath` may be
 *  unchecked (callers pass already-resolved booleans). */
export function derivePluginState(args: {
  inRegistry: boolean;
  enabled: boolean;
  pathExists: boolean;
}): PluginState {
  if (!args.inRegistry) return "orphaned";
  if (!args.pathExists) return "broken";
  return args.enabled ? "active" : "disabled";
}

/** Top-level entrypoint — returns `PluginMeta[]` sorted by name. */
export async function loadPlugins(): Promise<PluginMeta[]> {
  const [registryText, settingsText] = await Promise.all([
    invoke<string>("read_installed_plugins"),
    invoke<string>("read_settings_enabled_plugins"),
  ]);

  const registry = parseJsonOr<InstalledPluginsFile>(registryText, {});
  const enabledMap = extractEnabledPlugins(settingsText);
  const plugins = registry.plugins ?? {};
  const out: PluginMeta[] = [];

  // 1. One PluginMeta per installation array element.
  for (const [key, installations] of Object.entries(plugins)) {
    if (!Array.isArray(installations)) continue;
    const { name, marketplace } = splitRegistryKey(key);
    const enabled = enabledMap[key] === true;

    for (const inst of installations) {
      const pathExists = await safeExists(inst.installPath);
      const state = derivePluginState({
        inRegistry: true,
        enabled,
        pathExists,
      });
      const sha = inst.gitCommitSha ?? "";
      out.push({
        name,
        marketplace,
        version: inst.version ?? "",
        gitCommitSha: sha,
        // Description requires reading manifest from disk; defer to detail
        // load. List view shows "" until detail is fetched. (Spec §6.5.)
        description: "",
        installPath: inst.installPath,
        state,
        skillCount: 0,
        agentCount: 0,
        hookCount: 0,
        hasClaudeMd: false,
      });
    }
  }

  // 2. Orphaned entries — enabled keys not present in registry.
  for (const key of Object.keys(enabledMap)) {
    if (key in plugins) continue;
    if (enabledMap[key] !== true) continue;
    const { name, marketplace } = splitRegistryKey(key);
    out.push({
      name,
      marketplace,
      version: "",
      gitCommitSha: "",
      description: "",
      installPath: "",
      state: "orphaned",
      skillCount: 0,
      agentCount: 0,
      hookCount: 0,
      hasClaudeMd: false,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Fetch directory contents for a single plugin. */
export async function loadPluginDetail(
  plugin: PluginMeta,
): Promise<PluginDetail> {
  if (!plugin.installPath) {
    return { ...plugin, skills: [], agents: [], hooks: [] };
  }
  const wire = await invoke<PluginContentsWire>("read_plugin_contents", {
    installPath: plugin.installPath,
  });
  const description = wire.manifestDescription || plugin.description;
  return {
    ...plugin,
    description,
    skills: wire.skills,
    agents: wire.agents,
    hooks: wire.hooks,
    hasClaudeMd: wire.hasClaudeMd,
    skillCount: wire.skills.length,
    agentCount: wire.agents.length,
    hookCount: wire.hooks.length,
  };
}

/** `exists` swallows any FS error so a single broken path doesn't poison
 *  the scan. */
async function safeExists(path: string): Promise<boolean> {
  if (!path) return false;
  try {
    return await exists(path);
  } catch {
    return false;
  }
}
