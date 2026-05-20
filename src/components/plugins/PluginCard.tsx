// Plugin row for the list view — see spec §6.4 (state colors), §6.5 (card
// layout). Status dot + name + marketplace + truncated description + version
// pill + component counts + enable/disable toggle. Broken plugins get a red
// border and Reinstall/Remove buttons; disabled plugins render at 70% opacity.
//
// Toggle and Reinstall/Remove call the store; this component is presentational
// otherwise.

import { useEffect, useRef, useState } from "react";

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
  // WCAG 1.4.11 (Non-text Contrast): the status dot is a 2x2 (8px)
  // circle. The original `bg-status-yellow` (#eab308) on the white
  // card-bg in light mode gives only ~1.6:1 contrast — well below the
  // 3:1 floor for graphical UI components. Sighted users in light mode
  // saw what was effectively an invisible dot for the only visual cue
  // distinguishing an orphaned plugin from a disabled one. SR users
  // get the info via the dot's own aria-label ("Orphaned"), but the
  // visible signal is gone. Swap to `bg-status-amber` (#d97706 light
  // / #fab387 dark) — already this codebase's "warning" semantic
  // color, used by the sibling `update-available` state below and by
  // PRs #293 (ActivityChart staleness banner), #294 (SystemHealth
  // warn dot), and #295 (SessionCard orphaned dot). On white that
  // gives ~3.36:1, comfortably above the 3:1 floor.
  orphaned: "bg-status-amber",
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
  const installPlugin = usePluginStore((s) => s.installPlugin);
  const uninstallPlugin = usePluginStore((s) => s.uninstallPlugin);
  const removeOrphaned = usePluginStore((s) => s.removeOrphaned);

  // Toggle-error surface. `togglePlugin` re-throws on `write_plugin_enabled`
  // failure (settings.json read-only / EACCES / IPC sandbox denial), but
  // PluginCard previously fired-and-forgot via `void togglePlugin(...)` —
  // the optimistic state flip rolled back invisibly and the user got no
  // signal *why* their toggle "didn't take." Mirrors the silent-failure
  // family fixed in PR #91 (SkillCard openInVsCode), PR #299
  // (AssistantMessage link), and SessionInfoBar's openError pattern.
  const [toggleError, setToggleError] = useState<string | null>(null);

  const dotClass = STATUS_COLOR[plugin.state];
  const isBroken = plugin.state === "broken";
  const isDisabled = plugin.state === "disabled";
  const isUpdateAvailable = plugin.state === "update-available";
  const isOrphaned = plugin.state === "orphaned";

  const [isBusy, setIsBusy] = useState(false);
  const onReinstall = async () => {
    setIsBusy(true);
    try {
      // Reinstall = same `claude plugins install` codepath. The CLI is
      // idempotent enough to repair a broken on-disk layout; if it can't,
      // the failure streams into the Plugins log window.
      await installPlugin(plugin.name);
    } finally {
      setIsBusy(false);
    }
  };
  const onRemoveBroken = async () => {
    if (!window.confirm(`Remove ${plugin.name}? This runs \`claude plugins uninstall\`.`)) {
      return;
    }
    setIsBusy(true);
    try {
      await uninstallPlugin(plugin);
    } finally {
      setIsBusy(false);
    }
  };
  const onRemoveOrphaned = async () => {
    setIsBusy(true);
    try {
      // Per spec §6.7: orphaned removal is config cleanup, not an
      // uninstall — no confirm dialog.
      await removeOrphaned(plugin);
    } finally {
      setIsBusy(false);
    }
  };

  // WAI-ARIA Toolbar pattern keyboard model for the broken-plugin
  // Reinstall/Remove pair — roving tabindex + ArrowLeft/Right + Home/End.
  // Without this, declaring role="toolbar" on the recovery actions row was
  // a false promise: SR users hearing "toolbar, Reinstall, button"
  // expected arrow-key nav and got nothing, and sighted keyboard users
  // had to Tab through both buttons instead of skipping the toolbar as a
  // unit. Same defect class as PR #317 (SessionInfoBar action toolbar)
  // and PR #316 (ViewModeToggle radiogroup) — declaring an ARIA pattern
  // role commits you to its keyboard model. Hooks unconditionally so
  // they don't violate the rules-of-hooks even when isBroken is false.
  const recoveryRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [recoveryTabStop, setRecoveryTabStop] = useState(0);
  // The broken-actions row always has exactly two buttons (Reinstall,
  // Remove); the clamp guards against any future addition/removal so the
  // tab stop never points past the end.
  const RECOVERY_COUNT = 2;
  useEffect(() => {
    setRecoveryTabStop((i) => Math.min(i, RECOVERY_COUNT - 1));
  }, []);
  const focusRecoveryAt = (idx: number) => {
    const wrapped = (idx + RECOVERY_COUNT) % RECOVERY_COUNT;
    const target = recoveryRefs.current[wrapped];
    if (target) {
      target.focus();
      setRecoveryTabStop(wrapped);
    }
  };
  const onRecoveryKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusRecoveryAt(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusRecoveryAt(i + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusRecoveryAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusRecoveryAt(RECOVERY_COUNT - 1);
    }
  };

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
        // WCAG 4.1.2 (Name, Role, Value): the visual selection state is
        // conveyed only by accent border + sidebar-active background.
        // SR users navigating the plugin list have no way to tell which
        // card is currently selected — they hear the same name/version
        // sequence for every card. Mirror SessionCard (line 78) by
        // exposing `aria-current="true"` when selected so AT announces
        // "current item" and the rotor's per-card iteration surfaces
        // the active selection. `undefined` (not "false") matches the
        // SessionCard convention and avoids cluttering the SR
        // announcement on the N-1 unselected cards.
        aria-current={selected ? "true" : undefined}
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
            // WCAG 4.1.2 (Name, Role, Value): the visible text is a bare
            // version string ("1.2.3") — SR users hear it as an opaque
            // token with no semantic context (build number? patch level?
            // protocol version?). Sighted users infer "version" from the
            // pill's right-aligned position next to the plugin name.
            // Mirror that into the accessible name with a "Version: …"
            // prefix. Same pattern as PR #246/#247 model badges and PR
            // #250 message-count badge.
            aria-label={`Version: ${plugin.version}`}
            className="ml-auto rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary"
          >
            {plugin.version}
          </span>
          {isUpdateAvailable && (
            <span
              data-testid="update-pill"
              // WCAG 4.1.2 (Name, Role, Value): the visible text is just
              // "Update" — SR users hear an opaque token that could
              // plausibly be a button command, a section label, or a
              // count. Sighted users infer "update available" from the
              // amber pill placement next to the version. Mirror that
              // into the accessible name. Same pattern as the
              // version-pill above (line 114) and the model / messages /
              // entrypoint / state badges (PRs #247/#250/#252/#271).
              aria-label="Update available"
              className="rounded bg-status-amber/20 px-1.5 py-0.5 text-[10px] font-medium text-status-amber"
            >
              Update
            </span>
          )}
        </div>

        {/* WCAG 4.1.2 (Name, Role, Value): the visible text is a bare
          * marketplace identifier ("official", "community", a vendor slug)
          * — SR users hear it as an opaque token between the plugin name
          * and the description, with no clue what dimension it describes
          * (could plausibly be a tag, an author, a category). Sighted
          * users infer "marketplace" from layout convention. Mirror that
          * into the accessible name with a "Marketplace: …" prefix. Same
          * pattern as the version-pill above (line 114) and the model /
          * messages / entrypoint / state badges (PRs #247/#250/#252/#271). */}
        <div
          data-testid="marketplace-label"
          aria-label={`Marketplace: ${plugin.marketplace}`}
          className="text-[11px] text-text-muted"
        >
          {plugin.marketplace}
        </div>

        <p
          // Plugin descriptions are double-clipped: JS `truncate(_, 120)`
          // first, then CSS `line-clamp-2` on top — the user-visible string
          // is whichever bound hits first. Without `title`, sighted users
          // have no way to recover the hidden tail (the row is non-text-
          // selectable inside the parent <button>, and the detail pane is
          // multiple clicks away). Mirror the visible string into `title`
          // so hover surfaces the full description. Mirrors the
          // truncate+title family already applied to the plugin name (line
          // 100 above), SkillCard skill-path (PR #167), and
          // RecentSessions / SystemHealth (PRs #170/#171/#175/#176/#179).
          // Use the *original* description (not the JS-truncated one) so
          // hover always shows the complete text.
          title={plugin.description}
          data-testid="plugin-description"
          className="line-clamp-2 text-xs text-text-secondary"
        >
          {truncate(plugin.description, 120)}
        </p>

        <div className="flex gap-2 text-[10px] text-text-muted">
          {/* Pluralize each count so SR users (and sighted users) don't see
            * "1 skills" / "1 agents" / "1 hooks". Mirrors PR #87 (SessionCard),
            * PR #90 (SystemHealth MCP row), PR #133 (RecentSessions). */}
          <span data-testid="skill-count">
            {plugin.skillCount} {plugin.skillCount === 1 ? "skill" : "skills"}
          </span>
          <span data-testid="agent-count">
            {plugin.agentCount} {plugin.agentCount === 1 ? "agent" : "agents"}
          </span>
          <span data-testid="hook-count">
            {plugin.hookCount} {plugin.hookCount === 1 ? "hook" : "hooks"}
          </span>
        </div>
      </button>

      {isBroken && (
        <div data-testid="broken-warning" className="flex flex-col gap-1">
          <div className="text-[11px] text-status-red">
            Files missing at install path. Reinstall or remove this plugin.
          </div>
          {/* WAI-ARIA Toolbar pattern: the Reinstall + Remove pair is a
            * related control group operating on the same broken plugin.
            * Without role="toolbar" + a plugin-scoped accessible name, SR
            * users navigating a list of broken plugins hear identical
            * "Reinstall, button … Remove, button" pairs with no way to
            * tell which plugin each belongs to. Embedding plugin.name in
            * the toolbar label gives unique landmark names per card.
            * Mirrors PR #246 (SessionInfoBar) and PR #248 (McpServerCard). */}
          <div
            role="toolbar"
            aria-label={`Recovery actions for ${plugin.name}`}
            data-testid="plugin-broken-actions-toolbar"
            className="flex gap-2"
          >
            {/* Spec §6.7 — broken-card Reinstall is now wired to
              * `claude plugins install <name>` via the store. CLI output
              * streams into the Plugins log window. */}
            <button
              ref={(el) => {
                recoveryRefs.current[0] = el;
              }}
              type="button"
              data-testid="reinstall-btn"
              disabled={isBusy}
              aria-busy={isBusy}
              tabIndex={recoveryTabStop === 0 ? 0 : -1}
              onFocus={() => setRecoveryTabStop(0)}
              onKeyDown={(e) => onRecoveryKeyDown(e, 0)}
              onClick={() => {
                void onReinstall();
              }}
              aria-label={`Reinstall ${plugin.name}`}
              title="Reinstall via the Claude CLI"
              className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {isBusy ? "Working…" : "Reinstall"}
            </button>
            {/* Spec §6.7 — broken-card Remove is now wired to
              * `claude plugins uninstall <key>` via the store, gated by
              * a confirm() dialog. */}
            <button
              ref={(el) => {
                recoveryRefs.current[1] = el;
              }}
              type="button"
              data-testid="remove-btn"
              disabled={isBusy}
              aria-busy={isBusy}
              tabIndex={recoveryTabStop === 1 ? 0 : -1}
              onFocus={() => setRecoveryTabStop(1)}
              onKeyDown={(e) => onRecoveryKeyDown(e, 1)}
              onClick={() => {
                void onRemoveBroken();
              }}
              aria-label={`Remove ${plugin.name}`}
              title="Remove via the Claude CLI"
              className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {isOrphaned && (
        <div data-testid="orphaned-warning" className="flex flex-col gap-1">
          <div className="text-[11px] text-status-amber">
            Listed in settings.json but not installed. Remove the stale entry.
          </div>
          <div>
            <button
              type="button"
              data-testid="orphaned-remove-btn"
              disabled={isBusy}
              aria-busy={isBusy}
              onClick={() => {
                void onRemoveOrphaned();
              }}
              aria-label={`Remove orphaned entry for ${plugin.name}`}
              title="Remove the stale entry from settings.json"
              className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {isBusy ? "Working…" : "Remove"}
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
            setToggleError(null);
            void togglePlugin(plugin).catch((err: unknown) => {
              setToggleError(err instanceof Error ? err.message : String(err));
            });
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
      {toggleError !== null && (
        <p
          data-testid="toggle-error"
          role="alert"
          className="text-xs text-status-red"
        >
          Couldn't toggle: {toggleError}
        </p>
      )}
    </div>
  );
}
