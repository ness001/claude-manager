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
          className="rounded text-xs text-accent hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              {/* Session names like "Claude Manager Phase 2 — T2.13 wire up
                  recent-sessions live state" routinely overflow the row width
                  and get clipped by `truncate`. Without `title`, sighted users
                  have no way to recover the hidden tail (rows are intentionally
                  non-interactive per spec §4.1, so opening the session isn't
                  an option). Mirror the visible string into title so hover
                  surfaces the full name. Same fix as SkillCard skill-path
                  (PR #167). */}
              <span
                className="flex-1 truncate text-text-primary"
                title={s.displayName || "(untitled)"}
              >
                {s.displayName || "(untitled)"}
              </span>
              {/* The visible "3h ago" / "Yesterday" string is great for
                  scanning but useless for forensics ("which session ran
                  at 14:23?"). Surface the absolute timestamp via the
                  title tooltip on hover, so users can recover the exact
                  time without leaving the dashboard. Mirrors the
                  truncate+title family (PRs #167, #170, #171, #175,
                  #176, #179). Skip when the timestamp is missing/0 to
                  avoid an empty-tooltip artifact. */}
              <span
                className="text-[11px] text-text-muted tabular-nums shrink-0"
                title={
                  s.startedAt > 0
                    ? new Date(s.startedAt).toLocaleString()
                    : undefined
                }
              >
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
