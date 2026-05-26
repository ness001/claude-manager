// Tabbed plugin detail page — see spec §6.6. Header: name + marketplace +
// version + status + Open in File Browser / Open in VS Code actions.
// Body: Skills / Agents / Hooks tabs.

import { useId, useRef, useState } from "react";
import { ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { open as openShell } from "@tauri-apps/plugin-shell";

import type { PluginDetail } from "../../lib/plugin-types";
import { usePluginStore } from "../../stores/plugin-store";
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
  const uninstallPlugin = usePluginStore((s) => s.uninstallPlugin);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [uninstallError, setUninstallError] = useState<string | null>(null);
  // Stable per-instance ids so each tab button can be linked by aria-controls
  // to its tabpanel and each panel can be linked back via aria-labelledby.
  const idBase = useId();
  const tabId = (t: Tab) => `${idBase}-tab-${t}`;
  const panelId = (t: Tab) => `${idBase}-panel-${t}`;

  // Surface failures inline. `openShell` rejects when the install path is
  // missing (broken plugin), the OS has no handler for the URI scheme
  // (VS Code not installed → vscode:// has no registered handler), or the
  // Tauri shell allowlist forbids the path. Previously these failures were
  // only `console.error`'d — the user clicked Open in File Browser / VS
  // Code, nothing happened, and they had no idea why. Mirrors SkillCard
  // and SessionInfoBar `openError` patterns.
  const [openError, setOpenError] = useState<string | null>(null);

  const openInFileBrowser = async () => {
    setOpenError(null);
    try {
      await openShell(plugin.installPath);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    }
  };
  const openInVsCode = async () => {
    setOpenError(null);
    try {
      // The vscode://file/ URI scheme is RFC 3986; Windows paths like
      // "C:\Users\..." must use forward slashes, otherwise VS Code's URI
      // handler rejects them and the open silently no-ops.
      const uriPath = plugin.installPath.replace(/\\/g, "/");
      await openShell(`vscode://file/${uriPath}`);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    }
  };

  // Uninstall = `claude plugins uninstall <name>@<marketplace>` — the same
  // codepath the broken-card Remove uses on PluginCard, surfaced here so
  // active plugins also have an in-UI uninstall route (spec §6.7). Confirm
  // gates the CLI call because uninstall deletes the on-disk cache entry.
  const onUninstall = async () => {
    if (
      !window.confirm(
        `Uninstall ${plugin.name}? This runs \`claude plugins uninstall\` and removes the plugin from disk.`,
      )
    ) {
      return;
    }
    setUninstallError(null);
    setIsUninstalling(true);
    try {
      await uninstallPlugin(plugin);
    } catch (err) {
      setUninstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUninstalling(false);
    }
  };
  // Broken / orphaned plugins already expose their own Remove affordances on
  // PluginCard (spec §6.7); hiding the Uninstall button here keeps the
  // recovery path single-sourced and avoids two buttons doing slightly
  // different things on the same plugin.
  const canUninstall = plugin.state !== "broken" && plugin.state !== "orphaned";

  return (
    // WCAG 1.3.1 + WAI-ARIA APG: the detail-view <section> already wrapped
    // the panel but was unlabeled — the SR landmarks rotor surfaced an
    // anonymous "section" entry with no name. Bind aria-labelledby to the
    // visible <h2> (the plugin name) so users routing by landmarks
    // (NVDA D, JAWS R, VoiceOver rotor → Landmarks) jump to a region named
    // after the currently-shown plugin. Using `${idBase}-name` keeps the
    // id stable across re-renders and unique even if the layout ever
    // mounts more than one detail view. Mirrors PRs #266/#267/#268
    // (page-level region landmarks) and the dashboard sweep
    // (#262/#263/#264/#265).
    <section
      data-testid="plugin-detail-view"
      aria-labelledby={`${idBase}-name`}
      className="flex h-full flex-col gap-4 p-6"
    >
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex items-center justify-between gap-2">
          {/* `min-w-0` on the flex child unlocks `truncate` on the <h2>;
              without it the column is sized to the intrinsic name width,
              defeating truncation and pushing the right-side action buttons
              (Open in File Browser / Open in VS Code) off the visible row.
              The matching `title` lets sighted users hover to recover the
              hidden tail. Mirrors PR #225 (PluginAgentsTab name), #226
              (PluginSkillsTab name), #224 (McpServerCard name), #223
              (SkillCard name), and the broader truncation-recovery family
              (#167/#170/#171/#175 + PluginCard). */}
          <div className="flex min-w-0 flex-col">
            <h2
              id={`${idBase}-name`}
              data-testid="plugin-detail-name"
              title={plugin.name}
              className="truncate text-xl font-semibold text-text-primary"
            >
              {plugin.name}
            </h2>
            {/* WCAG 4.1.2 (Name, Role, Value): the metadata sub-line is
              * three values joined by visible middots (e.g. "official · v1.0.0
              * · active"). SR users hear them as one bare token stream with
              * no role context — each piece is opaque the same way standalone
              * marketplace / version / state badges were on PluginCard
              * (PRs #246/#247/#279). Sighted users infer the dimensions from
              * the layout convention (the "v" prefix on the middle, the
              * lowercase status on the right). Wrap each value in a span
              * carrying an aria-label that names its dimension; keep the
              * decorative middot separators aria-hidden so SR users don't
              * hear "middle dot" noise between values. The visible text and
              * layout are unchanged. */}
            <div className="text-xs text-text-muted">
              <span
                data-testid="plugin-detail-marketplace"
                aria-label={`Marketplace: ${plugin.marketplace}`}
              >
                {plugin.marketplace}
              </span>
              <span aria-hidden="true"> · </span>
              <span
                data-testid="plugin-detail-version"
                aria-label={`Version: ${plugin.version}`}
              >
                v{plugin.version}
              </span>
              <span aria-hidden="true"> · </span>
              <span
                data-testid="plugin-detail-state"
                aria-label={`State: ${plugin.state}`}
              >
                {plugin.state}
              </span>
            </div>
          </div>
          {/* WAI-ARIA Toolbar pattern: Open in File Browser + Open in VS
              Code form a related action group scoped to this plugin.
              `role="toolbar"` + `aria-label` lets SR users land on the
              group as a single landmark and arrow-key through the actions
              instead of tabbing one button at a time. The label is scoped
              by plugin name so multiple detail views can be navigated
              unambiguously via the SR rotor. Mirrors PR #246 (SessionInfoBar),
              #248 (McpServerCard), #249 (PluginCard), #253 (SkillCard). */}
          <div
            role="toolbar"
            aria-label={`Actions for ${plugin.name}`}
            data-testid="plugin-detail-actions-toolbar"
            className="flex gap-2"
          >
            <button
              type="button"
              data-testid="open-folder-btn"
              onClick={() => {
                void openInFileBrowser();
              }}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ExternalLink size={14} aria-hidden="true" />
              Open in VS Code
            </button>
            {canUninstall && (
              <button
                type="button"
                data-testid="detail-uninstall-btn"
                onClick={() => {
                  void onUninstall();
                }}
                disabled={isUninstalling}
                aria-busy={isUninstalling}
                aria-label={`Uninstall ${plugin.name}`}
                title="Uninstall via the Claude CLI"
                className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Trash2 size={14} aria-hidden="true" />
                {isUninstalling ? "Uninstalling…" : "Uninstall"}
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-text-secondary">{plugin.description}</p>
      </header>

      {openError !== null && (
        <p
          data-testid="plugin-open-error"
          role="alert"
          className="text-xs text-status-red"
        >
          Couldn't open: {openError}
        </p>
      )}
      {uninstallError !== null && (
        <p
          data-testid="plugin-uninstall-error"
          role="alert"
          className="text-xs text-status-red"
        >
          Uninstall failed: {uninstallError}
        </p>
      )}

      {/* WAI-ARIA Tabs Pattern: a tablist with multiple instances on a
          page (Plugins / Skills / MCP / Settings each have their own tab
          UIs) needs `aria-label` so the SR rotor can disambiguate them.
          Without it NVDA/VoiceOver announce three undifferentiated
          "tablist with 3 tabs" entries. The label is scoped by plugin
          name so multiple plugin detail views stay unambiguous. Mirrors
          the labeled-collection sweep (#235/#236/#237/#238/#239/#240/#254/#255/#257). */}
      <nav
        data-testid="tab-bar"
        className="flex gap-2 border-b border-border"
        role="tablist"
        aria-label={`${plugin.name} sections`}
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

      {/*
        WAI-ARIA Tabs Pattern: every tab in the tablist must reference its
        owning panel via aria-controls, and every IDREF must resolve to an
        element actually in the DOM. Previously we rendered a single
        tabpanel whose id was `panelId(tab)` (the *current* tab), so the
        two non-active tabs' aria-controls pointed at ids that did not
        exist anywhere — 2/3 dangling IDREFs at all times. NVDA / VoiceOver
        flag dangling IDREFs as invalid references or drop the disclosure
        relationship entirely. Same defect class as PR #189
        (ToolCallBlock) and PR #191 (McpServerCard); the chosen fix here
        differs because the WAI-ARIA Tabs Pattern explicitly recommends
        rendering all panels and toggling visibility via the `hidden`
        attribute (rather than conditionally mounting), so all three
        IDREFs always resolve.

        The three child tabs (PluginSkillsTab/Agents/Hooks) are pure
        presentational components with no useState / useEffect / fetch
        hooks, so always-mounting them costs nothing at runtime — verified
        via grep before adopting this approach.
      */}
      {TABS.map((t) => (
        <div
          key={t}
          role="tabpanel"
          id={panelId(t)}
          aria-labelledby={tabId(t)}
          data-testid={`tabpanel-${t}`}
          hidden={tab !== t}
          className="flex-1 overflow-auto"
        >
          {t === "skills" && <PluginSkillsTab skills={plugin.skills} />}
          {t === "agents" && <PluginAgentsTab agents={plugin.agents} />}
          {t === "hooks" && <PluginHooksTab hooks={plugin.hooks} />}
        </div>
      ))}
    </section>
  );
}
