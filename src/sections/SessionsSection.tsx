// Sessions section — see spec §5, §17.6.
//
// Split-pane layout:
//   Left (260px): SessionListPanel — "+ New Session" button + view toggle +
//                 search + grouped session cards.
//   Right (flex): SessionDetailPanel — info bar + ConversationViewer or empty
//                 state.
//
// Loading state: while sessionStore.isLoading is true AND no sessions are
// loaded yet, render 4 skeleton cards in the list-panel slot per §17.6.
// Empty state ("No sessions found") is rendered by SessionListPanel itself
// once loading completes with an empty result set; that panel also exposes
// the "+ New Session" CTA, which satisfies the §17.6 empty-state requirement.

import { useEffect } from "react";

import { SessionListPanel } from "../components/sessions/SessionListPanel";
import { SessionDetailPanel } from "../components/sessions/SessionDetailPanel";
import { useSessionStore } from "../stores/session-store";

/** Sidebar-width skeleton placeholder shown while sessions are loading. */
function SessionListSkeleton() {
  return (
    <aside
      data-testid="session-list-skeleton"
      aria-label="Session list"
      aria-busy="true"
      className="flex h-full w-[260px] shrink-0 flex-col gap-2 border-r border-border bg-sidebar-bg p-3"
    >
      {/* WCAG 4.1.3 (Status Messages): aria-busy on the wrapper tells AT
          "this region is being updated" but emits no announcement. Without
          a polite live region, SR users get no audible cue that a load is
          in progress when the section mounts — they only hear the cards
          appear later, with no sense that loading was happening. Mirrors
          PR #202 (McpPanel skeleton) and PR #203 (PluginListView skeleton);
          same defect class as the SkillsListView skeleton (loading-skeleton). */}
      <span role="status" aria-live="polite" className="sr-only">
        Loading sessions…
      </span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          data-testid="session-card-skeleton"
          aria-hidden="true"
          className="h-14 rounded-md bg-bg-tertiary animate-pulse"
        />
      ))}
    </aside>
  );
}

export function SessionsSection() {
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const isLoading = useSessionStore((s) => s.isLoading);
  const sessionsLoaded = useSessionStore((s) => s.sessions.length > 0);

  useEffect(() => {
    void loadSessions().catch(() => {
      // Empty state is rendered by SessionListPanel when sessions stays empty.
    });
  }, [loadSessions]);

  const showSkeleton = isLoading && !sessionsLoaded;

  return (
    <section
      data-testid="sessions-section"
      aria-labelledby="sessions-heading"
      className="flex h-full"
    >
      {/* WCAG 1.3.1 / 2.4.6 — every other top-level section (Dashboard,
          Plugins, Skills, MCP, Settings) renders a top-level <h1> so SR
          users can navigate via the headings list (NVDA "H", JAWS "H").
          SessionsSection had no h1 anywhere — only the section's
          aria-label. This breaks the headings hierarchy: the inner panel
          headers (e.g. SessionListPanel group <h3>s) leap from nothing.
          Render an sr-only h1 to plug the gap (mirrors DashboardSection
          line 62-64) without disturbing the split-pane visual layout. */}
      <h1 id="sessions-heading" className="sr-only">
        Sessions
      </h1>
      {showSkeleton ? <SessionListSkeleton /> : <SessionListPanel />}
      <SessionDetailPanel />
    </section>
  );
}
