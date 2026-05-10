// MCP server card — see spec §8.3 (states + actions), §8.4 (panel layout).
//
// Status dot: green=connected, gray hollow=disconnected, red=error,
// amber pulsing=starting. Name + connection-status pill + type pill +
// scope pill. Expand/collapse toggles the McpServerDetail body. Action
// set varies per state. Shadowed servers (`isOverridden`) are dimmed
// with an "Overridden by [scope]" badge.

import { useEffect, useState } from "react";
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
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
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

      {expanded && <McpServerDetail server={server} />}

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
          role="dialog"
          aria-label="Confirm remove"
          className="flex items-center justify-between rounded border border-status-error bg-bg-tertiary p-2 text-xs"
        >
          <span>Remove server "{server.name}"?</span>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="remove-confirm"
              onClick={() => {
                setConfirming(false);
                onRemove(server);
              }}
              className="rounded border border-status-error px-2 py-0.5 text-status-error hover:bg-status-error hover:text-white"
            >
              Remove
            </button>
            <button
              type="button"
              data-testid="remove-cancel"
              onClick={() => setConfirming(false)}
              className="rounded border border-border px-2 py-0.5 text-text-secondary hover:bg-bg-secondary"
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
  return (
    <span
      data-testid="status-dot"
      data-state={state}
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
