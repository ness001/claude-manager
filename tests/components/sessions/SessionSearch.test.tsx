import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SessionSearch } from "../../../src/components/sessions/SessionSearch";
import { useSessionStore } from "../../../src/stores/session-store";

describe("SessionSearch", () => {
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
    vi.useRealTimers();
  });

  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<SessionSearch />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("typing fires setSearchQuery after a 200ms debounce", () => {
    vi.useFakeTimers();
    render(<SessionSearch />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "auth" } });
    // Before the debounce window elapses, the store stays empty.
    expect(useSessionStore.getState().searchQuery).toBe("");

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(useSessionStore.getState().searchQuery).toBe("");

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(useSessionStore.getState().searchQuery).toBe("auth");
  });

  it("uses controlled value — external store change updates the input", () => {
    // Seed the store with a non-empty query first so the external write is
    // an actual store mutation (Zustand bails on no-op setStates).
    useSessionStore.setState({ searchQuery: "seed" });
    render(<SessionSearch />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;
    expect(input.value).toBe("seed");

    // User types something.
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input.value).toBe("abc");

    // Simulate an external reset (e.g. section switch / clear-all action).
    act(() => {
      useSessionStore.getState().setSearchQuery("");
    });

    expect(input.value).toBe("");
  });

  it("renders a focus indicator on the wrapping label (a11y: WCAG 2.4.7)", () => {
    // The input itself uses `focus:outline-none`, so the only focus signal
    // for keyboard users is `focus-within:border-accent` on the label. If
    // someone removes that class, keyboard users lose all focus indication
    // when the search box is active.
    render(<SessionSearch />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;
    const label = input.closest("label");
    expect(label).not.toBeNull();
    expect(label!.className).toMatch(/focus-within:border-accent/);
  });
});
