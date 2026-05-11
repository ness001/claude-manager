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
    // WCAG 1.3.1 + WAI-ARIA APG: dashboard cards each have a visible <h3>
    // header but render as bare <div>s — the SR landmarks rotor cannot
    // surface them by name. Promote the card to a labelled <section>
    // bound to its <h3> via aria-labelledby so users can route to "Recent
    // Sessions" directly. The inner <ul> already references the same id;
    // both pointers are valid AT relationships and the visible layout is
    // unchanged. Mirrors PRs #262 (ModelDonut), #263 (SystemHealth),
    // #264 (QuickActions), and the broader region-landmark sweep
    // (#245 / #256 / #261).
    <section
      data-testid="recent-sessions"
      aria-labelledby="recent-sessions-heading"
      className="flex h-full min-h-[240px] flex-col gap-2 rounded-md border border-border bg-card-bg p-4"
    >
      <div className="flex items-center justify-between">
        <h3
          id="recent-sessions-heading"
          className="text-xs uppercase tracking-wide text-text-muted"
        >
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
        <ul
          data-testid="recent-sessions-list"
          aria-labelledby="recent-sessions-heading"
          className="flex-1 flex flex-col gap-1 overflow-auto"
        >
          {data.map((s) => {
            const name = s.displayName || "(untitled)";
            const msgPart = `${s.messageCount} ${s.messageCount === 1 ? "msg" : "msgs"}`;
            // Coherent SR announcement (WCAG 1.3.1 / 4.1.2): the row
            // visually composes name + time-ago + message count into one
            // tile, but the DOM is three flat sibling spans (the dot is
            // already aria-hidden) with no programmatic linkage. SR users
            // walking the list hear three disconnected fragments per
            // item; the rotor list view shows each <li> only by its first
            // text node, dropping time + message count entirely. Promote
            // the <li> to a self-contained announcement that combines all
            // three pieces in natural reading order. When `startedAt` is
            // 0/missing the visible "—" placeholder is meaningless to SR
            // users, so the time clause is omitted from the aria-label.
            // Mirrors PR #230 (SystemHealth indicator) and StatCard
            // (lines 70-73). Visible layout unchanged.
            const liAriaLabel =
              s.startedAt > 0
                ? `${name}: ${msgPart} — ${timeAgo(s.startedAt)}`
                : `${name}: ${msgPart}`;
            return (
              <li
                key={s.sessionId}
                data-testid="recent-session-row"
                aria-label={liAriaLabel}
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
                data-testid="recent-session-time"
                className="text-[11px] text-text-muted tabular-nums shrink-0"
                title={
                  s.startedAt > 0
                    ? new Date(s.startedAt).toLocaleString()
                    : undefined
                }
              >
                {/* When `startedAt` is 0/missing (e.g. ENDED sessions with no
                    PID file), `timeAgo()` returns "" — leaving an empty span
                    where the time-ago badge should be. Sighted users see a
                    layout glitch; SR users hear nothing for that field.
                    Render an em-dash placeholder so the slot stays
                    visibly populated. Mirrors PR #210 (SessionCard). */}
                {s.startedAt > 0 ? timeAgo(s.startedAt) : "—"}
              </span>
              <span
                data-testid="recent-session-msg-count"
                // WCAG 4.1.2 (Name, Role, Value): bare "5 msgs" is opaque to
                // SR users — could be unread/queued/tag count. Mirror the
                // visible "messages" cue into the accessible name. Same
                // pattern as SessionCard message-count (PR #250),
                // SessionInfoBar message-count-badge (PR #228), and
                // AssistantMessage model-badge (PR #247). Note: the parent
                // <li> already exposes a composite aria-label including the
                // message count, but the per-span name lets users navigating
                // by smaller landmarks (e.g. arrow-key cell-step in some SR
                // modes) still hear the field's role rather than a bare int.
                aria-label={`Messages: ${s.messageCount}`}
                className="text-[11px] text-text-muted tabular-nums shrink-0"
              >
                {s.messageCount} {s.messageCount === 1 ? "msg" : "msgs"}
              </span>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
