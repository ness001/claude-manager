// Session list left sidebar (260px) — see spec §5.5, §5.4 (view modes),
// §17.7 (search), §17.8 (virtual scrolling threshold).
//
// Layout (top → bottom):
//   1. "+ New Session" accent button
//   2. ViewModeToggle (Group / Path / Timeline)
//   3. SessionSearch
//   4. "+ Group" button (only in group view)
//   5. Scrollable grouped list of SessionCards.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  filterSessions,
  useSessionStore,
  type SessionGroup,
  type SessionViewMode,
} from "../../stores/session-store";
import type { SessionMeta } from "../../lib/session-types";
import { SessionCard } from "./SessionCard";
import { SessionSearch } from "./SessionSearch";
import { ViewModeToggle } from "./ViewModeToggle";

const VIRTUAL_THRESHOLD = 50;
const ROW_HEIGHT = 64;

interface Group {
  key: string;
  label: string;
  sessions: SessionMeta[];
}

function startedAtMs(s: SessionMeta): number {
  return s.startedAt || 0;
}

function byStartedDesc(a: SessionMeta, b: SessionMeta): number {
  return startedAtMs(b) - startedAtMs(a);
}

/** "Group" view — bucket by user-defined groups, with "Ungrouped" fallback. */
function groupByGroup(sessions: SessionMeta[], groups: SessionGroup[]): Group[] {
  const out: Group[] = [];
  for (const g of groups) {
    const items = sessions.filter((s) => s.groupId === g.id).sort(byStartedDesc);
    if (items.length > 0) {
      out.push({ key: `group:${g.id}`, label: g.name, sessions: items });
    }
  }
  const ungrouped = sessions
    .filter((s) => !s.groupId || !groups.some((g) => g.id === s.groupId))
    .sort(byStartedDesc);
  if (ungrouped.length > 0) {
    out.push({ key: "ungrouped", label: "Ungrouped", sessions: ungrouped });
  }
  return out;
}

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
    .map(([key, items]) => ({
      key,
      label: key,
      sessions: items.sort(byStartedDesc),
    }));
}

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
      const rank =
        100 + (now.getFullYear() * 12 + now.getMonth() - (d.getFullYear() * 12 + d.getMonth()));
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
      ensure(key, label, rank).items.push(s);
    }
  }

  return Array.from(buckets.entries())
    .sort(([, a], [, b]) => a.rank - b.rank)
    .map(([key, b]) => ({
      key,
      label: b.label,
      sessions: b.items.sort(byStartedDesc),
    }));
}

function groupByViewMode(
  sessions: SessionMeta[],
  viewMode: SessionViewMode,
  groups: SessionGroup[],
): Group[] {
  switch (viewMode) {
    case "my":
      return groupByGroup(sessions, groups);
    case "project":
      return groupProject(sessions);
    case "timeline":
      return groupTimeline(sessions);
  }
}

type Row =
  | { kind: "header"; key: string; groupKey: string; label: string; count: number; collapsed: boolean }
  | { kind: "card"; key: string; groupKey: string; session: SessionMeta };

function flattenGroups(groups: Group[], collapsed: Set<string>): Row[] {
  const rows: Row[] = [];
  for (const g of groups) {
    const isCollapsed = collapsed.has(g.key);
    rows.push({
      kind: "header",
      key: `h:${g.key}`,
      groupKey: g.key,
      label: g.label,
      count: g.sessions.length,
      collapsed: isCollapsed,
    });
    if (!isCollapsed) {
      for (const s of g.sessions) {
        rows.push({
          kind: "card",
          key: `c:${g.key}:${s.sessionId}`,
          groupKey: g.key,
          session: s,
        });
      }
    }
  }
  return rows;
}

function DraggableCard({
  session,
  selected,
  showDragHandle,
}: {
  session: SessionMeta;
  selected: boolean;
  showDragHandle: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `session:${session.sessionId}`,
    data: { sessionId: session.sessionId },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <SessionCard session={session} selected={selected} showDragHandle={showDragHandle} />
    </div>
  );
}

function DroppableHeader({
  groupKey,
  groupId,
  children,
}: {
  groupKey: string;
  groupId: string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${groupKey}`,
    data: { groupId },
  });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "rounded ring-2 ring-accent/60" : undefined}
    >
      {children}
    </div>
  );
}

export function SessionListPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const searchQuery = useSessionStore((s) => s.searchQuery);
  const viewMode = useSessionStore((s) => s.viewMode);
  const selectedId = useSessionStore((s) => s.selectedId);
  const launchSession = useSessionStore((s) => s.launchSession);
  const collapsedGroups = useSessionStore((s) => s.collapsedGroups);
  const toggleGroup = useSessionStore((s) => s.toggleGroup);
  const groupsList = useSessionStore((s) => s.groups);
  const createGroup = useSessionStore((s) => s.createGroup);
  const moveSessionToGroup = useSessionStore((s) => s.moveSessionToGroup);

  const filtered = useMemo(
    () => filterSessions(sessions, { searchQuery, viewMode }),
    [sessions, searchQuery, viewMode],
  );
  const groups = useMemo(
    () => groupByViewMode(filtered, viewMode, groupsList),
    [filtered, viewMode, groupsList],
  );
  const rows = useMemo(
    () => flattenGroups(groups, collapsedGroups),
    [groups, collapsedGroups],
  );

  const useVirtual = filtered.length > VIRTUAL_THRESHOLD;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const isGroupView = viewMode === "my";
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Default-collapse all groups except the first when groups are first populated.
  const prevViewModeRef = useRef(viewMode);
  useEffect(() => {
    if (prevViewModeRef.current !== viewMode) {
      prevViewModeRef.current = viewMode;
      // Reset collapse state when view mode changes — old keys are meaningless
      if (groups.length > 1) {
        const toCollapse = new Set(groups.slice(1).map((g) => g.key));
        useSessionStore.setState({ collapsedGroups: toCollapse });
      } else {
        useSessionStore.setState({ collapsedGroups: new Set() });
      }
    } else if (groups.length > 1) {
      const currentCollapsed = useSessionStore.getState().collapsedGroups;
      if (currentCollapsed.size === 0) {
        const toCollapse = new Set(groups.slice(1).map((g) => g.key));
        useSessionStore.setState({ collapsedGroups: toCollapse });
      }
    }
  }, [groups, viewMode]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const sessionId = e.active.data.current?.sessionId as string | undefined;
    const groupId = (e.over?.data.current?.groupId ?? null) as string | null;
    if (!sessionId || !e.over) return;
    moveSessionToGroup(sessionId, groupId);
  };

  const submitNewGroup = async () => {
    const name = newGroupName.trim();
    if (!name) {
      setShowCreateGroup(false);
      return;
    }
    await createGroup(name);
    setNewGroupName("");
    setShowCreateGroup(false);
  };

  const renderHeader = (
    row: Extract<Row, { kind: "header" }>,
    groupId: string | null,
    style?: React.CSSProperties,
    headerId?: string,
  ) => {
    const Icon = row.collapsed ? ChevronRight : ChevronDown;
    const headerEl = (
      <h3
        id={headerId}
        data-testid="group-header"
        style={style}
        className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted flex items-center gap-1 cursor-pointer hover:text-text-secondary"
        onClick={() => toggleGroup(row.groupKey)}
      >
        <Icon size={10} aria-hidden="true" />
        {row.label}{" "}
        <span className="text-text-muted/70">({row.count})</span>
      </h3>
    );
    if (isGroupView) {
      return (
        <DroppableHeader key={row.key} groupKey={row.groupKey} groupId={groupId}>
          {headerEl}
        </DroppableHeader>
      );
    }
    return headerEl;
  };

  const renderCard = (
    session: SessionMeta,
    selected: boolean,
    style?: React.CSSProperties,
  ) => {
    if (isGroupView) {
      return (
        <div style={style}>
          <DraggableCard session={session} selected={selected} showDragHandle />
        </div>
      );
    }
    return <SessionCard session={session} selected={selected} style={style} />;
  };

  const findGroupIdForKey = (key: string): string | null => {
    if (key === "ungrouped") return null;
    if (key.startsWith("group:")) return key.slice("group:".length);
    return null;
  };

  const listBody =
    filtered.length === 0 ? (
      <div
        data-testid="session-list-empty"
        role="status"
        aria-live="polite"
        className="flex-1 flex items-center justify-center text-xs text-text-muted px-2 text-center"
      >
        {sessions.length === 0
          ? "No sessions found"
          : `No matches for "${searchQuery}"`}
      </div>
    ) : useVirtual ? (
      <div
        ref={scrollRef}
        data-testid="virtual-scroller"
        tabIndex={0}
        role="region"
        aria-label="Sessions (scrollable)"
        className="flex-1 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                <div key={row.key} style={baseStyle}>
                  {renderHeader(row, findGroupIdForKey(row.groupKey))}
                </div>
              );
            }
            return (
              <div key={row.key} style={baseStyle}>
                {renderCard(row.session, row.session.sessionId === selectedId)}
              </div>
            );
          })}
        </div>
      </div>
    ) : (
      <div
        data-testid="non-virtual-scroller"
        tabIndex={0}
        role="region"
        aria-label="Sessions (scrollable)"
        className="flex-1 overflow-auto flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {groups.map((g) => {
          const headerId = `session-group-${g.key}`;
          const collapsed = collapsedGroups.has(g.key);
          const headerRow: Extract<Row, { kind: "header" }> = {
            kind: "header",
            key: `h:${g.key}`,
            groupKey: g.key,
            label: g.label,
            count: g.sessions.length,
            collapsed,
          };
          return (
            <div key={g.key} className="flex flex-col gap-0">
              {renderHeader(headerRow, findGroupIdForKey(g.key), undefined, headerId)}
              {!collapsed && (
                <ul
                  data-testid={`session-group-list-${g.key}`}
                  aria-labelledby={headerId}
                  className="flex flex-col gap-1"
                >
                  {g.sessions.map((s) => (
                    <li key={s.sessionId}>
                      {renderCard(s, s.sessionId === selectedId)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );

  return (
    <aside
      data-testid="session-list-panel"
      aria-label="Session list"
      className="flex h-full w-[260px] shrink-0 flex-col gap-2 border-r border-border bg-sidebar-bg p-3"
    >
      <button
        type="button"
        data-testid="new-session-btn"
        onClick={() => launchSession([])}
        className="flex items-center justify-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Plus size={14} aria-hidden="true" />
        New Session
      </button>

      <ViewModeToggle />
      <SessionSearch />

      {isGroupView &&
        (showCreateGroup ? (
          <input
            type="text"
            autoFocus
            data-testid="new-group-input"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNewGroup();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setNewGroupName("");
                setShowCreateGroup(false);
              }
            }}
            onBlur={() => submitNewGroup()}
            placeholder="Group name"
            aria-label="New group name"
            className="px-2 py-1 text-sm rounded-md bg-bg-tertiary text-text-primary border border-accent focus:outline-none"
          />
        ) : (
          <button
            type="button"
            data-testid="new-group-btn"
            onClick={() => setShowCreateGroup(true)}
            className="flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus size={12} aria-hidden="true" />
            Group
          </button>
        ))}

      {isGroupView ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {listBody}
        </DndContext>
      ) : (
        listBody
      )}
    </aside>
  );
}
