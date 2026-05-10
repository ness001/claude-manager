// Session info bar — see spec §5.3 (state-specific action sets), §5.6 (panel
// layout), §17.5 (dead-CWD handling).
//
// Top of the SessionDetailPanel. Renders:
//   • editable session name (displayName, falls back to firstPrompt)
//   • status badges: state pill, model badge, message-count badge,
//     entrypoint badge
//   • action buttons whose set varies by SessionState (table in §5.3)
//
// Critical behaviors:
//   • ALIVE sessions must NOT show plain "Resume" — they show "View Live"
//     and "Resume in Terminal" instead (§5.3, §5.3.1).
//   • Stop on ALIVE goes through window.confirm before SIGTERM (§5.3.1).
//   • Dead CWD (Tauri FS exists() === false) disables Open CWD / Open in
//     VS Code, surfaces a warning indicator (§17.5).
//
// Wiring of the actions themselves (terminal launch, VS Code spawn, SIGTERM,
// archive/unarchive/delete) is the responsibility of later phases — this
// component only renders the right buttons in the right state and calls
// already-known callbacks. That keeps T2.10 a presentational task.

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { exists } from "@tauri-apps/plugin-fs";

import type { SessionMeta, SessionState } from "../../lib/session-types";
import { useSessionStore } from "../../stores/session-store";

interface SessionInfoBarProps {
  session: SessionMeta;
}

/** Dot + label color for the state pill. Mirrors SessionCard's STATUS_COLOR. */
const STATE_PILL: Record<SessionState, { dot: string; label: string }> = {
  alive: { dot: "bg-status-green", label: "Alive" },
  ended: { dot: "bg-text-muted", label: "Ended" },
  orphaned: { dot: "bg-status-yellow", label: "Orphaned" },
  archived: { dot: "bg-border-strong", label: "Archived" },
};

/** Action-button identifiers used by tests + future wiring. */
type ActionId =
  | "view-live"
  | "resume-terminal"
  | "resume"
  | "fork"
  | "view-conversation"
  | "open-cwd"
  | "open-vscode"
  | "tag-rename"
  | "stop"
  | "archive"
  | "unarchive"
  | "delete";

interface Action {
  id: ActionId;
  label: string;
  /** "primary" gets the accent fill; everything else is neutral. */
  variant?: "primary" | "danger";
}

/** Per-state action lists exactly per spec §5.3. */
const ACTIONS: Record<SessionState, Action[]> = {
  alive: [
    { id: "view-live", label: "View Live", variant: "primary" },
    { id: "resume-terminal", label: "Resume in Terminal" },
    { id: "open-cwd", label: "Open CWD" },
    { id: "open-vscode", label: "Open in VS Code" },
    { id: "tag-rename", label: "Tag/Rename" },
    { id: "stop", label: "Stop", variant: "danger" },
  ],
  ended: [
    { id: "resume", label: "Resume", variant: "primary" },
    { id: "fork", label: "Fork" },
    { id: "view-conversation", label: "View Conversation" },
    { id: "open-cwd", label: "Open CWD" },
    { id: "open-vscode", label: "Open in VS Code" },
    { id: "tag-rename", label: "Tag/Rename" },
    { id: "archive", label: "Archive" },
  ],
  orphaned: [
    { id: "resume", label: "Resume", variant: "primary" },
    { id: "open-cwd", label: "Open CWD" },
    { id: "delete", label: "Delete", variant: "danger" },
  ],
  archived: [
    { id: "unarchive", label: "Unarchive", variant: "primary" },
    { id: "view-conversation", label: "View Conversation" },
    { id: "delete", label: "Delete", variant: "danger" },
  ],
};

/** Buttons that operate on the CWD — disabled when CWD does not exist. */
const CWD_DEPENDENT: ReadonlySet<ActionId> = new Set([
  "open-cwd",
  "open-vscode",
]);

export function SessionInfoBar({ session }: SessionInfoBarProps) {
  const setSessionDisplayName = useSessionStore((s) => s.setSessionDisplayName);
  // Local controlled state for the editable name. We mirror the canonical
  // store value via a useEffect so switching sessions resets the input.
  const [name, setName] = useState(
    session.displayName ?? session.firstPrompt ?? "",
  );
  useEffect(() => {
    setName(session.displayName ?? session.firstPrompt ?? "");
  }, [session.sessionId, session.displayName, session.firstPrompt]);

  // Dead-CWD detection (§17.5). exists() is async; default to "exists" so we
  // don't flicker the warning on first paint. If the call rejects (e.g.
  // permission denied) we treat that as "unknown, leave enabled" — the spec
  // only disables on a confirmed-missing path.
  const [cwdExists, setCwdExists] = useState(true);
  useEffect(() => {
    let cancelled = false;
    if (!session.cwd) {
      setCwdExists(false);
      return;
    }
    setCwdExists(true);
    exists(session.cwd)
      .then((ok) => {
        if (!cancelled) setCwdExists(ok);
      })
      .catch(() => {
        // Leave as-is on FS error.
      });
    return () => {
      cancelled = true;
    };
  }, [session.cwd]);

  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== session.displayName) {
      setSessionDisplayName(session.sessionId, trimmed);
    }
  }

  const pill = STATE_PILL[session.state];
  const actions = ACTIONS[session.state];

  return (
    <div
      data-testid="session-info-bar"
      className="flex flex-col gap-2 border-b border-border bg-bg-secondary px-4 py-3"
    >
      {/* Row 1: name + badges
        *
        * The name input is session-scoped only — `setSessionDisplayName`
        * mutates the in-memory Zustand store but SQLite persistence is
        * deferred (see `src/lib/session-loader.ts:28-31`). Until the
        * persistence wiring lands, surface that fact via title + a marker
        * span so users (and SR users) know edits won't survive reload. */}
      <div className="flex items-center gap-3 min-w-0">
        <input
          data-testid="session-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitName();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="flex-1 min-w-0 truncate bg-transparent text-base font-semibold text-text-primary outline-none focus:ring-1 focus:ring-accent rounded px-1"
          aria-label="Session name (session-scoped — not yet saved across reloads)"
          title="Renames are session-scoped — not yet saved across reloads"
        />

        {!cwdExists && (
          <span
            data-testid="dead-cwd-warning"
            title="Directory not found"
            // The status-yellow token (#eab308 light) on bg-bg-secondary (#f8f9fa)
            // is ~1.7:1 — fails WCAG 1.4.11 (3:1 for non-text UI components).
            // text-yellow-700 (#a16207) gives ~4.5:1 against the same surface.
            // In dark mode bg-bg-secondary is #1a1a2e and #f9e2af (the dark
            // status-yellow token) is ~10:1 — but 1.4.11 only requires we hit
            // 3:1, and dark:text-status-yellow keeps theme parity.
            className="flex items-center gap-1 text-yellow-700 dark:text-status-yellow"
          >
            <AlertTriangle size={14} role="img" aria-label="Directory not found" />
          </span>
        )}

        <span
          data-testid="state-pill"
          data-state={session.state}
          className="flex items-center gap-1.5 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
        >
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${pill.dot}`}
          />
          {pill.label}
        </span>

        {session.model && (
          <span
            data-testid="model-badge"
            className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
          >
            {session.model}
          </span>
        )}

        <span
          data-testid="message-count-badge"
          className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
        >
          {session.messageCount} {session.messageCount === 1 ? "msg" : "msgs"}
        </span>

        <span
          data-testid="entrypoint-badge"
          className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
        >
          {session.entrypoint || session.kind}
        </span>
      </div>

      {/* Row 2: actions
        *
        * Action wiring (terminal launch, VS Code spawn, SIGTERM, archive,
        * delete, …) is later-phase. Until those handlers exist, every button
        * is rendered `disabled` with a "Coming soon" tooltip so users can
        * tell at a glance that they aren't interactive — same convention as
        * Dashboard QuickActions / Plugins Install / MCP View Tools.
        *
        * The dead-CWD case (§17.5) keeps its own tooltip so the more
        * specific reason wins. */}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const cwdDead = CWD_DEPENDENT.has(a.id) && !cwdExists;
          const baseCls =
            a.variant === "primary"
              ? "bg-accent text-white"
              : a.variant === "danger"
                ? "bg-bg-tertiary text-status-red"
                : "bg-bg-tertiary text-text-secondary";
          return (
            <button
              key={a.id}
              type="button"
              data-testid={`action-${a.id}`}
              disabled
              aria-disabled="true"
              title={cwdDead ? "Directory not found" : "Coming soon"}
              className={[
                "rounded-md px-3 py-1 text-xs font-medium",
                baseCls,
                "opacity-50 cursor-not-allowed",
              ].join(" ")}
            >
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
