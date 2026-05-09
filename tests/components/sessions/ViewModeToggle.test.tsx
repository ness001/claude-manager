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
});
