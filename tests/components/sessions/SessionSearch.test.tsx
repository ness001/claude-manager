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

  // UX bug: WebView2 doesn't reliably honor the `<input type=search>`
  // browser-default Escape-to-clear behavior, and even when it does,
  // focus jumps off the input. Wire an explicit Escape handler so the
  // field clears, focus stays, AND the store is flushed synchronously
  // (skipping the 200ms debounce) so the session list updates immediately.
  // Mirrors PRs #151 / #152 with the extra debounced-flush wrinkle.
  it("Escape clears the input AND flushes the store synchronously, keeping focus", () => {
    render(<SessionSearch />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "auth" } });
    expect(input.value).toBe("auth");
    input.focus();
    expect(document.activeElement).toBe(input);

    const evt = fireEvent.keyDown(input, { key: "Escape" });
    expect(evt).toBe(false); // default prevented
    // Local mirror cleared immediately.
    expect(input.value).toBe("");
    // Store flushed synchronously — no 200ms debounce wait.
    expect(useSessionStore.getState().searchQuery).toBe("");
    // Focus stays on the input.
    expect(document.activeElement).toBe(input);
  });

  it("Escape on an empty input is a no-op (does not preventDefault)", () => {
    render(<SessionSearch />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;
    expect(input.value).toBe("");
    const evt = fireEvent.keyDown(input, { key: "Escape" });
    expect(evt).toBe(true); // default NOT prevented
    expect(input.value).toBe("");
  });

  // The synchronous flush MUST also update `lastCommitted` so the
  // debounced effect doesn't re-emit the same empty value 200ms later.
  // Behaviorally a no-op (store is already empty) but it keeps the
  // bookkeeping honest — and would matter if the user types something
  // immediately after Esc.
  it("after Esc, typing a new query commits the new value (not stale empty)", () => {
    vi.useFakeTimers();
    render(<SessionSearch />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "auth" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(useSessionStore.getState().searchQuery).toBe("");

    fireEvent.change(input, { target: { value: "git" } });
    act(() => {
      vi.advanceTimersByTime(201);
    });
    expect(useSessionStore.getState().searchQuery).toBe("git");
  });
});
