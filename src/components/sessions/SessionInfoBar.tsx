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
      {/* Row 1: name + badges */}
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
          aria-label="Session name"
        />

        {!cwdExists && (
          <span
            data-testid="dead-cwd-warning"
            title="Directory not found"
            className="flex items-center gap-1 text-status-yellow"
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
          {session.messageCount} msgs
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
