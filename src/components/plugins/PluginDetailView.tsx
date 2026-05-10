// Tabbed plugin detail page — see spec §6.6. Header: name + marketplace +
// version + status + Open in File Browser / Open in VS Code actions.
// Body: Skills / Agents / Hooks tabs.

import { useId, useRef, useState } from "react";
import { ExternalLink, FolderOpen } from "lucide-react";
import { open as openShell } from "@tauri-apps/plugin-shell";

import type { PluginDetail } from "../../lib/plugin-types";
import { PluginSkillsTab } from "./PluginSkillsTab";
import { PluginAgentsTab } from "./PluginAgentsTab";
import { PluginHooksTab } from "./PluginHooksTab";

type Tab = "skills" | "agents" | "hooks";

const TABS: Tab[] = ["skills", "agents", "hooks"];

interface PluginDetailViewProps {
  plugin: PluginDetail;
}

/**
 * Roving-tabindex keyboard handler for an ARIA tablist (matching the
 * WAI-ARIA APG tabs pattern, automatic-activation flavor). Mirrors the
 * implementation in `ActivityChart` (PR #97) and `ViewModeToggle` (PR #94).
 */
function useTablistKeyboard<T>(
  values: ReadonlyArray<T>,
  onSelect: (v: T) => void,
) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusAndSelect = (idx: number) => {
    const wrapped = (idx + values.length) % values.length;
    const target = refs.current[wrapped];
    if (target) {
      target.focus();
      onSelect(values[wrapped]);
    }
  };
  const onKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAndSelect(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAndSelect(i + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAndSelect(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAndSelect(values.length - 1);
    }
  };
  return { refs, onKeyDown };
}

export function PluginDetailView({ plugin }: PluginDetailViewProps) {
  const [tab, setTab] = useState<Tab>("skills");
  const tabKb = useTablistKeyboard(TABS, setTab);
  // Stable per-instance ids so each tab button can be linked by aria-controls
  // to its tabpanel and each panel can be linked back via aria-labelledby.
  const idBase = useId();
  const tabId = (t: Tab) => `${idBase}-tab-${t}`;
  const panelId = (t: Tab) => `${idBase}-panel-${t}`;

  const openInFileBrowser = async () => {
    try {
      await openShell(plugin.installPath);
    } catch (err) {
      console.error("Failed to open install path:", err);
    }
  };
  const openInVsCode = async () => {
    try {
      // The vscode://file/ URI scheme is RFC 3986; Windows paths like
      // "C:\Users\..." must use forward slashes, otherwise VS Code's URI
      // handler rejects them and the open silently no-ops.
      const uriPath = plugin.installPath.replace(/\\/g, "/");
      await openShell(`vscode://file/${uriPath}`);
    } catch (err) {
      console.error("Failed to open in VS Code:", err);
    }
  };

  return (
    <section
      data-testid="plugin-detail-view"
      className="flex h-full flex-col gap-4 p-6"
    >
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-xl font-semibold text-text-primary">
              {plugin.name}
            </h2>
            <div className="text-xs text-text-muted">
              {plugin.marketplace} · v{plugin.version} · {plugin.state}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="open-folder-btn"
              onClick={() => {
                void openInFileBrowser();
              }}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              <FolderOpen size={14} aria-hidden="true" />
              Open in File Browser
            </button>
            <button
              type="button"
              data-testid="open-vscode-btn"
              onClick={() => {
                void openInVsCode();
              }}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              <ExternalLink size={14} aria-hidden="true" />
              Open in VS Code
            </button>
          </div>
        </div>
        <p className="text-sm text-text-secondary">{plugin.description}</p>
      </header>

      <nav
        data-testid="tab-bar"
        className="flex gap-2 border-b border-border"
        role="tablist"
      >
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={tabId(t)}
            aria-selected={tab === t}
            aria-controls={panelId(t)}
            tabIndex={tab === t ? 0 : -1}
            ref={(el) => {
              tabKb.refs.current[i] = el;
            }}
            onKeyDown={(e) => tabKb.onKeyDown(e, i)}
            data-testid={`tab-${t}`}
            onClick={() => setTab(t)}
            className={[
              "px-3 py-1.5 text-sm capitalize",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              tab === t
                ? "border-b-2 border-accent text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {t} (
            {t === "skills"
              ? plugin.skills.length
              : t === "agents"
              ? plugin.agents.length
              : plugin.hooks.length}
            )
          </button>
        ))}
      </nav>

      <div
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        data-testid={`tabpanel-${tab}`}
        className="flex-1 overflow-auto"
      >
        {tab === "skills" && <PluginSkillsTab skills={plugin.skills} />}
        {tab === "agents" && <PluginAgentsTab agents={plugin.agents} />}
        {tab === "hooks" && <PluginHooksTab hooks={plugin.hooks} />}
      </div>
    </section>
  );
}
