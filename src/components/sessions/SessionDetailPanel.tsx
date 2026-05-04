// Session detail panel — see spec §5.6.
//
// Right side of the Sessions split-pane. When no session is selected we show
// the empty state from §17.6. When a session is selected we render the
// SessionInfoBar at the top and a placeholder area below for the
// ConversationViewer (T2.11).

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
      {(() => {
        // T2.11 wires in the conversation viewer. SessionMeta does not yet
        // carry the JSONL file path (that field is added in T2.13 when the
        // sessions section is wired to the loader). Until then, render the
        // viewer only when a path has been attached, otherwise show a
        // placeholder so the rest of the UI is unaffected.
        const jsonlPath = (session as unknown as { jsonlPath?: string }).jsonlPath;
        if (jsonlPath) {
          return <ConversationViewer path={jsonlPath} />;
        }
        return (
          <div
            data-testid="conversation-viewer-placeholder"
            className="flex-1 overflow-auto p-4 text-sm text-text-muted"
          >
            Conversation viewer waiting for session JSONL path (wired in T2.13).
          </div>
        );
      })()}
    </div>
  );
}
