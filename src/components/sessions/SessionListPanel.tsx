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
 * Read SessionMeta.startedAt (epoch ms). 0 → sorts last in "newest first".
 */
function startedAtMs(s: SessionMeta): number {
  return s.startedAt || 0;
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
      aria-label="Session list"
      className="flex h-full w-[260px] shrink-0 flex-col gap-2 border-r border-border bg-sidebar-bg p-3"
    >
      {/* TODO(T4.1, T4.2): wire New Session button to launch the New Session
        * dialog. Phase 4 plan tasks: T4.1 (New Session Dialog Types & Launcher),
        * T4.2 (New Session Dialog UI). Per CLAUDE.md R2 (Orphan-placeholder
        * rule), every disabled stub must declare its wire-up task ID inline
        * so the placeholder isn't an undiscoverable orphan. */}
      <button
        type="button"
        data-testid="new-session-btn"
        disabled
        aria-disabled="true"
        // Sighted users see the "Coming soon …" tooltip on hover; mirror
        // the gist into the accessible name so screen-reader users hear
        // the same hint instead of just "New Session, button, dimmed"
        // and assuming the app is broken (WCAG 4.1.2). Mirrors the same
        // fix applied to QuickActions buttons.
        aria-label="New Session (coming soon)"
        title="Coming soon — launch a new Claude session from here once the IPC is wired"
        className="flex items-center justify-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white opacity-50 cursor-not-allowed"
      >
        <Plus size={14} aria-hidden="true" />
        New Session
      </button>

      <ViewModeToggle />
      <SessionSearch />

      {filtered.length === 0 ? (
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
          // WCAG 2.1.1 (Keyboard) + WAI-ARIA APG: a scrollable region must
          // be keyboard-focusable, otherwise keyboard-only users with > 50
          // sessions cannot scroll the list — only mouse/trackpad users
          // can. Tabbing into individual cards relies on the browser
          // scrolling them into view, which works for moving forward one
          // card at a time but not for skimming. Mirrors ConversationViewer
          // (lines 354-369) which fixed the same defect class.
          // role="region" + aria-label promotes the focusable scroller to
          // a named landmark surfaced in the AT landmarks rotor.
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
                  <h3
                    key={row.key}
                    data-testid="group-header"
                    style={baseStyle}
                    className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {row.label}{" "}
                    <span className="text-text-muted/70">({row.count})</span>
                  </h3>
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
        // WCAG 2.1.1 (Keyboard) + WAI-ARIA APG: the non-virtual scroller
        // must be keyboard-focusable too — the virtual branch above (lines
        // 240-243) was already fixed for this defect, but the ≤50-session
        // branch (the overwhelmingly common case) still rendered a bare
        // <div> with overflow-auto. Keyboard-only users with a tall
        // session list could not arrow-scroll the list region; they had
        // to Tab through every card to advance, with no way to skim.
        // Mirror the same fix here: tabIndex=0 + role="region" +
        // aria-label so the scroller appears in the AT landmarks rotor
        // and accepts arrow-key scrolling. Mirrors ConversationViewer
        // (lines 354-369) and the virtual branch above.
        <div
          data-testid="non-virtual-scroller"
          tabIndex={0}
          role="region"
          aria-label="Sessions (scrollable)"
          className="flex-1 overflow-auto flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {groups.map((g) => {
            // WCAG 1.3.1 (Info and Relationships): each group's cards form
            // a labelled list under the <h3> group header but were emitted
            // as flat sibling <SessionCard> <div>s — SR rotor's Lists view
            // (NVDA/JAWS "L", VoiceOver rotor → Lists) heard nothing for
            // the collection and the per-group count was lost. Promote
            // each group's cards into <ul aria-labelledby={header-id}> with
            // one <li> per card so the rotor surfaces "list, N items, <group
            // label>". Mirrors PRs #235/#236/#237/#238/#239/#240/#241.
            //
            // NOTE: only the non-virtual branch is wrapped — the virtual
            // branch above renders headers and cards interleaved with
            // absolute positioning, where wrapping individual cards in <li>
            // outside a <ul> would be invalid HTML and re-grouping would
            // require restructuring the virtualizer output. The non-virtual
            // branch (≤50 sessions) is the overwhelmingly common case.
            const headerId = `session-group-${g.key}`;
            return (
              <div key={g.key} className="flex flex-col gap-1">
                <h3
                  id={headerId}
                  data-testid="group-header"
                  className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                >
                  {g.label}{" "}
                  <span className="text-text-muted/70">({g.sessions.length})</span>
                </h3>
                <ul
                  data-testid={`session-group-list-${g.key}`}
                  aria-labelledby={headerId}
                  className="flex flex-col gap-1"
                >
                  {g.sessions.map((s) => (
                    <li key={s.sessionId}>
                      <SessionCard
                        session={s}
                        selected={s.sessionId === selectedId}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
