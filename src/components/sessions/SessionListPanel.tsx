// Session list left sidebar (260px) — see spec §5.5, §5.4 (view modes),
// §17.7 (search), §17.8 (virtual scrolling threshold).
//
// Layout (top → bottom):
//   1. "+ New Session" accent button (action wired in a later phase)
//   2. ViewModeToggle (My View / Project / Timeline)
//   3. SessionSearch
//   4. Scrollable grouped list of SessionCards. When the post-filter session
//      count exceeds VIRTUAL_THRESHOLD we render via @tanstack/react-virtual
//      so the DOM stays small even for 500+ sessions.

import { useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  filterSessions,
  useSessionStore,
  type SessionViewMode,
} from "../../stores/session-store";
import type { SessionMeta } from "../../lib/session-types";
import { SessionCard } from "./SessionCard";
import { SessionSearch } from "./SessionSearch";
import { ViewModeToggle } from "./ViewModeToggle";

/** Spec §17.8 — switch to virtualization when the list exceeds 50 entries. */
const VIRTUAL_THRESHOLD = 50;

/** Approximate row height (card + gap), used to size the virtual scroller. */
const ROW_HEIGHT = 64;

/** A header + its sessions, in the order they should render. */
interface Group {
  key: string;
  label: string;
  sessions: SessionMeta[];
}

/**
 * Parse SessionMeta.startedAt (ISO string, may be empty) into epoch ms.
 * Empty / unparseable → 0 (sorts last in "newest first" ordering).
 */
function startedAtMs(s: SessionMeta): number {
  if (!s.startedAt) return 0;
  const v = Date.parse(s.startedAt);
  return Number.isNaN(v) ? 0 : v;
}

/** "My View" — pinned items first, then a single "All" bucket (groups TBD). */
function groupMy(sessions: SessionMeta[]): Group[] {
  const pinned = sessions.filter((s) => s.isPinned);
  const rest = sessions.filter((s) => !s.isPinned);
  const groups: Group[] = [];
  if (pinned.length > 0) {
    groups.push({ key: "pinned", label: "Pinned", sessions: pinned });
  }
  if (rest.length > 0) {
    groups.push({ key: "all", label: "All Sessions", sessions: rest });
  }
  return groups;
}

/** "Project" — bucket by CWD. */
function groupProject(sessions: SessionMeta[]): Group[] {
  const buckets = new Map<string, SessionMeta[]>();
  for (const s of sessions) {
    const key = s.cwd || "(unknown)";
    const existing = buckets.get(key);
    if (existing) existing.push(s);
    else buckets.set(key, [s]);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, label: key, sessions: items }));
}

/** "Timeline" — Today / Yesterday / This Week / by month. */
function groupTimeline(sessions: SessionMeta[]): Group[] {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const yesterday = today - 24 * 3600_000;
  const weekStart = today - 6 * 24 * 3600_000;

  type Bucket = { label: string; rank: number; items: SessionMeta[] };
  const buckets = new Map<string, Bucket>();

  const ensure = (key: string, label: string, rank: number): Bucket => {
    let b = buckets.get(key);
    if (!b) {
      b = { label, rank, items: [] };
      buckets.set(key, b);
    }
    return b;
  };

  for (const s of sessions) {
    const ms = startedAtMs(s);
    if (ms === 0) {
      ensure("undated", "Undated", 9999).items.push(s);
      continue;
    }
    const sod = startOfDay(new Date(ms));
    if (sod === today) {
      ensure("today", "Today", 0).items.push(s);
    } else if (sod === yesterday) {
      ensure("yesterday", "Yesterday", 1).items.push(s);
    } else if (sod >= weekStart) {
      ensure("week", "This Week", 2).items.push(s);
    } else {
      const d = new Date(ms);
      // Older months sort later via negative epoch rank → larger number.
      const rank = 100 + (now.getFullYear() * 12 + now.getMonth() - (d.getFullYear() * 12 + d.getMonth()));
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
      ensure(key, label, rank).items.push(s);
    }
  }

  return Array.from(buckets.entries())
    .sort(([, a], [, b]) => a.rank - b.rank)
    .map(([key, b]) => ({ key, label: b.label, sessions: b.items }));
}

function groupByViewMode(
  sessions: SessionMeta[],
  viewMode: SessionViewMode,
): Group[] {
  switch (viewMode) {
    case "my":
      return groupMy(sessions);
    case "project":
      return groupProject(sessions);
    case "timeline":
      return groupTimeline(sessions);
  }
}

/** A header + cards flattened into a single ordered array for virtualization. */
type Row =
  | { kind: "header"; key: string; label: string; count: number }
  | { kind: "card"; key: string; session: SessionMeta };

function flattenGroups(groups: Group[]): Row[] {
  const rows: Row[] = [];
  for (const g of groups) {
    rows.push({ kind: "header", key: `h:${g.key}`, label: g.label, count: g.sessions.length });
    for (const s of g.sessions) {
      rows.push({ kind: "card", key: `c:${g.key}:${s.sessionId}`, session: s });
    }
  }
  return rows;
}

export function SessionListPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const searchQuery = useSessionStore((s) => s.searchQuery);
  const viewMode = useSessionStore((s) => s.viewMode);
  const selectedId = useSessionStore((s) => s.selectedId);

  // useMemo so we don't recompute on every parent render — only when the
  // inputs actually change. This is the referential-equality guard the spec
  // mentions in T2.6.
  const filtered = useMemo(
    () => filterSessions(sessions, { searchQuery, viewMode }),
    [sessions, searchQuery, viewMode],
  );
  const groups = useMemo(
    () => groupByViewMode(filtered, viewMode),
    [filtered, viewMode],
  );
  const rows = useMemo(() => flattenGroups(groups), [groups]);

  const useVirtual = filtered.length > VIRTUAL_THRESHOLD;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  return (
    <aside
      data-testid="session-list-panel"
      className="flex h-full w-[260px] shrink-0 flex-col gap-2 border-r border-border bg-sidebar-bg p-3"
    >
      <button
        type="button"
        data-testid="new-session-btn"
        className="flex items-center justify-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
      >
        <Plus size={14} />
        New Session
      </button>

      <ViewModeToggle />
      <SessionSearch />

      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-text-muted px-2 text-center">
          {sessions.length === 0
            ? "No sessions found"
            : `No matches for "${searchQuery}"`}
        </div>
      ) : useVirtual ? (
        <div
          ref={scrollRef}
          data-testid="virtual-scroller"
          className="flex-1 overflow-auto"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const baseStyle = {
                position: "absolute" as const,
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              };
              if (row.kind === "header") {
                return (
                  <div
                    key={row.key}
                    data-testid="group-header"
                    style={baseStyle}
                    className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {row.label}{" "}
                    <span className="text-text-muted/70">({row.count})</span>
                  </div>
                );
              }
              return (
                <SessionCard
                  key={row.key}
                  session={row.session}
                  selected={row.session.sessionId === selectedId}
                  style={baseStyle}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto flex flex-col gap-1">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1">
              <div
                data-testid="group-header"
                className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
              >
                {g.label}{" "}
                <span className="text-text-muted/70">({g.sessions.length})</span>
              </div>
              {g.sessions.map((s) => (
                <SessionCard
                  key={s.sessionId}
                  session={s}
                  selected={s.sessionId === selectedId}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
