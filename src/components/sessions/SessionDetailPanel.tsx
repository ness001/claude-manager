// Session detail panel — see spec §5.6.
//
// Right side of the Sessions split-pane. When no session is selected we show
// the empty state from §17.6. When a session is selected we render the
// SessionInfoBar at the top and the ConversationViewer below (T2.13 wires
// the JSONL path on SessionMeta so this works end-to-end).

import { MessageSquare } from "lucide-react";
import { SessionInfoBar } from "./SessionInfoBar";
import { ConversationViewer } from "../conversation/ConversationViewer";
import { useSessionStore } from "../../stores/session-store";

export function SessionDetailPanel() {
  const selectedId = useSessionStore((s) => s.selectedId);
  const session = useSessionStore((s) =>
    selectedId ? s.sessions.find((x) => x.sessionId === selectedId) : undefined,
  );

  if (!session) {
    return (
      <div
        data-testid="session-detail-empty"
        role="status"
        aria-live="polite"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted"
      >
        <MessageSquare size={40} strokeWidth={1.5} aria-hidden="true" className="opacity-30" />
        <p className="text-sm">Select a session to view its conversation</p>
      </div>
    );
  }

  return (
    // WCAG 2.4.1 (Bypass Blocks) + 1.3.1 (Info and Relationships): the
    // detail pane sits as a sibling of <aside aria-label="Session list">
    // inside SessionsSection. The list pane already exposes a named
    // landmark — without one here, SR users navigating regions (NVDA "D",
    // VoiceOver rotor → Landmarks) could jump to "Session list" but had
    // no way to jump to the detail pane by name. Promote the wrapper to
    // <section aria-label="Session detail"> so the rotor surfaces "region,
    // Session detail" alongside its sibling. Mirrors the SessionListPanel
    // <aside aria-label="Session list"> binding.
    <section
      data-testid="session-detail-panel"
      aria-label="Session detail"
      className="flex flex-1 flex-col min-w-0"
    >
      <SessionInfoBar session={session} />
      {session.jsonlPath ? (
        <ConversationViewer path={session.jsonlPath} />
      ) : (
        <div
          data-testid="conversation-viewer-placeholder"
          role="status"
          aria-live="polite"
          className="flex-1 overflow-auto p-4 text-sm text-text-muted"
        >
          No conversation file available for this session.
        </div>
      )}
    </section>
  );
}
