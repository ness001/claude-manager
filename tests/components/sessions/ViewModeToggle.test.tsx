import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ViewModeToggle } from "../../../src/components/sessions/ViewModeToggle";
import { useSessionStore } from "../../../src/stores/session-store";

describe("ViewModeToggle", () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      selectedId: null,
      viewMode: "my",
      searchQuery: "",
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<ViewModeToggle />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("clicking each of the three buttons updates viewMode", () => {
    render(<ViewModeToggle />);

    fireEvent.click(screen.getByTestId("view-mode-project"));
    expect(useSessionStore.getState().viewMode).toBe("project");

    fireEvent.click(screen.getByTestId("view-mode-timeline"));
    expect(useSessionStore.getState().viewMode).toBe("timeline");

    fireEvent.click(screen.getByTestId("view-mode-my"));
    expect(useSessionStore.getState().viewMode).toBe("my");
  });

  it("active tab carries aria-selected=true", () => {
    useSessionStore.setState({ viewMode: "timeline" });
    render(<ViewModeToggle />);
    expect(screen.getByTestId("view-mode-timeline").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("view-mode-my").getAttribute("aria-selected")).toBe("false");
  });

  // WCAG 2.4.7 Focus Visible: keyboard users tabbing through the three view-mode
  // buttons had no visible focus indicator — the only style the buttons carried
  // was a hover/active/inactive color swap. Without focus-visible:ring, the
  // currently-focused tab is invisible to keyboard nav.
  it("each tab button carries a focus-visible ring class", () => {
    render(<ViewModeToggle />);
    for (const mode of ["my", "project", "timeline"] as const) {
      const btn = screen.getByTestId(`view-mode-${mode}`);
      expect(btn.className).toContain("focus-visible:ring-2");
      expect(btn.className).toContain("focus-visible:ring-accent");
    }
  });

  // WAI-ARIA Tabs pattern: when the role="tab" semantics are announced to AT,
  // the keyboard model must follow — only the active tab is in the focus
  // order (tabIndex=0); the others are tabIndex=-1 (roving tabindex). This
  // means Tab moves focus into the tablist once, then arrows move within.
  it("only the active tab has tabIndex=0; others are -1 (roving tabindex)", () => {
    useSessionStore.setState({ viewMode: "project" });
    render(<ViewModeToggle />);
    expect(screen.getByTestId("view-mode-my").tabIndex).toBe(-1);
    expect(screen.getByTestId("view-mode-project").tabIndex).toBe(0);
    expect(screen.getByTestId("view-mode-timeline").tabIndex).toBe(-1);
  });

  it("ArrowRight selects the next tab (wraps from last → first)", () => {
    useSessionStore.setState({ viewMode: "my" });
    render(<ViewModeToggle />);
    const myBtn = screen.getByTestId("view-mode-my");
    myBtn.focus();
    fireEvent.keyDown(myBtn, { key: "ArrowRight" });
    expect(useSessionStore.getState().viewMode).toBe("project");
    fireEvent.keyDown(screen.getByTestId("view-mode-project"), { key: "ArrowRight" });
    expect(useSessionStore.getState().viewMode).toBe("timeline");
    // wrap
    fireEvent.keyDown(screen.getByTestId("view-mode-timeline"), { key: "ArrowRight" });
    expect(useSessionStore.getState().viewMode).toBe("my");
  });

  it("ArrowLeft selects the previous tab (wraps from first → last)", () => {
    useSessionStore.setState({ viewMode: "my" });
    render(<ViewModeToggle />);
    fireEvent.keyDown(screen.getByTestId("view-mode-my"), { key: "ArrowLeft" });
    expect(useSessionStore.getState().viewMode).toBe("timeline");
  });

  it("Home/End jump to the first/last tab", () => {
    useSessionStore.setState({ viewMode: "project" });
    render(<ViewModeToggle />);
    fireEvent.keyDown(screen.getByTestId("view-mode-project"), { key: "End" });
    expect(useSessionStore.getState().viewMode).toBe("timeline");
    fireEvent.keyDown(screen.getByTestId("view-mode-timeline"), { key: "Home" });
    expect(useSessionStore.getState().viewMode).toBe("my");
  });

  it("non-arrow keys are not preventDefault'd (e.g. Tab still moves focus out)", () => {
    render(<ViewModeToggle />);
    const btn = screen.getByTestId("view-mode-my");
    const ev = fireEvent.keyDown(btn, { key: "Tab" });
    // fireEvent.keyDown returns false if defaultPrevented; we want it true (not prevented).
    expect(ev).toBe(true);
  });

  // WCAG 4.1.2 (Name, Role, Value) + WAI-ARIA Tabs APG: each role="tab"
  // must have an id (so aria-labelledby on the panel can target it) and
  // an aria-controls pointing at the role="tabpanel" it controls.
  // Without aria-controls, SR users hear "tab" but have no programmatic
  // affordance for "go to controlled element" (NVDA browse-mode "controls"
  // key, JAWS follow-controls). All three tabs share one panel — the
  // panel content re-groups in place rather than swapping.
  it("each tab has an id and aria-controls pointing at the shared tabpanel", () => {
    render(<ViewModeToggle />);
    for (const mode of ["my", "project", "timeline"] as const) {
      const btn = screen.getByTestId(`view-mode-${mode}`);
      expect(btn.id).toBe(`view-mode-tab-${mode}`);
      expect(btn.getAttribute("aria-controls")).toBe(
        "session-list-panel-tabpanel",
      );
    }
  });
});
