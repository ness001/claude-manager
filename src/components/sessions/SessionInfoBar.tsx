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

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { exists } from "@tauri-apps/plugin-fs";
import { open as openShell } from "@tauri-apps/plugin-shell";

import type { SessionMeta, SessionState } from "../../lib/session-types";
import { useSessionStore } from "../../stores/session-store";

interface SessionInfoBarProps {
  session: SessionMeta;
}

/** Dot + label color for the state pill. Mirrors SessionCard's STATUS_COLOR. */
const STATE_PILL: Record<SessionState, { dot: string; label: string }> = {
  alive: { dot: "bg-status-green", label: "Alive" },
  ended: { dot: "bg-text-muted", label: "Ended" },
  // WCAG 1.4.11 (Non-text Contrast): the dot is a 2x2 (8px) circle
  // sitting on the state pill's `bg-bg-tertiary` (#f1f3f5 light /
  // #232338 dark) background. The original `bg-status-yellow`
  // (#eab308) on #f1f3f5 gives only ~1.65:1 contrast — well below
  // the 3:1 floor for graphical UI components. Sighted users in
  // light mode saw what was effectively an invisible dot for the
  // primary visual cue distinguishing "orphaned" from "ended". SR
  // users get nothing from the dot itself (it's `aria-hidden`) and
  // rely on the parent pill's "Session state: Orphaned" aria-label,
  // but the visible signal was gone. Swap to `bg-status-amber`
  // (#d97706 light → ~3.30:1 on #f1f3f5, comfortably above the 3:1
  // floor; #fab387 dark, unchanged in feel because it's already a
  // pale color on dark surfaces). Same convention established by
  // PRs #293 (ActivityChart staleness banner), #294 (SystemHealth
  // warn dot), #295 (SessionCard orphaned dot), #296 (PluginCard
  // orphaned dot) — amber is this codebase's "warning" semantic.
  orphaned: { dot: "bg-status-amber", label: "Orphaned" },
  archived: { dot: "bg-border-strong", label: "Archived" },
};

/** Action-button identifiers used by tests + future wiring. */
type ActionId =
  | "resume-terminal"
  | "resume"
  | "open-cwd"
  | "open-vscode"
  | "stop"
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
    { id: "resume-terminal", label: "Resume in Terminal", variant: "primary" },
    { id: "open-cwd", label: "Open CWD" },
    { id: "open-vscode", label: "Open in VS Code" },
    { id: "stop", label: "Stop", variant: "danger" },
  ],
  ended: [
    { id: "resume", label: "Resume", variant: "primary" },
    { id: "open-cwd", label: "Open CWD" },
    { id: "open-vscode", label: "Open in VS Code" },
    { id: "delete", label: "Delete", variant: "danger" },
  ],
  orphaned: [
    { id: "resume", label: "Resume", variant: "primary" },
    { id: "open-cwd", label: "Open CWD" },
    { id: "delete", label: "Delete", variant: "danger" },
  ],
  archived: [
    { id: "unarchive", label: "Unarchive", variant: "primary" },
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
  const unarchiveSession = useSessionStore((s) => s.unarchiveSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const stopSession = useSessionStore((s) => s.stopSession);
  const launchSession = useSessionStore((s) => s.launchSession);
  // Local controlled state for the editable name. We mirror the canonical
  // store value via a useEffect so switching sessions resets the input.
  const [name, setName] = useState(
    session.displayName ?? session.firstPrompt ?? "",
  );
  // Set by the Esc handler to suppress the immediately-following onBlur
  // commit (the Esc handler calls blur() to drop focus, which fires
  // onBlur synchronously before the setName(canonical) state update from
  // the Esc handler is applied). See commitName() below.
  const skipNextBlurCommitRef = useRef(false);
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
    if (skipNextBlurCommitRef.current) {
      // Esc-to-revert just ran and called blur() to drop focus — that
      // browser blur synchronously fires onBlur=commitName, which would
      // read the stale `name` (React batches the setName(canonical) from
      // the Esc handler) and re-commit the draft. Skip this commit.
      skipNextBlurCommitRef.current = false;
      return;
    }
    const trimmed = name.trim();
    if (trimmed && trimmed !== session.displayName) {
      setSessionDisplayName(session.sessionId, trimmed);
    }
  }

  // Open-error surface for the two CWD actions (mirrors SkillCard PR pattern).
  // openShell rejects when the path is missing, the URI handler is unregistered
  // (no VS Code), or the shell allowlist denies — without an inline alert the
  // failure is silent.
  const [openError, setOpenError] = useState<string | null>(null);

  const openCwd = async () => {
    if (!session.cwd) return;
    setOpenError(null);
    try {
      await openShell(session.cwd);
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : String(e));
    }
  };

  const openInVsCode = async () => {
    if (!session.cwd) return;
    setOpenError(null);
    // Same Windows-path → forward-slash conversion as SkillCard — the
    // vscode://file/ URI scheme is RFC 3986; backslash paths silently no-op.
    const uriPath = session.cwd.replace(/\\/g, "/");
    try {
      await openShell(`vscode://file/${uriPath}`);
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : String(e));
    }
  };

  // WAI-ARIA Toolbar pattern keyboard model — roving tabindex + arrow-key
  // navigation between buttons. Without this, declaring role="toolbar" is a
  // false promise: SR users hearing "toolbar, View Live, button" expect
  // arrow-key navigation, and sighted keyboard users get the pre-fix
  // surprise of Tab landing on every action button instead of skipping the
  // toolbar as a unit. Mirrors ViewModeToggle's roving tabindex (PR #316).
  const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Index of the currently tab-stop action — initially 0 (the first
  // button). Click/focus on a different action moves the tab stop there
  // so re-entering with Tab returns to the user's last position (APG).
  const [tabStopIdx, setTabStopIdx] = useState(0);
  // If the action set length changes (state transitions: ended → archived,
  // etc.), clamp tabStopIdx so it never points past the new length.
  useEffect(() => {
    setTabStopIdx((i) => Math.min(i, Math.max(0, ACTIONS[session.state].length - 1)));
  }, [session.state]);

  const focusActionAt = (idx: number, count: number) => {
    if (count <= 0) return;
    const wrapped = (idx + count) % count;
    const target = actionRefs.current[wrapped];
    if (target) {
      target.focus();
      setTabStopIdx(wrapped);
    }
  };

  const onToolbarKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
    count: number,
  ) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusActionAt(i - 1, count);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusActionAt(i + 1, count);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusActionAt(0, count);
    } else if (e.key === "End") {
      e.preventDefault();
      focusActionAt(count - 1, count);
    }
  };

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
            } else if (e.key === "Escape") {
              // Esc-to-revert: standard inline-edit pattern (mirrors the
              // TurnInput in ConversationViewer.tsx line 519, the McpPanel
              // search Esc handler, and the PluginListView search Esc
              // handler). Without it, a user mid-edit who wants to cancel
              // has no easy way out — clicking elsewhere fires onBlur which
              // commits whatever draft is in the field. Restore the canonical
              // store value and blur to drop focus from the input.
              e.preventDefault();
              setName(session.displayName ?? session.firstPrompt ?? "");
              skipNextBlurCommitRef.current = true;
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="flex-1 min-w-0 truncate bg-transparent text-base font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
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
          // WCAG 4.1.2 (Name, Role, Value): the visible label is a bare
          // status word ("ALIVE" / "ENDED" / "ORPHANED") — SR users hear
          // it as an opaque token with no semantic context. Sighted users
          // infer "session state" from the pill's leading colored dot
          // and its position in the badge row. Mirror that into the
          // accessible name with a "Session state: …" prefix. Same
          // pattern as model-badge / message-count-badge / entrypoint-
          // badge below (PRs #247/#250/#252) and SessionCard's status-dot
          // (line 94).
          aria-label={`Session state: ${pill.label}`}
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
            // WCAG 4.1.2 (Name, Role, Value): the visible text "claude-sonnet-4-6"
            // is a bare model identifier — SR users hear it as an opaque
            // string with no semantic context. The aria-label prefixes the
            // role ("Model: …") so AT users get the same key/value
            // affordance sighted users already infer from the badge layout.
            // Same pattern as the disabled-stub aria-label family
            // (#181/#183/#184/#222) — mirror the visual cue into the
            // accessible name. Kept the visible text untouched.
            aria-label={`Model: ${session.model}`}
            className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
          >
            {session.model}
          </span>
        )}

        <span
          data-testid="message-count-badge"
          // SR users hear "47 msgs" without knowing it counts session
          // messages — could plausibly be unread-count, queued-count, etc.
          // Prefix the role ("Messages: …") in the accessible name.
          aria-label={`Messages: ${session.messageCount}`}
          className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
        >
          {session.messageCount} {session.messageCount === 1 ? "msg" : "msgs"}
        </span>

        <span
          data-testid="entrypoint-badge"
          // SR users hear "claude-code" / "vscode-extension" with no clue
          // what dimension that describes. Prefix with "Entrypoint: …".
          aria-label={`Entrypoint: ${session.entrypoint || session.kind}`}
          className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
        >
          {session.entrypoint || session.kind}
        </span>
      </div>

      {/* Row 2: actions */}
      {/* WAI-ARIA Toolbar pattern: this row is a group of related action
        * buttons (View Live / Resume / Stop / Archive / …). Without
        * role="toolbar" + an accessible name, screen-reader users hear the
        * buttons as a flat sequence of unrelated controls indistinguishable
        * from any other button strip on the page. role="toolbar" is the
        * correct ARIA primitive for a button group (vs. list/menubar) per
        * the APG, and the aria-label tells SR users what the toolbar does. */}
      <div
        role="toolbar"
        aria-label="Session actions"
        data-testid="session-actions-toolbar"
        className="flex flex-wrap gap-2"
      >
        {actions.map((a, i) => {
          const cwdDead = CWD_DEPENDENT.has(a.id) && !cwdExists;
          const disabled = cwdDead;

          const handleClick = async () => {
            switch (a.id) {
              case "open-cwd":
                return openCwd();
              case "open-vscode":
                return openInVsCode();
              case "resume-terminal":
                return launchSession(["--continue", session.sessionId], session.cwd || undefined);
              case "resume":
                return launchSession(["--resume", session.sessionId], session.cwd || undefined);
              case "stop":
                if (session.pid && window.confirm(`Stop session (PID ${session.pid})?`)) {
                  await stopSession(session.pid);
                }
                return;
              case "unarchive":
                return unarchiveSession(session.sessionId);
              case "delete":
                if (window.confirm("Delete this session record?")) {
                  await deleteSession(session.sessionId);
                }
                return;
            }
          };

          const ariaLabel = cwdDead
            ? `${a.label} (directory not found)`
            : undefined;
          const baseCls =
            a.variant === "primary"
              ? "bg-accent text-white"
              : a.variant === "danger"
                ? "bg-bg-tertiary text-status-red"
                : "bg-bg-tertiary text-text-secondary";
          const isTabStop = i === tabStopIdx;
          return (
            <button
              key={a.id}
              ref={(el) => {
                actionRefs.current[i] = el;
              }}
              type="button"
              data-testid={`action-${a.id}`}
              disabled={disabled}
              aria-disabled={disabled || undefined}
              aria-label={ariaLabel}
              tabIndex={isTabStop ? 0 : -1}
              onClick={disabled ? undefined : handleClick}
              onFocus={() => setTabStopIdx(i)}
              onKeyDown={(e) => onToolbarKeyDown(e, i, actions.length)}
              title={cwdDead ? "Directory not found" : undefined}
              className={[
                "rounded-md px-3 py-1 text-xs font-medium",
                baseCls,
                disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              ].join(" ")}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      {openError && (
        <div
          data-testid="session-open-error"
          role="alert"
          className="text-xs text-status-red"
        >
          {openError}
        </div>
      )}
    </div>
  );
}
