// Session detail panel — see spec §5.6.
//
// Right side of the Sessions split-pane. When no session is selected we show
// the empty state from §17.6. When a session is selected we render the
// SessionInfoBar at the top and the ConversationViewer below (T2.13 wires
// the JSONL path on SessionMeta so this works end-to-end).

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
        className="flex flex-1 items-center justify-center text-sm text-text-muted"
      >
        Select a session to view its conversation
      </div>
    );
  }

  return (
    <div
      data-testid="session-detail-panel"
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
    </div>
  );
}
