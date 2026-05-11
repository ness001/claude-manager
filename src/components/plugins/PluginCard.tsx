// Plugin row for the list view — see spec §6.4 (state colors), §6.5 (card
// layout). Status dot + name + marketplace + truncated description + version
// pill + component counts + enable/disable toggle. Broken plugins get a red
// border and Reinstall/Remove buttons; disabled plugins render at 70% opacity.
//
// Toggle and Reinstall/Remove call the store; this component is presentational
// otherwise.

import { usePluginStore } from "../../stores/plugin-store";
import type { PluginMeta, PluginState } from "../../lib/plugin-types";

interface PluginCardProps {
  plugin: PluginMeta;
  selected: boolean;
}

/** Status-dot color per spec §6.4. */
const STATUS_COLOR: Record<PluginState, string> = {
  active: "bg-status-green",
  disabled: "bg-text-muted",
  broken: "bg-status-red",
  orphaned: "bg-status-yellow",
  "update-available": "bg-status-amber",
};

/** SR label for the status dot — color alone is insufficient (WCAG 1.4.1). */
const STATUS_LABEL: Record<PluginState, string> = {
  active: "Active",
  disabled: "Disabled",
  broken: "Broken",
  orphaned: "Orphaned",
  "update-available": "Update available",
};

/** Truncate a single-line description to keep card height fixed. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export function PluginCard({ plugin, selected }: PluginCardProps) {
  const selectPlugin = usePluginStore((s) => s.selectPlugin);
  const togglePlugin = usePluginStore((s) => s.togglePlugin);

  const dotClass = STATUS_COLOR[plugin.state];
  const isBroken = plugin.state === "broken";
  const isDisabled = plugin.state === "disabled";
  const isUpdateAvailable = plugin.state === "update-available";

  // Toggle is meaningful only for active/disabled (and update-available which
  // is a flavored "active"). Broken / orphaned can't be flipped without first
  // reinstalling — disable the switch.
  const toggleDisabled = isBroken || plugin.state === "orphaned";
  const toggleOn = plugin.state === "active" || isUpdateAvailable;

  return (
    <div
      data-testid="plugin-card"
      data-plugin-key={`${plugin.name}@${plugin.marketplace}`}
      data-state={plugin.state}
      data-selected={selected ? "true" : "false"}
      className={[
        "flex flex-col gap-2 rounded-md border p-3",
        isBroken
          ? "border-status-red/60 bg-card-bg"
          : selected
          ? "border-accent/40 bg-sidebar-active"
          : "border-border bg-card-bg hover:bg-bg-tertiary",
        isDisabled ? "opacity-70" : "",
      ].join(" ")}
    >
      <button
        type="button"
        data-testid="plugin-card-body"
        onClick={() => {
          void selectPlugin(plugin);
        }}
        className="flex w-full flex-col items-start gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="flex w-full items-center gap-2">
          <span
            role="img"
            aria-label={STATUS_LABEL[plugin.state]}
            data-testid="status-dot"
            className={`inline-block h-2 w-2 rounded-full shrink-0 ${dotClass}`}
          />
          <span
            className="truncate text-sm font-medium text-text-primary"
            title={plugin.name}
          >
            {plugin.name}
          </span>
          <span
            data-testid="version-pill"
            className="ml-auto rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary"
          >
            {plugin.version}
          </span>
          {isUpdateAvailable && (
            <span
              data-testid="update-pill"
              className="rounded bg-status-amber/20 px-1.5 py-0.5 text-[10px] font-medium text-status-amber"
            >
              Update
            </span>
          )}
        </div>

        <div className="text-[11px] text-text-muted">{plugin.marketplace}</div>

        <p className="line-clamp-2 text-xs text-text-secondary">
          {truncate(plugin.description, 120)}
        </p>

        <div className="flex gap-2 text-[10px] text-text-muted">
          <span data-testid="skill-count">{plugin.skillCount} skills</span>
          <span data-testid="agent-count">{plugin.agentCount} agents</span>
          <span data-testid="hook-count">{plugin.hookCount} hooks</span>
        </div>
      </button>

      {isBroken && (
        <div data-testid="broken-warning" className="flex flex-col gap-1">
          <div className="text-[11px] text-status-red">
            Files missing at install path. Reinstall or remove this plugin.
          </div>
          <div className="flex gap-2">
            {/* TODO(ui-defect-sweep#L293): wire Reinstall to a `claude plugins
              * install <name>` IPC. Tracked in
              * docs/superpowers/plans/2026-05-08-ui-defect-sweep.md (the
              * Reinstall checkbox is currently marked done because the stub
              * was deemed acceptable until the IPC ships, but the underlying
              * IPC work is still outstanding). Per CLAUDE.md R2 (Orphan-
              * placeholder rule), every disabled stub must declare its
              * wire-up tracker inline so the placeholder isn't an
              * undiscoverable orphan. */}
            <button
              type="button"
              data-testid="reinstall-btn"
              disabled
              title="Reinstall is not yet wired — run `claude plugin install` from the terminal for now"
              className="cursor-not-allowed rounded border border-border px-2 py-1 text-[11px] text-text-secondary opacity-50"
            >
              Reinstall
            </button>
            {/* TODO(ui-defect-sweep#L294): wire Remove to a `claude plugins
              * uninstall <name>` IPC. Tracked in
              * docs/superpowers/plans/2026-05-08-ui-defect-sweep.md ("Remove
              * button has no onClick handler"). Per CLAUDE.md R2. */}
            <button
              type="button"
              data-testid="remove-btn"
              disabled
              title="Remove is not yet wired — run `claude plugin uninstall` from the terminal for now"
              className="cursor-not-allowed rounded border border-border px-2 py-1 text-[11px] text-text-secondary opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={toggleOn}
          aria-label={toggleOn ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
          data-testid="enable-toggle"
          disabled={toggleDisabled}
          onClick={(e) => {
            e.stopPropagation();
            void togglePlugin(plugin);
          }}
          className={[
            "relative h-4 w-7 rounded-full transition-colors",
            // Focus-visible ring with offset: when toggleOn the bar is itself
            // accent-purple, so a plain accent ring would be invisible. The
            // offset breaks the ring off the bar edge against the surrounding
            // surface (mirrors #117 / #118 / #119 — same `ring-offset-bg-primary`
            // token they validated).
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
            toggleOn ? "bg-accent" : "bg-border-strong",
            toggleDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all",
              toggleOn ? "left-3.5" : "left-0.5",
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}
