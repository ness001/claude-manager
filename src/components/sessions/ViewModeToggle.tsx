// Three-way view-mode toggle — see spec §5.4.
//
// Tied directly to the session store; clicking a button updates `viewMode`.
//
// ARIA pattern: WAI-ARIA Radio Group (NOT Tabs). The previous incarnation
// declared `role="tablist"` / `role="tab"`, which is wrong because the
// WAI-ARIA Tabs pattern *requires* each tab to control a sibling
// `role="tabpanel"` element via `aria-controls`. There are no panels here —
// the toggle is a one-of-three filter selector that re-orders the same
// `SessionListPanel` sibling. SR users hearing "tab, 1 of 3" expected a
// tabpanel and got nothing, and tab-aware keyboard models in some
// screen readers (NVDA in browse mode) try to move focus into the
// nonexistent panel. Radio Group is the correct pattern for "pick one of
// N" with no associated panel: announces "radio button, checked / not
// checked", and arrow-key roving + auto-activation are part of the
// pattern (https://www.w3.org/WAI/ARIA/apg/patterns/radio/).
//
// Keyboard model (unchanged from prior fix): roving tabindex — only the
// checked radio is `tabIndex=0`, others `tabIndex=-1`. Left/Right arrows
// move + select the prev/next radio (wraps); Home/End jump to first/last.
// Tab moves focus OUT of the group.

import { useRef } from "react";

import {
  useSessionStore,
  type SessionViewMode,
} from "../../stores/session-store";

const MODES: ReadonlyArray<{ mode: SessionViewMode; label: string }> = [
  { mode: "my", label: "Group" },
  { mode: "project", label: "Path" },
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
      role="radiogroup"
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
            role="radio"
            aria-checked={active}
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
