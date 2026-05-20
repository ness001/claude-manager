// Source-of-Truth contract test for ~/.claude/settings.json
// (+ overlay ~/.claude/settings.local.json).
//
// Investigator: inv-settings-json-config (task #7)
//
// Loads BOTH fixture files, asserts the documented schema, applies the
// documented merge contract (shallow-merge-with-array-concat for
// permissions.{allow,deny}; key-by-key local-wins for enabledPlugins and
// env), and asserts the resulting effective state matches expectation.
//
// No mocks, no skipIf, no escape clauses — fixtures are the unit under test.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FIXTURES = path.join(__dirname, "fixtures");
const GLOBAL_PATH = path.join(FIXTURES, "settings-json-config.json");
const LOCAL_PATH = path.join(FIXTURES, "settings-local-json-config.json");

// Documented in docs/sources-of-truth/settings-json-config.yaml
const REGISTRY_KEY_REGEX =
  /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface PermissionsBlock {
  allow?: string[];
  deny?: string[];
}
interface SettingsShape {
  permissions?: PermissionsBlock;
  env?: Record<string, string>;
  enabledPlugins?: Record<string, boolean>;
  hooks?: Record<string, unknown>;
  model?: string;
  statusLine?: { type: string; command: string };
  extraKnownMarketplaces?: Record<string, unknown>;
  fastMode?: boolean;
  autoUpdatesChannel?: string;
  skipDangerousModePermissionPrompt?: boolean;
}

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

/**
 * Apply the merge contract documented in settings-json-config.yaml:
 *  - permissions.{allow,deny} arrays are CONCATENATED (global then local).
 *  - enabledPlugins is shallow-merged key-by-key (local wins per leaf).
 *  - env           is shallow-merged key-by-key (local wins per leaf).
 *  - All other top-level keys present in local REPLACE the global value.
 */
function mergeSettings(
  global: SettingsShape,
  local: SettingsShape,
): SettingsShape {
  const out: SettingsShape = { ...global, ...local };

  // permissions: deep-ish merge so allow/deny concatenate.
  if (global.permissions || local.permissions) {
    const g = global.permissions ?? {};
    const l = local.permissions ?? {};
    const merged: PermissionsBlock = {};
    if (g.allow || l.allow) merged.allow = [...(g.allow ?? []), ...(l.allow ?? [])];
    if (g.deny || l.deny) merged.deny = [...(g.deny ?? []), ...(l.deny ?? [])];
    out.permissions = merged;
  }

  // enabledPlugins: key-by-key, local leaf wins.
  if (global.enabledPlugins || local.enabledPlugins) {
    out.enabledPlugins = {
      ...(global.enabledPlugins ?? {}),
      ...(local.enabledPlugins ?? {}),
    };
  }

  // env: key-by-key, local leaf wins.
  if (global.env || local.env) {
    out.env = { ...(global.env ?? {}), ...(local.env ?? {}) };
  }

  return out;
}

describe("sources-of-truth: settings.json + settings.local.json", () => {
  const global = loadJson<SettingsShape>(GLOBAL_PATH);
  const local = loadJson<SettingsShape>(LOCAL_PATH);

  // -----------------------------------------------------------------------
  // Schema assertions on the GLOBAL file
  // -----------------------------------------------------------------------
  describe("settings.json (global) schema", () => {
    it("is a JSON object", () => {
      expect(typeof global).toBe("object");
      expect(global).not.toBeNull();
      expect(Array.isArray(global)).toBe(false);
    });

    it("permissions.allow is an array of strings", () => {
      expect(Array.isArray(global.permissions?.allow)).toBe(true);
      for (const p of global.permissions!.allow!) expect(typeof p).toBe("string");
      expect(global.permissions!.allow!.length).toBeGreaterThan(0);
    });

    it("permissions.deny is an array of strings when present", () => {
      expect(Array.isArray(global.permissions?.deny)).toBe(true);
      for (const p of global.permissions!.deny!) expect(typeof p).toBe("string");
    });

    it("env is a string→string map", () => {
      expect(global.env).toBeDefined();
      for (const [k, v] of Object.entries(global.env!)) {
        expect(typeof k).toBe("string");
        expect(typeof v).toBe("string");
      }
    });

    it("enabledPlugins keys match the <name>@<marketplace> regex", () => {
      expect(global.enabledPlugins).toBeDefined();
      const keys = Object.keys(global.enabledPlugins!);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key, `key "${key}" must match name@marketplace`).toMatch(
          REGISTRY_KEY_REGEX,
        );
        expect(typeof global.enabledPlugins![key]).toBe("boolean");
      }
    });

    it("hooks.Stop[].hooks[] entries have type='command' + command string", () => {
      const stop = (global.hooks as Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>> | undefined)?.Stop;
      expect(Array.isArray(stop)).toBe(true);
      for (const group of stop!) {
        for (const h of group.hooks) {
          expect(h.type).toBe("command");
          expect(typeof h.command).toBe("string");
        }
      }
    });

    it("skipDangerousModePermissionPrompt is a boolean when present", () => {
      expect(typeof global.skipDangerousModePermissionPrompt).toBe("boolean");
    });
  });

  // -----------------------------------------------------------------------
  // Schema assertions on the LOCAL overlay
  // -----------------------------------------------------------------------
  describe("settings.local.json (overlay) schema", () => {
    it("is a JSON object", () => {
      expect(typeof local).toBe("object");
      expect(local).not.toBeNull();
    });

    it("permissions.allow (if present) is an array of strings", () => {
      if (local.permissions?.allow) {
        expect(Array.isArray(local.permissions.allow)).toBe(true);
        for (const p of local.permissions.allow) expect(typeof p).toBe("string");
      }
    });

    it("enabledPlugins (if present) keys match the regex", () => {
      if (local.enabledPlugins) {
        for (const key of Object.keys(local.enabledPlugins)) {
          expect(key).toMatch(REGISTRY_KEY_REGEX);
          expect(typeof local.enabledPlugins[key]).toBe("boolean");
        }
      }
    });

    it("shares the same shape constraints as the global file", () => {
      // Every top-level key in local, if it also appears in global, must be
      // the same JSON type (object/array/scalar).
      for (const key of Object.keys(local) as Array<keyof SettingsShape>) {
        if (key in global) {
          const gt = Array.isArray(global[key]) ? "array" : typeof global[key];
          const lt = Array.isArray(local[key]) ? "array" : typeof local[key];
          expect(lt, `local.${String(key)} type must match global`).toBe(gt);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Merge contract — apply local on top of global per the documented rule
  // -----------------------------------------------------------------------
  describe("merge contract: local overlays global", () => {
    const effective = mergeSettings(global, local);

    it("concatenates permissions.allow (global first, local appended)", () => {
      const expected = [
        ...(global.permissions!.allow ?? []),
        ...(local.permissions!.allow ?? []),
      ];
      expect(effective.permissions!.allow).toEqual(expected);
      // Specifically: the patterns added in local appear at the end.
      const allow = effective.permissions!.allow!;
      expect(allow).toContain("Bash(cmd /c:*)");
      expect(allow).toContain("WebFetch(domain:docs.anthropic.com)");
      // And the global ones are still present (not replaced).
      expect(allow).toContain("Read(*)");
      expect(allow).toContain("mcp__*");
    });

    it("preserves global permissions.deny when local omits it", () => {
      expect(effective.permissions!.deny).toEqual(global.permissions!.deny);
      expect(effective.permissions!.deny).toContain("Bash(rm -rf /*)");
    });

    it("enabledPlugins is key-by-key merged; local wins per leaf", () => {
      const ep = effective.enabledPlugins!;
      // Global-only keys preserved.
      expect(ep["superpowers@claude-plugins-official"]).toBe(true);
      expect(ep["document-skills@anthropic-agent-skills"]).toBe(true);
      // Local flips ralph-loop from false → true.
      expect(global.enabledPlugins!["ralph-loop@claude-plugins-official"]).toBe(false);
      expect(local.enabledPlugins!["ralph-loop@claude-plugins-official"]).toBe(true);
      expect(ep["ralph-loop@claude-plugins-official"]).toBe(true);
    });

    it("env is preserved from global when local does not touch it", () => {
      expect(effective.env).toEqual(global.env);
      expect(effective.env!.ANTHROPIC_BASE_URL).toBe("https://api.anthropic.com");
    });

    it("scalar top-level keys not in local are preserved from global", () => {
      expect(effective.model).toBe("claude-opus-4-6");
      expect(effective.autoUpdatesChannel).toBe("latest");
      expect(effective.fastMode).toBe(true);
      expect(effective.skipDangerousModePermissionPrompt).toBe(false);
    });

    it("every effective enabledPlugins key still matches the regex", () => {
      for (const key of Object.keys(effective.enabledPlugins!)) {
        expect(key).toMatch(REGISTRY_KEY_REGEX);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Cross-reference assertions (what is NOT in this file)
  // -----------------------------------------------------------------------
  describe("cross-references: things that must NOT live here", () => {
    it("settings.json does not contain mcpServers (those live in ~/.claude.json)", () => {
      expect((global as Record<string, unknown>).mcpServers).toBeUndefined();
      expect((local as Record<string, unknown>).mcpServers).toBeUndefined();
    });

    it("settings.json does not contain primaryApiKey (lives in ~/.claude/config.json)", () => {
      expect((global as Record<string, unknown>).primaryApiKey).toBeUndefined();
      expect((local as Record<string, unknown>).primaryApiKey).toBeUndefined();
    });
  });
});
