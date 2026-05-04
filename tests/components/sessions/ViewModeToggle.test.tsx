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
});
