// Plugin list page — see spec §6.5, §17.6, §17.7. Header (title + counts +
// "Install Plugin" hint button + "Check for Updates" button + search), body
// is a responsive grid of PluginCards.
//
// Update detection per spec §13: clicking "Check for Updates" calls
// `checkPluginUpdates`, which talks to the Rust IPC and merges the result
// back into the store via `setPlugins`.

import { useMemo, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";

import { filterPlugins, usePluginStore } from "../../stores/plugin-store";
import { checkPluginUpdates } from "../../lib/plugin-updates";
import { PluginCard } from "./PluginCard";

export function PluginListView() {
  const plugins = usePluginStore((s) => s.plugins);
  const searchQuery = usePluginStore((s) => s.searchQuery);
  const setSearchQuery = usePluginStore((s) => s.setSearchQuery);
  const selectedPlugin = usePluginStore((s) => s.selectedPlugin);
  const isLoading = usePluginStore((s) => s.isLoading);

  const [isChecking, setIsChecking] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterPlugins(plugins, searchQuery),
    [plugins, searchQuery],
  );

  const installedCount = plugins.length;
  const activeCount = plugins.filter(
    (p) => p.state === "active" || p.state === "update-available",
  ).length;
  const disabledCount = plugins.filter((p) => p.state === "disabled").length;

  const onCheckForUpdates = async () => {
    setIsChecking(true);
    setUpdateError(null);
    try {
      const refreshed = await checkPluginUpdates(plugins, { force: true });
      // Push the new state back into the store. We mirror the loadPlugins
      // shape so the cards re-render with `update-available` markers.
      usePluginStore.setState({ plugins: refreshed });
    } catch (err) {
      // Without this catch the rejection was silently swallowed by `void
      // onCheckForUpdates()` — the spinner stopped but the user got no
      // feedback that the check failed (registry down, IPC error, etc.).
      setUpdateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <section
      data-testid="plugin-list-view"
      className="flex h-full flex-col gap-4 p-6"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">Plugins</h1>
          <div className="flex gap-2">
            {/* TODO(ui-defect-sweep#L295): wire Install Plugin to a `claude
              * plugins install <name>` IPC. Tracked in
              * docs/superpowers/plans/2026-05-08-ui-defect-sweep.md ("Install
              * Plugin header button has no onClick handler"). Per CLAUDE.md
              * R2 (Orphan-placeholder rule), every disabled stub must
              * declare its wire-up tracker inline so the placeholder isn't
              * an undiscoverable orphan. */}
            <button
              type="button"
              data-testid="install-plugin-btn"
              disabled
              aria-disabled="true"
              // Sighted users see the long "Not yet wired …" tooltip on
              // hover; mirror the gist into the accessible name so
              // screen-reader users hear the same hint instead of just
              // "Install Plugin, button, dimmed" and assuming the app is
              // broken (WCAG 4.1.2). Mirrors PR #181 (QuickActions),
              // PR #183 (SessionListPanel new-session), PR #184
              // (SessionInfoBar actions).
              aria-label="Install Plugin (not yet wired — use the CLI)"
              title="Not yet wired — run `claude plugins install <name>` in your terminal for now"
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary opacity-50 cursor-not-allowed"
            >
              <Plus size={14} aria-hidden="true" />
              Install Plugin
            </button>
            <button
              type="button"
              data-testid="check-updates-btn"
              onClick={() => {
                void onCheckForUpdates();
              }}
              disabled={isChecking || plugins.length === 0}
              aria-busy={isChecking}
              // Sighted users see no tooltip when disabled — they have to
              // infer "no plugins to check" from the empty grid below.
              // Mirror the disabling reason into the accessible name +
              // tooltip so SR users + sighted users alike hear/see why
              // the button is grey instead of just "Check for Updates,
              // button, dimmed". Mirrors PR #181 (QuickActions),
              // PR #183 (SessionListPanel new-session), PR #184
              // (SessionInfoBar actions). The aria-busy already conveys
              // the in-flight case ("Checking…") so no aria-label is
              // needed for that state.
              aria-label={
                plugins.length === 0 && !isChecking
                  ? "Check for Updates (no plugins installed)"
                  : undefined
              }
              title={
                plugins.length === 0 && !isChecking
                  ? "No plugins installed"
                  : undefined
              }
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RefreshCw size={14} aria-hidden="true" className={isChecking ? "animate-spin" : ""} />
              {isChecking ? "Checking…" : "Check for Updates"}
            </button>
          </div>
        </div>
        {/* WCAG 1.3.1 (Info and Relationships) / 4.1.2 (Name, Role, Value):
            the three count spans rendered as flat siblings inside a non-
            semantic <div> give SR users zero collection structure — the
            rotor list view (NVDA "L", JAWS "L", VoiceOver rotor → Lists)
            doesn't surface them, and each bare span ("5 installed") is an
            opaque integer-with-unit string with no programmatic grouping.
            Promote to <ul aria-label="Plugin counts"> with one <li> per
            stat so the rotor announces "list, 3 items, Plugin counts"
            and each <li> gains an aria-label like "Installed: 5" so users
            navigating by smaller landmarks hear the dimension's role
            even when stepping past the parent context. Mirrors PR #235
            (SkillsListView), PR #236 (PluginListView grid promotion),
            PR #230 (SystemHealth indicators), and the opaque-badge
            sweep (#228/#247/#250/#252). CSS flex is element-agnostic —
            <ul>/<li> with `display: flex` lay out identically. */}
        <ul
          data-testid="plugin-stats-list"
          aria-label="Plugin counts"
          className="flex gap-3 text-xs text-text-muted"
        >
          <li
            data-testid="stat-installed"
            aria-label={`Installed: ${installedCount}`}
          >
            {installedCount} installed
          </li>
          <li
            data-testid="stat-active"
            aria-label={`Active: ${activeCount}`}
          >
            {activeCount} active
          </li>
          <li
            data-testid="stat-disabled"
            aria-label={`Disabled: ${disabledCount}`}
          >
            {disabledCount} disabled
          </li>
        </ul>
        {updateError && (
          <p
            data-testid="check-updates-error"
            role="alert"
            className="text-xs text-status-error"
          >
            Couldn't check for updates: {updateError}
          </p>
        )}
        <div className="relative">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            data-testid="plugin-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // Esc-to-clear: WebView2 does not consistently honor the
              // `<input type=search>` browser-default Esc behavior, and
              // even when it does, focus jumps off the input. Clear
              // explicitly so the user can keep typing without re-focusing.
              // Mirrors the McpPanel search Esc handler (PR #151).
              if (e.key === "Escape" && searchQuery !== "") {
                e.preventDefault();
                setSearchQuery("");
              }
            }}
            placeholder="Search plugins by name, description, or marketplace…"
            aria-label="Search plugins"
            className="w-full rounded-md border border-border bg-bg-tertiary py-1.5 pl-7 pr-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
      </header>

      {isLoading && plugins.length === 0 ? (
        // WCAG 4.1.3 (Status Messages): the pulsing rectangles convey
        // "loading in progress" purely visually — screen readers see only
        // empty <div>s. Mirrors PR #202 (McpPanel skeleton). aria-busy
        // tells AT the region is being updated; the visually-hidden
        // role="status" announces "Loading plugins…" once; aria-hidden on
        // the placeholders keeps SR users from traversing empty graphics.
        <div
          data-testid="loading-skeleton"
          aria-busy="true"
          className="flex flex-col gap-2"
        >
          <span role="status" aria-live="polite" className="sr-only">
            Loading plugins…
          </span>
          <div aria-hidden="true" className="h-24 animate-pulse rounded-md bg-bg-tertiary" />
          <div aria-hidden="true" className="h-24 animate-pulse rounded-md bg-bg-tertiary" />
          <div aria-hidden="true" className="h-24 animate-pulse rounded-md bg-bg-tertiary" />
        </div>
      ) : plugins.length === 0 ? (
        <div
          data-testid="empty-state"
          // Live region: when the loading skeleton resolves to a zero-plugin
          // result, the empty-state replaces the skeleton without any
          // focus change. Without role="status" + aria-live="polite", SR
          // users get NO feedback that the load completed AND yielded
          // nothing — they'd only discover the new copy by tab-hunting.
          // Mirrors PRs #154/#155/#207/#212/#213/#214. The sibling
          // `no-matches` state (filter→empty) already has this; this
          // applies the same treatment to the load→empty branch.
          role="status"
          aria-live="polite"
          className="flex flex-1 items-center justify-center text-center text-sm text-text-muted"
        >
          No plugins installed. Use{" "}
          <code className="mx-1 rounded bg-bg-tertiary px-1.5 py-0.5">
            claude plugins install &lt;name&gt;
          </code>{" "}
          to add plugins.
        </div>
      ) : filtered.length === 0 ? (
        <div
          data-testid="no-matches"
          // Live region: this message appears as the user types into the
          // search input above. Without role="status" + aria-live="polite",
          // screen-reader users get NO feedback that their query produced
          // zero results — they'd only find out by tabbing away from the
          // search box to discover an empty result region. "polite" so the
          // announcement waits for the user to pause typing rather than
          // interrupting every keystroke.
          role="status"
          aria-live="polite"
          className="flex flex-1 items-center justify-center text-center text-sm text-text-muted"
        >
          No results for "{searchQuery}"
        </div>
      ) : (
        // WCAG 1.3.1 (Info and Relationships): the plugin cards form a
        // list of N installed plugins, but were previously emitted as a
        // flat <div><div/></div> sequence — SR users navigating by lists
        // (NVDA "L", JAWS "L", VoiceOver rotor → Lists) heard nothing for
        // this collection and the count ("list, N items") was lost.
        // Promote to a labeled <ul> + <li> wrappers. Visible grid layout
        // is preserved (display: grid works on <ul>; the existing
        // grid-cols / gap utilities carry over). Mirrors PR #235
        // (SkillsListView), ModelDonut donut-legend (aria-label "Model
        // usage breakdown"), and SystemHealth indicator list (#230).
        <ul
          data-testid="plugin-grid"
          aria-label="Installed plugins"
          className="grid grid-cols-1 gap-3 overflow-auto md:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((p) => (
            <li key={`${p.name}@${p.marketplace}@${p.installPath}`}>
              <PluginCard
                plugin={p}
                selected={
                  selectedPlugin != null &&
                  selectedPlugin.name === p.name &&
                  selectedPlugin.installPath === p.installPath
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
