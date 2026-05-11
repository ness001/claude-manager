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

// QuickActions buttons render `disabled` until backend wiring lands. Per
// CLAUDE.md R2 (Orphan-placeholder rule), every disabled stub must declare
// the task ID that will wire it up so the placeholder isn't an
// undiscoverable orphan. Phase 4 task IDs:
//   - New Session    → T4.1 (Launcher) + T4.2 (Dialog UI)
//   - Resume Latest  → T4.5 (Command Palette)
//   - Open CWD       → T4.5 (Command Palette)
//   - Rebuild Stats  → T4.5 (Command Palette)
const ACTIONS: ActionDef[] = [
  // TODO(T4.1, T4.2): wire New Session button to launch the New Session dialog.
  { id: "new-session", label: "New Session", icon: <Plus size={14} aria-hidden="true" />, variant: "accent" },
  // TODO(T4.5): wire Resume Latest to the Command Palette's resume-latest action.
  { id: "resume-latest", label: "Resume Latest", icon: <Play size={14} aria-hidden="true" />, variant: "secondary" },
  // TODO(T4.5): wire Open CWD to the Command Palette's open-config-directory action.
  { id: "open-cwd", label: "Open CWD", icon: <FolderOpen size={14} aria-hidden="true" />, variant: "secondary" },
  // TODO(T4.5): wire Rebuild Stats to the Command Palette's rebuild-stats action.
  { id: "rebuild-stats", label: "Rebuild Stats", icon: <RefreshCw size={14} aria-hidden="true" />, variant: "secondary" },
];

export function QuickActions() {
  return (
    // WCAG 1.3.1 + WAI-ARIA APG: dashboard cards each have a visible <h3>
    // header but render as bare <div>s — the SR landmarks rotor cannot
    // surface them by name. Promote the card to a labelled <section>
    // bound to its <h3> via aria-labelledby so users can route to "Quick
    // Actions" directly. The inner <ul> already references the same id;
    // both pointers are valid AT relationships and the visible layout is
    // unchanged. Mirrors PRs #262 (ModelDonut), #263 (SystemHealth) and
    // the broader region-landmark sweep (#245 / #256 / #261).
    <section
      data-testid="quick-actions"
      aria-labelledby="quick-actions-heading"
      className="flex flex-col gap-2 rounded-md border border-border bg-card-bg p-4"
    >
      <h3
        id="quick-actions-heading"
        className="text-xs uppercase tracking-wide text-text-muted"
      >
        Quick Actions
      </h3>
      {/* WCAG 1.3.1 (Info and Relationships): the four action buttons form
          a logical group under the "Quick Actions" header but were emitted
          as flat sibling <button>s inside a non-semantic <div className="grid">.
          Screen-reader users navigating by lists (NVDA "L", JAWS "L",
          VoiceOver rotor → Lists) heard nothing for this collection — the
          count was lost and the heading wasn't bound to the buttons as a
          programmatic group label. Promote the grid container to a
          <ul aria-labelledby={heading-id}> with one <li> per action so the
          rotor surfaces "list, 4 items, Quick Actions". CSS Grid is
          element-agnostic — <ul> with `display: grid` lays out identically
          to the prior <div>. Mirrors PRs #235 (SkillsListView), #236
          (PluginListView), #237 (McpPanel scope groups), and #230
          (SystemHealth indicators). */}
      <ul
        data-testid="quick-actions-list"
        aria-labelledby="quick-actions-heading"
        className="grid grid-cols-2 gap-2"
      >
        {ACTIONS.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              data-testid={`action-${a.id}`}
              disabled
              aria-disabled="true"
              // Sighted users see the "Coming soon" tooltip on hover; mirror
              // that hint into the accessible name so screen-reader users
              // aren't left thinking the button is just broken (WCAG 4.1.2).
              aria-label={`${a.label} (coming soon)`}
              title="Coming soon"
              className={[
                "flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium",
                "cursor-not-allowed opacity-50",
                a.variant === "accent"
                  ? "bg-accent text-white"
                  : "border border-border bg-bg-secondary text-text-primary",
              ].join(" ")}
            >
              {a.icon}
              {a.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
