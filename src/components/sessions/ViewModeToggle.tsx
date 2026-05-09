// Three-way view-mode toggle — see spec §5.4.
//
// Tied directly to the session store; clicking a button updates `viewMode`.

import {
  useSessionStore,
  type SessionViewMode,
} from "../../stores/session-store";

const MODES: ReadonlyArray<{ mode: SessionViewMode; label: string }> = [
  { mode: "my", label: "My View" },
  { mode: "project", label: "Project" },
  { mode: "timeline", label: "Timeline" },
];

export function ViewModeToggle() {
  const viewMode = useSessionStore((s) => s.viewMode);
  const setViewMode = useSessionStore((s) => s.setViewMode);

  return (
    <div
      role="tablist"
      aria-label="Session view mode"
      className="flex items-center rounded-md bg-bg-tertiary p-0.5"
    >
      {MODES.map(({ mode, label }) => {
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`view-mode-${mode}`}
            onClick={() => setViewMode(mode)}
            className={[
              "flex-1 text-xs px-2 py-1 rounded transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              active
                ? "bg-card-bg text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
