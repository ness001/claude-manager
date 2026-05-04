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
    expect(screen.getByTestId("message-count").textContent).toBe("42 msgs");
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
});
