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
            <button
              type="button"
              data-testid="install-plugin-btn"
              disabled
              aria-disabled="true"
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
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RefreshCw size={14} aria-hidden="true" className={isChecking ? "animate-spin" : ""} />
              Check for Updates
            </button>
          </div>
        </div>
        <div className="flex gap-3 text-xs text-text-muted">
          <span data-testid="stat-installed">{installedCount} installed</span>
          <span data-testid="stat-active">{activeCount} active</span>
          <span data-testid="stat-disabled">{disabledCount} disabled</span>
        </div>
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
        <div data-testid="loading-skeleton" className="flex flex-col gap-2">
          <div className="h-24 animate-pulse rounded-md bg-bg-tertiary" />
          <div className="h-24 animate-pulse rounded-md bg-bg-tertiary" />
          <div className="h-24 animate-pulse rounded-md bg-bg-tertiary" />
        </div>
      ) : plugins.length === 0 ? (
        <div
          data-testid="empty-state"
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
          className="flex flex-1 items-center justify-center text-center text-sm text-text-muted"
        >
          No results for "{searchQuery}"
        </div>
      ) : (
        <div
          data-testid="plugin-grid"
          className="grid grid-cols-1 gap-3 overflow-auto md:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((p) => (
            <PluginCard
              key={`${p.name}@${p.marketplace}@${p.installPath}`}
              plugin={p}
              selected={
                selectedPlugin != null &&
                selectedPlugin.name === p.name &&
                selectedPlugin.installPath === p.installPath
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
