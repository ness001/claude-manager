import { useEffect } from "react";

import { SessionListPanel } from "../components/sessions/SessionListPanel";
import { useSessionStore } from "../stores/session-store";

/**
 * Sessions section — split pane: SessionListPanel (260px left) + detail
 * placeholder (right). T2.10 will replace the placeholder with the real
 * SessionDetailPanel; T2.13 wires up final loading + empty states.
 *
 * For now the section calls `loadSessions()` on mount so the panel shows
 * real `~/.claude/` data when running under `npx tauri dev`.
 */
export function SessionsSection() {
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const selectedId = useSessionStore((s) => s.selectedId);

  useEffect(() => {
    void loadSessions().catch(() => {
      // Swallow — empty state is shown when load fails. Detailed error UI is
      // T2.13's job; T2.9 just needs the panel mounted so it can be smoke-
      // tested under `npx tauri dev`.
    });
  }, [loadSessions]);

  return (
    <section className="flex h-full">
      <SessionListPanel />
      <div className="flex flex-1 items-center justify-center text-text-muted text-sm">
        {selectedId
          ? `Selected session: ${selectedId}`
          : "Select a session to view its conversation"}
      </div>
    </section>
  );
}

