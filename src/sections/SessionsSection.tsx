import { useEffect } from "react";

import { SessionListPanel } from "../components/sessions/SessionListPanel";
import { SessionDetailPanel } from "../components/sessions/SessionDetailPanel";
import { useSessionStore } from "../stores/session-store";

/**
 * Sessions section — split pane: SessionListPanel (260px left) +
 * SessionDetailPanel (flex right). T2.13 will add proper loading + empty
 * states for the panel; T2.10 wires the real detail panel into place.
 */
export function SessionsSection() {
  const loadSessions = useSessionStore((s) => s.loadSessions);

  useEffect(() => {
    void loadSessions().catch(() => {
      // Swallow — empty state is shown when load fails. Detailed error UI is
      // T2.13's job.
    });
  }, [loadSessions]);

  return (
    <section className="flex h-full">
      <SessionListPanel />
      <SessionDetailPanel />
    </section>
  );
}
