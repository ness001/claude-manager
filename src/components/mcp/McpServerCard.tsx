// MCP server card — see spec §8.3 (states + actions), §8.4 (panel layout).
//
// Status dot: green=connected, gray hollow=disconnected, red=error,
// amber pulsing=starting. Name + connection-status pill + type pill +
// scope pill. Expand/collapse toggles the McpServerDetail body. Action
// set varies per state. Shadowed servers (`isOverridden`) are dimmed
// with an "Overridden by [scope]" badge.

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { McpServer, McpServerState } from "../../lib/mcp-types";
import { McpServerDetail } from "./McpServerDetail";

interface McpServerCardProps {
  server: McpServer;
  onEdit: (server: McpServer) => void;
  onRemove: (server: McpServer) => void;
  onRetry?: (server: McpServer) => void;
  onCancel?: (server: McpServer) => void;
  onViewLogs?: (server: McpServer) => void;
  onViewTools?: (server: McpServer) => void;
  /** Substring to highlight inside the server name (spec §17.7). */
  highlightQuery?: string;
}

export function McpServerCard({
  server,
  onEdit,
  onRemove,
  onRetry,
  onCancel,
  onViewLogs,
  onViewTools,
  highlightQuery,
}: McpServerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // WAI-ARIA: a button with `aria-expanded` should also have `aria-controls`
  // pointing to the disclosed region so SR users know what region toggles.
  const detailId = useId();
  // Stable id for the destructive-confirm message so the alertdialog can
  // expose it via aria-describedby (APG alertdialog pattern).
  const confirmMsgId = useId();
  // Cancel-button ref so we can auto-focus the safest default action when
  // the destructive confirm prompt appears. Without this, keyboard users
  // hit Remove and focus stays on the (still-visible) Remove ActionButton —
  // they can't easily reach Cancel without tabbing across the whole card.
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // Where focus came from before the alertdialog opened (typically the
  // Remove ActionButton). WAI-ARIA APG alertdialog pattern + WCAG 2.4.3:
  // when the dialog closes (Esc, Cancel click, or confirm click) focus must
  // return to the element that opened it. Without this, keyboard / SR users
  // got dumped at <body> on dismissal — they had to Tab from page start to
  // relocate the trigger. Mirrors PR #204 (McpServerForm dialog close).
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (confirming) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      cancelRef.current?.focus();
    } else if (triggerRef.current && triggerRef.current.isConnected) {
      // Closing transition (true → false). Restore focus to the trigger.
      // Guard with isConnected: the trigger may have been re-rendered out
      // of the DOM (e.g., the parent list rebuilt). focus() on a detached
      // node is a no-op in browsers but throws in jsdom.
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [confirming]);

  // Escape closes the Remove-confirm dialog without removing — same UX as
  // McpServerForm (PR #36). Without this, keyboard users have no fast escape
  // hatch from a destructive prompt.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirming(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirming]);

  const dimmed = server.isOverridden;

  return (
    <div
      data-testid="mcp-server-card"
      data-server-name={server.name}
      data-scope={server.scope}
      data-status={server.status}
      className={`flex flex-col gap-2 rounded-md border border-border bg-card-bg p-3 ${dimmed ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="expand-toggle"
          aria-label={
            expanded
              ? `Collapse details for ${server.name}`
              : `Expand details for ${server.name}`
          }
          aria-expanded={expanded}
          // Only emit aria-controls when the controlled detail panel is
          // actually rendered. The panel is conditionally mounted
          // (`{expanded && <div id={detailId}>…}`), so when collapsed
          // (the default) aria-controls would point at a missing id —
          // a broken IDREF. Per WAI-ARIA, every IDREF in aria-controls
          // must resolve to an element in the document; NVDA/VoiceOver
          // flag dangling IDREFs as invalid or drop the disclosure
          // relationship entirely. Mirrors PR #189 (ToolCallBlock).
          aria-controls={expanded ? detailId : undefined}
          onClick={() => setExpanded((e) => !e)}
          className="rounded-sm text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {expanded ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          )}
        </button>
        <StatusDot state={server.status} />
        <span className="truncate text-sm font-medium text-text-primary">
          {highlightQuery ? highlight(server.name, highlightQuery) : server.name}
        </span>
        <Pill testid="status-pill" tone={statusTone(server.status)}>
          {server.status}
        </Pill>
        <Pill testid="type-pill">{server.type}</Pill>
        <Pill testid="scope-pill">{server.scope}</Pill>
        {dimmed && server.overriddenBy && (
          <Pill testid="overridden-badge" tone="warning">
            Overridden by {server.overriddenBy}
          </Pill>
        )}
      </div>

      {expanded && (
        <div id={detailId}>
          <McpServerDetail server={server} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {server.status === "connected" && (
          <>
            <ActionButton
              testid="action-view-tools"
              onClick={() => onViewTools?.(server)}
              disabled={!onViewTools}
              title={onViewTools ? undefined : "Coming soon"}
            >
              View Tools
            </ActionButton>
            <ActionButton
              testid="action-view-logs"
              onClick={() => onViewLogs?.(server)}
              disabled={!onViewLogs}
              title={onViewLogs ? undefined : "Coming soon"}
            >
              View Logs
            </ActionButton>
          </>
        )}
        {server.status === "disconnected" && (
          <ActionButton
            testid="action-view-logs"
            onClick={() => onViewLogs?.(server)}
            disabled={!onViewLogs}
            title={onViewLogs ? undefined : "Coming soon"}
          >
            View Logs
          </ActionButton>
        )}
        {server.status === "error" && (
          <>
            <ActionButton
              testid="action-retry"
              onClick={() => onRetry?.(server)}
              disabled={!onRetry}
              title={onRetry ? undefined : "Coming soon"}
            >
              Retry
            </ActionButton>
            <ActionButton
              testid="action-view-logs"
              onClick={() => onViewLogs?.(server)}
              prominent
              disabled={!onViewLogs}
              title={onViewLogs ? undefined : "Coming soon"}
            >
              View Logs
            </ActionButton>
          </>
        )}
        {server.status === "starting" && (
          <>
            <ActionButton
              testid="action-cancel"
              onClick={() => onCancel?.(server)}
              disabled={!onCancel}
              title={onCancel ? undefined : "Coming soon"}
            >
              Cancel
            </ActionButton>
            <ActionButton
              testid="action-view-logs"
              onClick={() => onViewLogs?.(server)}
              disabled={!onViewLogs}
              title={onViewLogs ? undefined : "Coming soon"}
            >
              View Logs
            </ActionButton>
          </>
        )}
        {(server.status === "connected" ||
          server.status === "disconnected" ||
          server.status === "error") && (
          <>
            <ActionButton testid="action-edit" onClick={() => onEdit(server)}>
              Edit
            </ActionButton>
            <ActionButton testid="action-remove" onClick={() => setConfirming(true)}>
              Remove
            </ActionButton>
          </>
        )}
      </div>

      {confirming && (
        <div
          data-testid="remove-confirm-dialog"
          role="alertdialog"
          aria-label="Confirm remove"
          aria-describedby={confirmMsgId}
          className="flex items-center justify-between rounded border border-status-error bg-bg-tertiary p-2 text-xs"
        >
          <span id={confirmMsgId}>Remove server "{server.name}"?</span>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="remove-confirm"
              onClick={() => {
                setConfirming(false);
                onRemove(server);
              }}
              className="rounded border border-status-error px-2 py-0.5 text-status-error hover:bg-status-error hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
            >
              Remove
            </button>
            <button
              type="button"
              data-testid="remove-cancel"
              ref={cancelRef}
              onClick={() => setConfirming(false)}
              className="rounded border border-border px-2 py-0.5 text-text-secondary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ state }: { state: McpServerState }) {
  const cls = (() => {
    switch (state) {
      case "connected":
        return "bg-status-success";
      case "disconnected":
        return "border border-text-muted bg-transparent";
      case "error":
        return "bg-status-error";
      case "starting":
        return "animate-pulse bg-status-warning";
    }
  })();
  // WCAG 1.4.1 (Use of Color) + 4.1.2 (Name, Role, Value): the colored dot
  // is the only programmatic state indicator on the card header. Without
  // role="img" the bare aria-label is attached to a generic <span>, which
  // most screen readers skip during element-by-element navigation. Mirrors
  // SessionCard (PR #41) and PluginCard (status-dot tests).
  return (
    <span
      data-testid="status-dot"
      data-state={state}
      role="img"
      aria-label={`status: ${state}`}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`}
    />
  );
}

type Tone = "default" | "warning" | "success" | "error";
function statusTone(state: McpServerState): Tone {
  if (state === "connected") return "success";
  if (state === "error") return "error";
  if (state === "starting") return "warning";
  return "default";
}

function Pill({
  children,
  tone = "default",
  testid,
}: {
  children: React.ReactNode;
  tone?: Tone;
  testid?: string;
}) {
  const cls =
    tone === "success"
      ? "bg-status-success/10 text-status-success"
      : tone === "error"
        ? "bg-status-error/10 text-status-error"
        : tone === "warning"
          ? "bg-status-warning/10 text-status-warning"
          : "bg-bg-tertiary text-text-secondary";
  return (
    <span
      data-testid={testid}
      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

function ActionButton({
  testid,
  onClick,
  children,
  prominent = false,
  disabled = false,
  title,
}: {
  testid: string;
  onClick: () => void;
  children: React.ReactNode;
  prominent?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const cls = disabled
    ? "border-border text-text-secondary cursor-not-allowed opacity-50"
    : prominent
      ? "border-status-error text-status-error hover:bg-status-error hover:text-white"
      : "border-border text-text-secondary hover:bg-bg-tertiary";
  // WCAG 2.4.7 Focus Visible — all action buttons here (View Tools / Logs /
  // Retry / Cancel / Edit / Remove) are keyboard targets but rely on the
  // browser default ring, which Tauri's WebView renders inconsistently. Use
  // the same focus-visible trio as #117 / #118 / #119 / #125 / #126.
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      title={title}
      // WCAG 4.1.2 (Name, Role, Value): when a stub is `disabled` with a
      // `title` hint (e.g. "Coming soon"), the hint is sighted-only —
      // tooltip-on-hover gives nothing to keyboard/SR users. Mirror the
      // title into aria-label so SR users hear "View Logs — Coming soon"
      // instead of "View Logs, button, dimmed". All call sites pass a
      // string child, so the coercion is straightforward. Mirrors PR #181
      // (QuickActions), PR #183 (SessionListPanel new-session), PR #184
      // (SessionInfoBar actions), PluginCard Reinstall/Remove stubs.
      aria-label={
        disabled && title && typeof children === "string"
          ? `${children} — ${title}`
          : undefined
      }
      className={`rounded border px-2 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${cls}`}
    >
      {children}
    </button>
  );
}

/** Wrap matching substring in a `<mark>` with `bg-accent/20` per
 *  spec §17.7. Case-insensitive. */
function highlight(text: string, q: string): React.ReactNode {
  const query = q.trim();
  if (query === "") return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        data-testid="search-highlight"
        className="bg-accent/20 text-text-primary"
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
