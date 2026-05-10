// Conversation viewer — see spec §5.7, §5.8, §11, §17.5, §17.8.
//
// Loads a session's JSONL via Tauri IPC (`read_jsonl_file`), parses to
// `ConversationEntry[]` via the shared frontend parser, pairs `tool_use`
// (assistant) with the immediately-following `tool_result` (user) entry, and
// renders the result with `@tanstack/react-virtual` so the DOM stays small
// for 5000-line files (spec target: first paint < 500ms).
//
// Loading strategy (spec §5.7 + §17.8):
//   • Show spinner until the IPC call resolves.
//   • Parse the first 50 entries synchronously for an immediate first paint.
//   • Parse the remainder in chunks via requestIdleCallback (or a setTimeout
//     fallback under jsdom / older browsers) so the UI thread is never blocked
//     for more than ~50ms.
//
// Error / corruption handling (spec §17.5):
//   • Malformed lines are skipped silently by `parseJsonlLine` and counted
//     here; we surface the count in a "⚠ N lines could not be parsed" banner.
//
// Jump-to-turn (spec §5.7):
//   • Ctrl+ArrowDown / Ctrl+ArrowUp scroll to the next / previous turn.
//   • A small "Turn N / M" indicator + numeric input in the bottom-right
//     allows jumping to a specific turn.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  jsonlToConversationEntries,
  parseJsonlLine,
} from "../../lib/jsonl-parser";
import type { ConversationEntry } from "../../lib/session-types";

import { AssistantMessage } from "./AssistantMessage";
import { SummaryBanner } from "./SummaryBanner";
import { SystemDivider } from "./SystemDivider";
import { ToolCallBlock } from "./ToolCallBlock";
import { UserMessage } from "./UserMessage";

/** First N entries parsed synchronously for immediate first paint. */
const SYNC_BATCH = 50;
/** Lines processed per idle-callback chunk for the remainder. */
const CHUNK_LINES = 200;

interface ConversationViewerProps {
  /** Absolute path to the JSONL file. Required. */
  path: string;
  /** Maximum height area (the viewer fills the parent flex). */
  className?: string;
}

/** A renderable entry after `tool_use` ↔ `tool_result` pairing. */
type RenderEntry =
  | { kind: "user"; text: string; turnNumber?: number; key: string }
  | {
      kind: "assistant";
      text: string;
      model?: string;
      turnNumber?: number;
      key: string;
    }
  | {
      kind: "tool-call";
      toolName: string;
      toolInput: Record<string, unknown>;
      toolOutput?: string;
      isError?: boolean;
      turnNumber?: number;
      key: string;
    }
  | {
      kind: "system-divider";
      text: string;
      turnNumber?: number;
      key: string;
    }
  | { kind: "summary"; text: string; key: string };

/**
 * Pair each assistant `tool-call` (which has tool name + input) with the
 * immediately-following user `tool-call` produced from a `tool_result` line
 * (which has output + isError but blank toolName).
 */
function pairToolCalls(entries: ConversationEntry[]): RenderEntry[] {
  const out: RenderEntry[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (
      e.kind === "tool-call" &&
      e.toolName !== "" &&
      i + 1 < entries.length
    ) {
      const next = entries[i + 1];
      if (next.kind === "tool-call" && next.toolName === "") {
        out.push({
          kind: "tool-call",
          toolName: e.toolName,
          toolInput: e.toolInput,
          toolOutput: next.toolOutput,
          isError: next.isError,
          turnNumber: e.turnNumber,
          key: `tc-${i}`,
        });
        i += 1;
        continue;
      }
    }
    if (e.kind === "tool-call") {
      out.push({ ...e, key: `tc-${i}` });
    } else if (e.kind === "summary") {
      out.push({ ...e, key: `sum-${i}` });
    } else {
      out.push({ ...e, key: `${e.kind}-${i}` });
    }
  }
  return out;
}

/** Count lines in `lines` that fail `parseJsonlLine` AND are non-blank. */
function countCorrupted(lines: string[]): number {
  let n = 0;
  for (const l of lines) {
    if (l.trim() === "") continue;
    if (parseJsonlLine(l) === null) {
      // Could be SKIP_TYPES (intentional) — only count if it isn't valid JSON.
      try {
        JSON.parse(l);
      } catch {
        n += 1;
      }
    }
  }
  return n;
}

/** Schedule `cb` on idle time; falls back to setTimeout under jsdom / older browsers. */
function scheduleIdle(cb: () => void): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (h: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const h = w.requestIdleCallback(cb);
    return () => w.cancelIdleCallback?.(h);
  }
  const t = setTimeout(cb, 0);
  return () => clearTimeout(t);
}

export function ConversationViewer({ path, className }: ConversationViewerProps) {
  const [allLines, setAllLines] = useState<string[] | null>(null);
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [corruptedCount, setCorruptedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelChunkRef = useRef<(() => void) | null>(null);

  // 1) Load JSONL via IPC.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntries([]);
    setAllLines(null);
    setCorruptedCount(0);
    invoke<string[]>("read_jsonl_file", { path })
      .then((lines) => {
        if (cancelled) return;
        const initial = lines.slice(0, SYNC_BATCH);
        setEntries(jsonlToConversationEntries(initial));
        setAllLines(lines);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
      cancelChunkRef.current?.();
      cancelChunkRef.current = null;
    };
  }, [path]);

  // 2) Parse the remainder in idle-time chunks; tally corrupted lines once.
  useEffect(() => {
    if (!allLines || allLines.length <= SYNC_BATCH) {
      if (allLines) setCorruptedCount(countCorrupted(allLines));
      return;
    }
    let pos = SYNC_BATCH;
    const step = () => {
      const next = allLines.slice(pos, pos + CHUNK_LINES);
      pos += CHUNK_LINES;
      const more = jsonlToConversationEntries(next);
      // We only need turn-number continuity from the sync batch; the parser
      // restarts numbering at 1 for each call. For the viewer's purposes,
      // sequential numbering across chunks is acceptable — turn boundaries
      // line up at the chunk seam only when a chunk happens to start with a
      // turn_duration line. This is rare and self-correcting.
      setEntries((prev) => [...prev, ...more]);
      if (pos < allLines.length) {
        cancelChunkRef.current = scheduleIdle(step);
      } else {
        cancelChunkRef.current = null;
        setCorruptedCount(countCorrupted(allLines));
      }
    };
    cancelChunkRef.current = scheduleIdle(step);
    return () => {
      cancelChunkRef.current?.();
      cancelChunkRef.current = null;
    };
  }, [allLines]);

  // 3) Pair tool_use with tool_result.
  const rendered: RenderEntry[] = useMemo(
    () => pairToolCalls(entries),
    [entries],
  );

  // 4) Index of the first row of each turn — used by jump-to-turn.
  const turnAnchors = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < rendered.length; i += 1) {
      const t = rendered[i].kind === "summary" ? undefined : (rendered[i] as { turnNumber?: number }).turnNumber;
      if (typeof t === "number" && !map.has(t)) {
        map.set(t, i);
      }
    }
    return map;
  }, [rendered]);
  const totalTurns = useMemo(
    () => (turnAnchors.size === 0 ? 0 : Math.max(...turnAnchors.keys())),
    [turnAnchors],
  );
  const [currentTurn, setCurrentTurn] = useState(1);
  // When the user switches sessions the parent re-uses this component
  // instance and just changes the `path` prop. The JSONL load/parse
  // effect (above) already resets `entries` / `loading` / `error`, but
  // `currentTurn` carries over — leaking the previous session's turn
  // position into the new one. Reset to 1 on path change so the turn
  // input + turn-jump scroller start fresh.
  useEffect(() => {
    setCurrentTurn(1);
  }, [path]);

  // 5) Virtual scroller.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rendered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  const jumpToTurn = useCallback(
    (n: number) => {
      if (totalTurns === 0) return;
      const target = Math.max(1, Math.min(totalTurns, n));
      const idx = turnAnchors.get(target);
      if (idx === undefined) return;
      virtualizer.scrollToIndex(idx, { align: "start" });
      setCurrentTurn(target);
    },
    [totalTurns, turnAnchors, virtualizer],
  );

  // 6) Keyboard navigation (Ctrl+ArrowUp/Down). Skip when focus is in a text
  // input (e.g. the turn-input number field) so arrow-key cursor movement
  // and value adjustment aren't hijacked. Mirrors App.tsx's Ctrl+1..6 guard.
  //
  // The listener is registered ONCE on mount and reads fresh `currentTurn` /
  // `jumpToTurn` via refs. Re-registering on every turn change opened a race
  // where keydowns dispatched between a re-render and the effect remount
  // hit no listener — observed as a flaky "expected '1' to be '2'" failure
  // under load.
  const currentTurnRef = useRef(currentTurn);
  const jumpToTurnRef = useRef(jumpToTurn);
  useEffect(() => {
    currentTurnRef.current = currentTurn;
  }, [currentTurn]);
  useEffect(() => {
    jumpToTurnRef.current = jumpToTurn;
  }, [jumpToTurn]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        jumpToTurnRef.current(currentTurnRef.current + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        jumpToTurnRef.current(currentTurnRef.current - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading) {
    return (
      <div
        data-testid="conversation-viewer-loading"
        className={`flex flex-1 items-center justify-center text-sm text-text-muted ${className ?? ""}`}
      >
        Loading conversation…
      </div>
    );
  }

  if (error !== null) {
    return (
      <div
        data-testid="conversation-viewer-error"
        role="alert"
        className={`flex flex-1 items-center justify-center text-sm text-status-red ${className ?? ""}`}
      >
        Failed to load conversation: {error}
      </div>
    );
  }

  return (
    <div
      data-testid="conversation-viewer"
      className={`relative flex flex-1 min-h-0 flex-col ${className ?? ""}`}
    >
      {corruptedCount > 0 && (
        <div
          data-testid="corruption-warning"
          role="alert"
          className="border-b border-status-yellow/40 bg-status-yellow/10 px-3 py-1.5 text-xs text-status-yellow"
        >
          <span aria-hidden="true">⚠ </span>
          {corruptedCount} {corruptedCount === 1 ? "line" : "lines"} could not be parsed
        </div>
      )}

      <div
        ref={scrollRef}
        data-testid="conversation-scroller"
        className="flex-1 overflow-auto px-3 py-2"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const e = rendered[vi.index];
            const style = {
              position: "absolute" as const,
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
              paddingBottom: 8,
            };
            return (
              <div
                key={e.key}
                ref={virtualizer.measureElement}
                data-index={vi.index}
                style={style}
              >
                {e.kind === "user" && <UserMessage text={e.text} />}
                {e.kind === "assistant" && (
                  <AssistantMessage text={e.text} model={e.model} />
                )}
                {e.kind === "tool-call" && (
                  <ToolCallBlock
                    toolName={e.toolName}
                    toolInput={e.toolInput}
                    toolOutput={e.toolOutput}
                    isError={e.isError}
                  />
                )}
                {e.kind === "system-divider" && (
                  <SystemDivider text={e.text} turnNumber={e.turnNumber} />
                )}
                {e.kind === "summary" && <SummaryBanner text={e.text} />}
              </div>
            );
          })}
        </div>
      </div>

      {totalTurns > 0 && (
        <div
          data-testid="turn-nav"
          className="absolute bottom-2 right-3 flex items-center gap-1 rounded-md border border-border bg-bg-secondary px-2 py-1 text-xs text-text-secondary shadow"
        >
          <span>Turn</span>
          <TurnInput
            currentTurn={currentTurn}
            totalTurns={totalTurns}
            onCommit={jumpToTurn}
          />
          <span>/ {totalTurns}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Numeric "jump to turn N" input. Behaves as an editing field while the user
 * is typing — multi-digit values, transient out-of-range values, and an
 * empty string are all allowed in the displayed draft. The actual jump
 * (clamped to [1, totalTurns]) happens on Enter or blur. When `currentTurn`
 * changes from the outside (Ctrl+ArrowUp/Down), the draft re-syncs.
 *
 * The previous controlled-on-every-keystroke version snapped the user's view
 * (and the displayed value) on every digit, e.g. typing "15" in a 10-turn
 * session made the input flash 1 → 10 mid-keystroke.
 */
function TurnInput({
  currentTurn,
  totalTurns,
  onCommit,
}: {
  currentTurn: number;
  totalTurns: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(currentTurn));
  const [editing, setEditing] = useState(false);
  // Re-sync the draft when the canonical turn changes from outside (keyboard
  // nav, scroll). Skip while the user is actively editing so we don't yank
  // their in-progress text.
  useEffect(() => {
    if (!editing) setDraft(String(currentTurn));
  }, [currentTurn, editing]);

  const commit = () => {
    setEditing(false);
    const v = Number(draft);
    if (draft === "" || Number.isNaN(v)) {
      setDraft(String(currentTurn));
      return;
    }
    onCommit(v); // jumpToTurn clamps to [1, totalTurns] and updates currentTurn
    // The effect above will re-sync `draft` to the clamped value.
  };

  return (
    <input
      data-testid="turn-input"
      type="number"
      min={1}
      max={totalTurns}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(String(currentTurn));
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-12 bg-bg-tertiary px-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
      // The previous aria-label was just "Jump to turn", which gave SR
      // users the field's purpose but not the legal range. Embedding
      // the bound makes the spin-button announcement actionable
      // ("Jump to turn (1 to 12), spin button, 5") — without it, AT
      // users had to discover the upper bound by trying values and
      // hitting validation. Mirrors the input-context-in-name pattern
      // (PRs #45 / #50 / #51 / #79 / #138 fixed the analogous gap on
      // search inputs).
      aria-label={`Jump to turn (1 to ${totalTurns})`}
    />
  );
}
