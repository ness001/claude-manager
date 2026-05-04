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
  const loadDashboard = useDashboardStore((s) => s.loadDashboard);

  useEffect(() => {
    void loadDashboard().catch(() => {
      // Store falls back to safe defaults internally — empty states render.
    });
  }, [loadDashboard]);

  return (
    <section
      data-testid="dashboard-section"
      className="flex flex-col gap-4 p-6 h-full overflow-auto"
    >
      {/* Row 1 — 4 stat cards */}
      <div data-testid="dashboard-row-1" className="grid grid-cols-4 gap-4">
        <StatCard value={totalSessions} label="Sessions" accent="green" />
        <StatCard value={totalMessages} label="Messages" accent="blue" />
        <StatCard
          value={longestSession?.messageCount ?? 0}
          label="Longest Session"
          accent="yellow"
          sublabel={longestSession?.name || undefined}
        />
        <StatCard
          value={formatDate(activeSince)}
          label="Active Since"
          accent="mauve"
        />
      </div>

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
