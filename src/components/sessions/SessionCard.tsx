// One row in the session list — see spec §5.5.
//
// Compact card showing: status dot (colored per state, pulsing for ALIVE),
// display name (or first prompt truncated), tag pills, time-ago, and message
// count. Clicking the card calls `selectSession(id)` on the store.

import type { CSSProperties } from "react";

import { useSessionStore } from "../../stores/session-store";
import { timeAgo } from "../../lib/time-utils";
import type { SessionMeta, SessionState } from "../../lib/session-types";

interface SessionCardProps {
  session: SessionMeta;
  selected: boolean;
  /** Optional inline style — used by the virtualized list to position the row. */
  style?: CSSProperties;
}

/**
 * Status-dot color per spec §5.3. ALIVE gets the `animate-pulse` class so the
 * dot visibly throbs; the others are static.
 */
const STATUS_COLOR: Record<SessionState, string> = {
  alive: "bg-status-green",
  ended: "bg-text-muted",
  orphaned: "bg-status-yellow",
  archived: "bg-border-strong",
};

/** Screen-reader label per state — color alone fails WCAG 1.4.1 (Use of Color). */
const STATUS_LABEL: Record<SessionState, string> = {
  alive: "Alive",
  ended: "Ended",
  orphaned: "Orphaned",
  archived: "Archived",
};

/** Truncate a single-line preview to keep the card height fixed. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Convert SessionMeta.startedAt (ISO string from PID file) to epoch ms.
 * Returns 0 (which `timeAgo` renders as "") when the timestamp is missing or
 * unparseable — that's the case for ENDED sessions that have no PID file.
 */
function startedAtMs(startedAt: string): number {
  if (!startedAt) return 0;
  const parsed = Date.parse(startedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function SessionCard({ session, selected, style }: SessionCardProps) {
  const selectSession = useSessionStore((s) => s.selectSession);
  const label = session.displayName ?? truncate(session.firstPrompt, 60);
  const dotClass = STATUS_COLOR[session.state];
  const pulse = session.state === "alive" ? "animate-pulse" : "";
  const timeLabel = timeAgo(startedAtMs(session.startedAt));

  return (
    <button
      type="button"
      data-testid="session-card"
      data-session-id={session.sessionId}
      data-state={session.state}
      data-selected={selected ? "true" : "false"}
      onClick={() => selectSession(session.sessionId)}
      style={style}
      className={[
        "w-full text-left flex flex-col gap-1 px-3 py-2 rounded-md",
        "border border-transparent",
        "hover:bg-bg-tertiary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        selected
          ? "bg-sidebar-active border-accent/40"
          : "bg-card-bg",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          role="img"
          aria-label={STATUS_LABEL[session.state]}
          data-testid="status-dot"
          className={`inline-block h-2 w-2 rounded-full shrink-0 ${dotClass} ${pulse}`}
        />
        <span
          className={[
            "truncate text-sm text-text-primary",
            session.state === "orphaned" ? "italic" : "",
          ].join(" ")}
        >
          {label}
        </span>
      </div>

      {session.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-4">
          {session.tags.map((tag) => (
            <span
              key={tag}
              data-testid="tag-pill"
              className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-text-muted pl-4">
        <span data-testid="time-ago">{timeLabel}</span>
        <span data-testid="message-count">{session.messageCount} msgs</span>
      </div>
    </button>
  );
}
