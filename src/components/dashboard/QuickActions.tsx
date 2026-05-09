// Quick actions panel — see spec §4.1 Row 3 (right top).
//
// Four buttons: New Session (prominent accent), Resume Latest, Open CWD,
// Rebuild Stats. Wiring of the actual actions (CLI commands, FS dialogs)
// is deferred to later phases — until then the buttons render as disabled
// so users don't click no-ops.

import { FolderOpen, Play, Plus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

interface ActionDef {
  id: string;
  label: string;
  icon: ReactNode;
  /** Visual prominence: "accent" gets the brand-colored fill. */
  variant: "accent" | "secondary";
}

const ACTIONS: ActionDef[] = [
  { id: "new-session", label: "New Session", icon: <Plus size={14} aria-hidden="true" />, variant: "accent" },
  { id: "resume-latest", label: "Resume Latest", icon: <Play size={14} aria-hidden="true" />, variant: "secondary" },
  { id: "open-cwd", label: "Open CWD", icon: <FolderOpen size={14} aria-hidden="true" />, variant: "secondary" },
  { id: "rebuild-stats", label: "Rebuild Stats", icon: <RefreshCw size={14} aria-hidden="true" />, variant: "secondary" },
];

export function QuickActions() {
  return (
    <div
      data-testid="quick-actions"
      className="flex flex-col gap-2 rounded-md border border-border bg-card-bg p-4"
    >
      <div className="text-xs uppercase tracking-wide text-text-muted">
        Quick Actions
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            data-testid={`action-${a.id}`}
            disabled
            aria-disabled="true"
            title="Coming soon"
            className={[
              "flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium",
              "cursor-not-allowed opacity-50",
              a.variant === "accent"
                ? "bg-accent text-white"
                : "border border-border bg-bg-secondary text-text-primary",
            ].join(" ")}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
