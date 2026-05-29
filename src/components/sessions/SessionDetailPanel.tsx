import { MessageSquare } from "lucide-react";
import { SessionInfoBar } from "./SessionInfoBar";
import { TerminalPanel } from "../conversation/TerminalPanel";
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
    <section
      data-testid="session-detail-panel"
      aria-label="Session detail"
      className="flex flex-1 flex-col min-w-0"
    >
      <SessionInfoBar session={session} />
      <TerminalPanel session={session} />
    </section>
  );
}
