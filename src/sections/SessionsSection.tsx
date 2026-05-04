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
      className="flex h-full w-[260px] shrink-0 flex-col gap-2 border-r border-border bg-sidebar-bg p-3"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          data-testid="session-card-skeleton"
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
    <section data-testid="sessions-section" className="flex h-full">
      {showSkeleton ? <SessionListSkeleton /> : <SessionListPanel />}
      <SessionDetailPanel />
    </section>
  );
}
