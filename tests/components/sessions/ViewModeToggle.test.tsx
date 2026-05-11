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

  it("active radio carries aria-checked=true", () => {
    useSessionStore.setState({ viewMode: "timeline" });
    render(<ViewModeToggle />);
    expect(screen.getByTestId("view-mode-timeline").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("view-mode-my").getAttribute("aria-checked")).toBe("false");
  });

  // WAI-ARIA Radio Group pattern (NOT Tabs): the toggle is a one-of-three
  // filter selector with no associated tabpanel. Declaring role="tab" /
  // role="tablist" is misuse — the Tabs pattern requires each tab to control
  // a sibling tabpanel via aria-controls, and SR users hearing "tab, 1 of 3"
  // expect a panel that doesn't exist. Radio Group is the correct pattern:
  // announces "radio button, checked / not checked" and arrow-key roving is
  // part of the spec.
  it("uses the radiogroup ARIA pattern (radiogroup + radio, not tablist + tab)", () => {
    render(<ViewModeToggle />);
    const group = screen.getByRole("radiogroup", { name: "Session view mode" });
    expect(group).toBeInTheDocument();
    for (const mode of ["my", "project", "timeline"] as const) {
      const btn = screen.getByTestId(`view-mode-${mode}`);
      expect(btn.getAttribute("role")).toBe("radio");
    }
    // Negative assertion — no stray tablist/tab roles left over.
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
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

  // WAI-ARIA Radio Group pattern: when the role="radio" semantics are
  // announced to AT, the keyboard model must follow — only the checked
  // radio is in the focus order (tabIndex=0); the others are tabIndex=-1
  // (roving tabindex). This means Tab moves focus into the group once,
  // then arrows move within.
  it("only the active radio has tabIndex=0; others are -1 (roving tabindex)", () => {
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
});
