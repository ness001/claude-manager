// Three-way view-mode toggle — see spec §5.4.
//
// Tied directly to the session store; clicking a button updates `viewMode`.
//
// Keyboard model: implements the WAI-ARIA Tabs pattern (manual activation
// flavor) — only the active tab is in the focus order (`tabIndex=0`); the
// others are `tabIndex=-1`. Left/Right arrows roving-focus between tabs;
// Home/End jump to the first/last. Tab key moves focus OUT of the tablist
// rather than between tabs. Activation (selecting the focused tab) happens
// on Enter/Space — matching the click handler. This is required because
// announcing `role="tab"` to assistive tech but failing to provide arrow-
// key navigation violates WCAG 4.1.2 (Name, Role, Value).

import { useRef } from "react";

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
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAndSelect = (idx: number) => {
    const wrapped = (idx + MODES.length) % MODES.length;
    const target = refs.current[wrapped];
    if (target) {
      target.focus();
      setViewMode(MODES[wrapped].mode);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAndSelect(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAndSelect(i + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAndSelect(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAndSelect(MODES.length - 1);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Session view mode"
      className="flex items-center rounded-md bg-bg-tertiary p-0.5"
    >
      {MODES.map(({ mode, label }, i) => {
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-testid={`view-mode-${mode}`}
            onClick={() => setViewMode(mode)}
            onKeyDown={(e) => onKeyDown(e, i)}
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
