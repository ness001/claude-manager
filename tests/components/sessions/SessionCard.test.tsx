import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { SessionCard } from "../../../src/components/sessions/SessionCard";
import { useSessionStore } from "../../../src/stores/session-store";
import type { SessionMeta, SessionState } from "../../../src/lib/session-types";

function makeSession(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: overrides.sessionId ?? "id-x",
    cwd: "/repos/foo",
    firstPrompt: "do the thing",
    messageCount: 5,
    startedAt: "",
    durationMs: 0,
    entrypoint: "interactive",
    kind: "interactive",
    isSidechain: false,
    toolsUsed: [],
    isAlive: false,
    tags: [],
    isPinned: false,
    sortOrder: 0,
    state: "ended",
    ...overrides,
  };
}

describe("SessionCard", () => {
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
    console.error = (...args) => {
      errs.push(args);
      orig(...args);
    };
    try {
      render(
        <SessionCard session={makeSession()} selected={false} />,
      );
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("renders displayName when set, else truncated firstPrompt", () => {
    const long = "a".repeat(120);
    const { rerender } = render(
      <SessionCard
        session={makeSession({ displayName: "My Custom Name", firstPrompt: long })}
        selected={false}
      />,
    );
    expect(screen.getByText("My Custom Name")).toBeInTheDocument();

    rerender(
      <SessionCard
        session={makeSession({ displayName: undefined, firstPrompt: long })}
        selected={false}
      />,
    );
    // Truncation appends an ellipsis and is shorter than the original.
    const text = screen.getByText(/^a+…$/);
    expect(text.textContent!.length).toBeLessThan(long.length);
  });

  // WCAG 2.4.7 (Focus Visible): the card is the primary keyboard target in
  // the session list. Without focus-visible:ring, tabbing through the list
  // gives no indication of the current row. Mirrors PRs #17/#45/#48/#49.
  it("renders a focus-visible ring (WCAG 2.4.7)", () => {
    render(<SessionCard session={makeSession()} selected={false} />);
    const card = screen.getByTestId("session-card");
    expect(card.className).toContain("focus-visible:ring-2");
    expect(card.className).toContain("focus-visible:ring-accent");
  });

  const stateCases: Array<{ state: SessionState; bg: string; pulse: boolean }> = [
    { state: "alive", bg: "bg-status-green", pulse: true },
    { state: "ended", bg: "bg-text-muted", pulse: false },
    { state: "orphaned", bg: "bg-status-yellow", pulse: false },
    { state: "archived", bg: "bg-border-strong", pulse: false },
  ];
  it.each(stateCases)(
    "status dot color & pulse — $state",
    ({ state, bg, pulse }) => {
      render(
        <SessionCard session={makeSession({ state })} selected={false} />,
      );
      const dot = screen.getByTestId("status-dot");
      expect(dot.className).toContain(bg);
      expect(dot.className.includes("animate-pulse")).toBe(pulse);
    },
  );

  it("renders tag pills, time-ago text, and message count", () => {
    const startedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    render(
      <SessionCard
        session={makeSession({
          tags: ["urgent", "spike"],
          messageCount: 42,
          startedAt,
        })}
        selected={false}
      />,
    );
    const pills = screen.getAllByTestId("tag-pill");
    expect(pills.map((p) => p.textContent)).toEqual(["urgent", "spike"]);
    expect(screen.getByTestId("time-ago").textContent).toBe("5m ago");
    expect(screen.getByTestId("message-count").textContent?.trim()).toBe(
      "42 msgs",
    );
  });

  // Pluralization: "1 msg" (singular) vs "N msgs" / "0 msgs" (plural).
  // Regression — previously hardcoded to "msgs" so a session with one
  // message rendered the ungrammatical "1 msgs".
  it.each([
    { count: 0, expected: "0 msgs" },
    { count: 1, expected: "1 msg" },
    { count: 2, expected: "2 msgs" },
  ])("message count pluralization — $count → $expected", ({ count, expected }) => {
    render(
      <SessionCard
        session={makeSession({ messageCount: count })}
        selected={false}
      />,
    );
    expect(screen.getByTestId("message-count").textContent?.replace(/\s+/g, " ").trim()).toBe(
      expected,
    );
  });

  it("click → calls selectSession(id) on the store", () => {
    render(
      <SessionCard
        session={makeSession({ sessionId: "abc-123" })}
        selected={false}
      />,
    );
    fireEvent.click(screen.getByTestId("session-card"));
    expect(useSessionStore.getState().selectedId).toBe("abc-123");
  });

  it("selected card carries the selected styling marker", () => {
    render(
      <SessionCard session={makeSession()} selected={true} />,
    );
    const card = screen.getByTestId("session-card");
    expect(card.getAttribute("data-selected")).toBe("true");
    expect(card.className).toContain("bg-sidebar-active");
  });

  it("status dot exposes session state to screen readers (WCAG 4.1.2 / 1.4.1)", () => {
    const states: Array<{ state: SessionState; label: string }> = [
      { state: "alive", label: "Alive" },
      { state: "ended", label: "Ended" },
      { state: "orphaned", label: "Orphaned" },
      { state: "archived", label: "Archived" },
    ];
    for (const { state, label } of states) {
      const { unmount } = render(
        <SessionCard session={makeSession({ state })} selected={false} />,
      );
      const dot = screen.getByTestId("status-dot");
      expect(dot.getAttribute("role")).toBe("img");
      expect(dot.getAttribute("aria-label")).toBe(label);
      expect(dot.getAttribute("aria-hidden")).toBeNull();
      unmount();
    }
  });
});
