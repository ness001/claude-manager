// Recent sessions list — see spec §4.1 Row 3 (left).
//
// Last 8 sessions with status dot + name + time-ago + message count.
// "View All Sessions" link navigates to the Sessions section. Time formatting
// uses the shared `timeAgo()` helper (T2.3) so the format matches SessionCard.

import { useNavigationStore } from "../../stores/navigation-store";
import { timeAgo } from "../../lib/time-utils";
import type { RecentSessionEntry } from "../../stores/dashboard-store";

interface RecentSessionsProps {
  data: RecentSessionEntry[];
}

export function RecentSessions({ data }: RecentSessionsProps) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);

  return (
    <div
      data-testid="recent-sessions"
      className="flex h-full min-h-[240px] flex-col gap-2 rounded-md border border-border bg-card-bg p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wide text-text-muted">
          Recent Sessions
        </h3>
        <button
          type="button"
          data-testid="view-all-sessions"
          onClick={() => navigateTo("sessions")}
          className="text-xs text-accent hover:text-accent-hover hover:underline"
        >
          View All Sessions
        </button>
      </div>

      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-text-muted">
          No recent sessions
        </div>
      ) : (
        <ul className="flex-1 flex flex-col gap-1 overflow-auto">
          {data.map((s) => (
            <li
              key={s.sessionId}
              data-testid="recent-session-row"
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm min-w-0"
            >
              {/* Recent sessions are by definition not "alive" anymore in
                  Phase 2 (no live state on this row); use the neutral muted
                  dot. T2.13 may revisit when live state is wired in. */}
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full shrink-0 bg-text-muted"
              />
              <span className="flex-1 truncate text-text-primary">
                {s.displayName || "(untitled)"}
              </span>
              <span className="text-[11px] text-text-muted tabular-nums shrink-0">
                {timeAgo(s.startedAt)}
              </span>
              <span
                data-testid="recent-session-msg-count"
                className="text-[11px] text-text-muted tabular-nums shrink-0"
              >
                {s.messageCount} {s.messageCount === 1 ? "msg" : "msgs"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
