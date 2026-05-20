// Plugin list page — see spec §6.5, §17.6, §17.7. Header (title + counts +
// "Install Plugin" hint button + "Check for Updates" button + search), body
// is a responsive grid of PluginCards.
//
// Update detection per spec §13: clicking "Check for Updates" calls
// `checkPluginUpdates`, which talks to the Rust IPC and merges the result
// back into the store via `setPlugins`.

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileText, Plus, RefreshCw, Search } from "lucide-react";

import { filterPlugins, usePluginStore } from "../../stores/plugin-store";
import { checkPluginUpdates } from "../../lib/plugin-updates";
import { PluginCard } from "./PluginCard";

export function PluginListView() {
  const plugins = usePluginStore((s) => s.plugins);
  const searchQuery = usePluginStore((s) => s.searchQuery);
  const setSearchQuery = usePluginStore((s) => s.setSearchQuery);
  const selectedPlugin = usePluginStore((s) => s.selectedPlugin);
  const isLoading = usePluginStore((s) => s.isLoading);
  const installPlugin = usePluginStore((s) => s.installPlugin);

  const [isChecking, setIsChecking] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [installInput, setInstallInput] = useState("");
  const installInputRef = useRef<HTMLInputElement | null>(null);
  const installTriggerRef = useRef<HTMLButtonElement | null>(null);

  const filtered = useMemo(
    () => filterPlugins(plugins, searchQuery),
    [plugins, searchQuery],
  );

  const installedCount = plugins.length;
  const activeCount = plugins.filter(
    (p) => p.state === "active" || p.state === "update-available",
  ).length;
  const disabledCount = plugins.filter((p) => p.state === "disabled").length;

  // Focus the input as soon as the modal mounts so keyboard users can type
  // immediately. Restore focus to the trigger when the modal closes (WAI-ARIA
  // APG dialog focus-management).
  useEffect(() => {
    if (showInstallPrompt) {
      installInputRef.current?.focus();
    } else {
      installTriggerRef.current?.focus();
    }
  }, [showInstallPrompt]);

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

  const openInstallPrompt = () => {
    setInstallInput("");
    setInstallError(null);
    setShowInstallPrompt(true);
  };
  const cancelInstallPrompt = () => {
    setShowInstallPrompt(false);
  };
  const submitInstallPrompt = async () => {
    const trimmed = installInput.trim();
    if (trimmed === "") return;
    setShowInstallPrompt(false);
    setIsInstalling(true);
    setInstallError(null);
    try {
      await installPlugin(trimmed);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    // WCAG 1.3.1 + WAI-ARIA APG: the page-level <section> already wrapped
    // the view but was unlabeled — the SR landmarks rotor surfaced an
    // anonymous "section" entry with no name. Bind aria-labelledby to the
    // visible <h1> "Plugins" so users routing by landmarks (NVDA D, JAWS R,
    // VoiceOver rotor → Landmarks) jump to a named region. Mirrors the
    // dashboard region-landmark sweep (#262/#263/#264/#265).
    <section
      data-testid="plugin-list-view"
      aria-labelledby="plugin-list-view-heading"
      className="flex h-full flex-col gap-4 p-6"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1
            id="plugin-list-view-heading"
            className="text-2xl font-semibold text-text-primary"
          >
            Plugins
          </h1>
          <div className="flex gap-2">
            {/* Spec §6.7 — header [Install Plugin] now wired. The prompt
              * is intentionally minimal: marketplace pickers / autocomplete
              * are post-MVP. CLI errors stream into the Plugins log window
              * so failures aren't silent. */}
            <button
              ref={installTriggerRef}
              type="button"
              data-testid="install-plugin-btn"
              onClick={openInstallPrompt}
              disabled={isInstalling}
              aria-busy={isInstalling}
              aria-haspopup="dialog"
              aria-expanded={showInstallPrompt}
              aria-label="Install Plugin"
              title="Install a plugin via the Claude CLI"
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Plus size={14} aria-hidden="true" />
              {isInstalling ? "Installing…" : "Install Plugin"}
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
            <button
              type="button"
              data-testid="plugins-log-btn"
              onClick={() => {
                void invoke("open_plugin_log_window").catch(() => {
                  /* surfacing the error here would conflict with the
                   * existing update-error alert region; window open
                   * failures are surfaced via the OS instead. */
                });
              }}
              aria-label="Open Plugins log window"
              title="Open the Plugins activity log in a separate window"
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <FileText size={14} aria-hidden="true" />
              Log
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
        {installError && (
          <p
            data-testid="install-error"
            role="alert"
            className="text-xs text-status-error"
          >
            Install failed: {installError}
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

      {/* Spec §6.7 Install Plugin prompt. Minimal in-page modal — not a
        * native `window.prompt`, because the e2e harness (WebView2 +
        * tauri-driver) can't observe / interact with browser-chrome
        * dialogs, and the spec asserts on these testids. Backdrop click
        * and Esc both cancel; Enter submits. */}
      {showInstallPrompt && (
        <div
          data-testid="install-plugin-prompt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-plugin-prompt-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            // Backdrop click cancels; clicks inside the inner card don't
            // bubble here because we stopPropagation below.
            if (e.target === e.currentTarget) cancelInstallPrompt();
          }}
        >
          <div
            className="w-full max-w-sm rounded-md border border-border bg-bg-primary p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="install-plugin-prompt-heading"
              className="mb-2 text-sm font-semibold text-text-primary"
            >
              Install plugin
            </h2>
            <p className="mb-3 text-xs text-text-muted">
              Enter the plugin name (or <code>name@marketplace</code>).
              Output streams to the Plugins log window.
            </p>
            <input
              ref={installInputRef}
              type="text"
              data-testid="install-plugin-input"
              value={installInput}
              onChange={(e) => setInstallInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitInstallPrompt();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelInstallPrompt();
                }
              }}
              placeholder="e.g. example-skills@anthropic-agent-skills"
              aria-label="Plugin name or name@marketplace"
              className="mb-3 w-full rounded-md border border-border bg-bg-tertiary px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="install-plugin-cancel"
                onClick={cancelInstallPrompt}
                className="rounded-md border border-border px-3 py-1 text-xs text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="install-plugin-submit"
                onClick={() => {
                  void submitInstallPrompt();
                }}
                disabled={installInput.trim() === ""}
                className="rounded-md border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
              >
                Install
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
