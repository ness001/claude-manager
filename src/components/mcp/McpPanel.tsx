// MCP servers full-page panel — see spec §8.4 (layout), §17.6 (loading +
// empty), §17.7 (search). Header has "MCP Servers" title + [+ Add Server]
// + [Refresh Status] + search bar. Body groups by scope with the spec's
// scope headers, each rendering its McpServerCard list. Empty state per
// spec §17.6: "No MCP servers configured. Add one to extend Claude's
// capabilities." + [+ Add Server].

import { useMemo } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";

import {
  filterMcpServers,
  serversByScope,
  useMcpStore,
} from "../../stores/mcp-store";
import type { McpScope, McpServer } from "../../lib/mcp-types";
import { McpServerCard } from "./McpServerCard";

const SCOPE_HEADERS: Record<McpScope, string> = {
  user: "User Scope (available in all projects)",
  local: "Local Scope (private to current project)",
  project: "Project Scope",
};

const SCOPE_ORDER: McpScope[] = ["user", "local", "project"];

export function McpPanel() {
  const servers = useMcpStore((s) => s.servers);
  const searchQuery = useMcpStore((s) => s.searchQuery);
  const setSearchQuery = useMcpStore((s) => s.setSearchQuery);
  const isLoading = useMcpStore((s) => s.isLoading);
  const startEditing = useMcpStore((s) => s.startEditing);
  const removeServer = useMcpStore((s) => s.removeServer);
  const refreshStatus = useMcpStore((s) => s.refreshStatus);
  // Store sets `error` on `claude mcp list` / `check_mcp_status` IPC failure
  // but the UI was never rendering it — clicks on Refresh Status that hit a
  // missing `claude` binary, sandbox denial, or network probe failure showed
  // nothing visible. Mirrors PR #168 (PluginDetailView), PR #172 (SkillsListView
  // Create Skill), and the SkillCard skill-open-error pattern.
  const error = useMcpStore((s) => s.error);

  const filtered = useMemo(
    () => filterMcpServers(servers, searchQuery),
    [servers, searchQuery],
  );
  const grouped = useMemo(() => serversByScope(filtered), [filtered]);

  const onAdd = () => {
    startEditing({
      name: "",
      type: "stdio",
      scope: "user",
      status: "disconnected",
      env: {},
      isOverridden: false,
    } as McpServer);
  };

  return (
    // WCAG 1.3.1 + WAI-ARIA APG: the page-level <section> already wrapped
    // the panel but was unlabeled — the SR landmarks rotor surfaced an
    // anonymous "section" entry with no name. Bind aria-labelledby to the
    // visible <h1> "MCP Servers" so users routing by landmarks (NVDA D,
    // JAWS R, VoiceOver rotor → Landmarks) jump to a named region. Mirrors
    // PRs #266 (PluginListView), #267 (SkillsListView), and the dashboard
    // region-landmark sweep (#262/#263/#264/#265).
    <section
      data-testid="mcp-panel"
      aria-labelledby="mcp-panel-heading"
      className="flex h-full flex-col gap-4 p-6"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1
            id="mcp-panel-heading"
            className="text-2xl font-semibold text-text-primary"
          >
            MCP Servers
          </h1>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="add-server-btn"
              onClick={onAdd}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Plus size={14} aria-hidden="true" />
              Add Server
            </button>
            <button
              type="button"
              data-testid="refresh-status-btn"
              onClick={() => {
                void refreshStatus();
              }}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Refresh Status
            </button>
          </div>
        </div>
        <div className="relative">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            data-testid="mcp-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // Esc-to-clear: WebView2 does not consistently honor the
              // `<input type=search>` browser-default Esc behavior, and
              // even when it does, it bubbles a `change` event without
              // keeping focus on the input. Clear explicitly so the
              // user can keep typing a new query without re-focusing.
              if (e.key === "Escape" && searchQuery !== "") {
                e.preventDefault();
                setSearchQuery("");
              }
            }}
            placeholder="Search servers by name, command, args, or URL…"
            aria-label="Search MCP servers"
            className="w-full rounded-md border border-border bg-bg-tertiary py-1.5 pl-7 pr-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        {error !== null && (
          <p
            data-testid="mcp-refresh-error"
            role="alert"
            className="text-xs text-status-red"
          >
            {/* The store's `error` field is shared by `loadServers`,
              * `addServer`, `updateServer`, `removeServer` AND
              * `refreshStatus` (mcp-store.ts lines 68/76/86/96/116).
              * The original "Couldn't refresh MCP status: …" copy was
              * accurate only for refresh failures — when a Remove or
              * Save action failed the user saw a misleading "refresh"
              * banner that didn't match the action they had just
              * taken. Make the prefix source-agnostic so it stays
              * truthful no matter which action set the field. The
              * underlying error message itself (e.g. "write_mcp_server
              * failed: …") still carries the actionable detail. */}
            MCP error: {error}
          </p>
        )}
      </header>

      {isLoading && servers.length === 0 ? (
        // WCAG 4.1.3 (Status Messages) + 1.1.1 (Non-text Content): the
        // animated pulsing rectangles convey "loading in progress" purely
        // visually — screen readers see only empty <div>s. Without
        // aria-busy + a polite status announcement, SR users hear the page
        // header, then nothing, then content suddenly appears with no
        // signal that loading was happening. aria-busy="true" tells AT
        // "this region is being updated, ignore intermediate state"; the
        // visually-hidden role="status" line provides the equivalent of
        // the visual skeleton ("Loading MCP servers…").
        <div
          data-testid="loading-skeleton"
          aria-busy="true"
          className="flex flex-col gap-4"
        >
          <span role="status" aria-live="polite" className="sr-only">
            Loading MCP servers…
          </span>
          {SCOPE_ORDER.map((scope) => (
            <div key={scope} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-text-secondary">
                {SCOPE_HEADERS[scope]}
              </h2>
              <div aria-hidden="true" className="h-16 animate-pulse rounded-md bg-bg-tertiary" />
              <div aria-hidden="true" className="h-16 animate-pulse rounded-md bg-bg-tertiary" />
            </div>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div
          data-testid="empty-state"
          // Live region: when the panel transitions from loading→empty (or
          // a delete drops the last server), screen-reader users get NO
          // feedback that the list is now empty without role="status" +
          // aria-live="polite". The sibling `no-matches` branch below
          // already has it; this is the missed twin. Mirrors PR #214
          // (PluginSkills/Hooks/Agents tabs) and PR #218 (PluginListView
          // empty-state).
          role="status"
          aria-live="polite"
          className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-text-muted"
        >
          No MCP servers configured. Add one to extend Claude's capabilities.
          <button
            type="button"
            data-testid="empty-add-btn"
            onClick={onAdd}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus size={14} aria-hidden="true" />
            Add Server
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div
          data-testid="no-matches"
          // Live region: this message appears as the user types into the
          // search input above. Without role="status" + aria-live="polite",
          // screen-reader users get NO feedback that their query produced
          // zero results — they'd only find out by tabbing away to discover
          // an empty result region. Mirrors PR #154 (PluginListView).
          // "polite" so the announcement waits for typing pauses rather
          // than firing on every keystroke.
          role="status"
          aria-live="polite"
          className="flex flex-1 items-center justify-center text-center text-sm text-text-muted"
        >
          No results for "{searchQuery}"
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-auto">
          {SCOPE_ORDER.map((scope) =>
            grouped[scope].length === 0 ? null : (
              <div key={scope} className="flex flex-col gap-2">
                <h2
                  id={`scope-header-${scope}`}
                  data-testid={`scope-header-${scope}`}
                  className="text-sm font-semibold text-text-secondary"
                >
                  {SCOPE_HEADERS[scope]}
                </h2>
                {/* WCAG 1.3.1 (Info and Relationships): the scope's
                    cards form a list of N servers but were previously
                    emitted as flat sibling <div>s alongside the <h2> —
                    SR users navigating by lists (NVDA "L", JAWS "L",
                    VoiceOver rotor → Lists) heard nothing for this
                    collection and the count was lost. Promote each
                    scope group to a <ul aria-labelledby={scope-header}>
                    so the rotor surfaces "list, N items" with the
                    scope header as the list's accessible name. Mirrors
                    PR #235 (SkillsListView), PR #236 (PluginListView),
                    and SystemHealth indicator list (#230). */}
                <ul
                  data-testid={`scope-list-${scope}`}
                  aria-labelledby={`scope-header-${scope}`}
                  className="flex flex-col gap-2"
                >
                  {grouped[scope].map((s) => (
                    <li key={`${s.scope}:${s.name}`}>
                      <McpServerCard
                        server={s}
                        highlightQuery={searchQuery}
                        onEdit={startEditing}
                        onRemove={(srv) => {
                          void removeServer(srv.scope, srv.name);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
