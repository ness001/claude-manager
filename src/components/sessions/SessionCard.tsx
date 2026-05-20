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
  // WCAG 1.4.11 (Non-text Contrast): the status dot is a 2x2 (8px)
  // circle. The original `bg-status-yellow` (#eab308) on the white
  // card-bg in light mode gives only ~1.6:1 contrast — well below the
  // 3:1 floor for graphical UI components. Sighted users in light mode
  // saw what was effectively an invisible dot for the only visual cue
  // distinguishing an orphaned session from an ended one. SR users get
  // the info via the status dot's own aria-label ("Orphaned"), but the
  // visible signal is gone. Swap to `bg-status-amber` (#d97706 light /
  // #fab387 dark) — already this codebase's "warning" semantic color
  // (PR #293 ActivityChart staleness banner, PR #294 SystemHealth warn
  // dot, PluginCard update-pill, McpServerCard "starting" pill). On
  // white that gives ~3.36:1, comfortably above the 3:1 floor; the
  // dark-theme amber is unchanged in feel because it's already a pale
  // color on dark surfaces.
  orphaned: "bg-status-amber",
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

export function SessionCard({ session, selected, style }: SessionCardProps) {
  const selectSession = useSessionStore((s) => s.selectSession);
  const label = session.displayName ?? truncate(session.firstPrompt, 60);
  const dotClass = STATUS_COLOR[session.state];
  const pulse = session.state === "alive" ? "animate-pulse" : "";
  const ms = session.startedAt;
  const timeLabel = timeAgo(ms);
  const startedAtAbsolute = ms > 0 ? new Date(ms).toLocaleString() : undefined;

  return (
    <button
      type="button"
      data-testid="session-card"
      data-session-id={session.sessionId}
      data-state={session.state}
      data-selected={selected ? "true" : "false"}
      aria-current={selected ? "true" : undefined}
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
          title={label}
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
              // WCAG 4.1.2 (Name, Role, Value): the visible text is a bare
              // tag token (e.g. "urgent", "spike", a free-form user label)
              // — SR users walking the card hear it with no clue what
              // dimension it describes (could plausibly be a status, a
              // category, an author, a project). Sighted users infer "tag"
              // from the pill shape + the row's pl-4 indent under the name.
              // Mirror that into the accessible name with a "Tag: …"
              // prefix. Same opaque-badge pattern as message-count below
              // (line 144), version-pill (PluginCard), state-pill / model
              // / messages / entrypoint badges (PRs #247/#250/#252/#271/#279).
              aria-label={`Tag: ${tag}`}
              className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-text-muted pl-4">
        {/* When `startedAt` is missing/unparseable (common for ENDED sessions
            with no PID file), `timeAgo()` returns "" — leaving the time
            slot visually empty. To sighted users that reads as a layout
            glitch ("why is this row missing its left field?"); to SR users
            it's silence. Render an em-dash placeholder so the slot is
            visibly populated and AT users hear "dash" rather than skipping
            an empty span. The tooltip stays omitted (covered by the
            "omits title when startedAt is empty" test) — there's no
            absolute timestamp to surface. */}
        <span data-testid="time-ago" title={startedAtAbsolute}>{timeLabel === "" ? "—" : timeLabel}</span>
        <span
          data-testid="message-count"
          // WCAG 4.1.2 (Name, Role, Value): the visible text "5 msgs"
          // is a bare count — SR users hear it as an opaque string with
          // no semantic context (could be unread-count, queued-count,
          // tag-count, …). Sighted users infer "messages" from the card
          // layout. Mirror that into the accessible name with a
          // "Messages: …" prefix so the badge announces self-contained.
          // Same pattern as SessionInfoBar message-count-badge (PR #228)
          // and AssistantMessage model-badge (PR #247).
          aria-label={`Messages: ${session.messageCount}`}
        >
          {session.messageCount} {session.messageCount === 1 ? "msg" : "msgs"}
        </span>
      </div>
    </button>
  );
}
