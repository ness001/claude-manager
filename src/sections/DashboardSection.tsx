// Dashboard section — see spec §4.1, §6.
//
// Layout:
//   Row 1: 4 StatCards in a grid (Sessions / Messages / Longest / Active Since)
//   Row 2: ActivityChart (60%) + ModelDonut (40%)
//   Row 3: RecentSessions (60%) + (QuickActions + SystemHealth) (40%)
//
// One-shot data load on mount via dashboardStore.loadDashboard(). FS watchers
// and live updates are deferred to Phase 4 Task 10.

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { ActivityChart } from "../components/dashboard/ActivityChart";
import { ModelDonut } from "../components/dashboard/ModelDonut";
import { QuickActions } from "../components/dashboard/QuickActions";
import { RecentSessions } from "../components/dashboard/RecentSessions";
import { StatCard } from "../components/dashboard/StatCard";
import { SystemHealth } from "../components/dashboard/SystemHealth";
import { useDashboardStore } from "../stores/dashboard-store";

/** Format an epoch ms into "Mon DD, YYYY" — used by the "Active since" card. */
function formatDate(ms: number | null): string {
  if (ms == null) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DashboardSection() {
  const totalSessions = useDashboardStore((s) => s.totalSessions);
  const totalMessages = useDashboardStore((s) => s.totalMessages);
  const longestSession = useDashboardStore((s) => s.longestSession);
  const activeSince = useDashboardStore((s) => s.activeSince);
  const activityData = useDashboardStore((s) => s.activityData);
  const modelUsage = useDashboardStore((s) => s.modelUsage);
  const recentSessions = useDashboardStore((s) => s.recentSessions);
  const loadError = useDashboardStore((s) => s.loadError);
  const loadDashboard = useDashboardStore((s) => s.loadDashboard);

  useEffect(() => {
    void loadDashboard().catch(() => {
      // Store falls back to safe defaults internally — empty states render.
    });
  }, [loadDashboard]);

  return (
    <section
      data-testid="dashboard-section"
      aria-labelledby="dashboard-heading"
      className="flex flex-col gap-4 p-6 h-full overflow-auto"
    >
      {/* Visually hidden but exposed to AT — gives the section landmark an
          accessible name (WCAG 2.4.6 / 1.3.1) and starts the heading
          hierarchy at h1, so the inner panel <h3>s no longer leap from
          nothing. The other sections (PluginsSection via PluginListView,
          SettingsSection) already render an <h1>. */}
      <h1 id="dashboard-heading" className="sr-only">
        Dashboard
      </h1>

      {loadError ? (
        <div
          data-testid="dashboard-load-error"
          role="alert"
          // WCAG 1.4.11 (Non-text Contrast) + theme-token convention:
          // the original `yellow-500` Tailwind palette gave the
          // AlertTriangle icon ~1.7:1 against the `bg-yellow-500/10`
          // tinted card-bg in light mode — well below the 3:1 floor
          // for graphical UI components. The bare `yellow-500` also
          // bypassed this codebase's theme-token convention (every
          // other warning UI uses `--color-status-amber`, theme-aware:
          // #d97706 light / #fab387 dark) so the banner did not swap
          // correctly between themes. Swap to `status-amber` to match
          // the sibling fix (PR #293 ActivityChart staleness banner)
          // and the larger four-PR sweep for warning-color contrast
          // (#294 / #295 / #296 / #297). On light card-bg the icon
          // stroke is now ~4.0:1 — comfortably above the 3:1 non-text
          // floor — and dark theme already had adequate contrast
          // because #fab387 is a pale color on dark surfaces.
          className="flex items-center gap-2 rounded-md border border-status-amber/40 bg-status-amber/10 px-3 py-2 text-xs text-text-primary"
        >
          <AlertTriangle size={14} className="shrink-0 text-status-amber" aria-hidden />
          <span>
            Couldn&apos;t load some dashboard stats — figures may be stale.
            <span className="ml-1 text-text-muted">({loadError})</span>
          </span>
        </div>
      ) : null}

      {/* Row 1 — 4 stat cards */}
      {/* WCAG 1.3.1 (Info and Relationships): the four stat cards form a
          logical group of "key statistics" but were emitted as flat sibling
          <StatCard>s inside a non-semantic <div className="grid">. SR users
          navigating by lists (NVDA/JAWS "L", VoiceOver rotor → Lists) heard
          nothing for this collection — the count was lost and the cards had
          no programmatic group label. Promote the grid container to a
          <ul aria-label="Key statistics"> with one <li> per card so the
          rotor surfaces "list, 4 items, Key statistics". CSS Grid is
          element-agnostic — <ul> with display:grid lays out identically.
          Mirrors PRs #235/#236/#237/#238/#239 and #230. */}
      <ul
        data-testid="dashboard-row-1"
        aria-label="Key statistics"
        className="grid grid-cols-4 gap-4"
      >
        <li>
          <StatCard value={totalSessions} label="Sessions" accent="green" />
        </li>
        <li>
          <StatCard value={totalMessages} label="Messages" accent="blue" />
        </li>
        <li>
          <StatCard
            value={longestSession?.messageCount ?? 0}
            label="Longest Session"
            accent="yellow"
            sublabel={longestSession?.name || undefined}
          />
        </li>
        <li>
          <StatCard
            value={formatDate(activeSince)}
            label="Active Since"
            accent="mauve"
          />
        </li>
      </ul>

      {/* Row 2 — Activity (60%) + Model donut (40%) */}
      <div
        data-testid="dashboard-row-2"
        className="grid grid-cols-5 gap-4 min-h-[260px]"
      >
        <div className="col-span-3">
          <ActivityChart data={activityData} />
        </div>
        <div className="col-span-2">
          <ModelDonut data={modelUsage} />
        </div>
      </div>

      {/* Row 3 — Recent sessions (60%) + (Quick actions + System health) (40%) */}
      <div
        data-testid="dashboard-row-3"
        className="grid grid-cols-5 gap-4 min-h-[260px]"
      >
        <div className="col-span-3">
          <RecentSessions data={recentSessions} />
        </div>
        <div className="col-span-2 flex flex-col gap-4">
          <QuickActions />
          <SystemHealth />
        </div>
      </div>
    </section>
  );
}
