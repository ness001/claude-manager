import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SessionInfoBar } from "../../../src/components/sessions/SessionInfoBar";
import { useSessionStore } from "../../../src/stores/session-store";
import type { SessionMeta, SessionState } from "../../../src/lib/session-types";

// Default-export-style mock for Tauri FS — all tests can override per-case.
const existsMock = vi.fn(async (_path: string) => true);
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: (p: string) => existsMock(p),
}));

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

const ALL_STATES: SessionState[] = ["alive", "ended", "orphaned", "archived"];

function actionLabels(): string[] {
  return Array.from(document.querySelectorAll('[data-testid^="action-"]')).map(
    (el) => (el as HTMLElement).textContent?.trim() ?? "",
  );
}

describe("SessionInfoBar", () => {
  beforeEach(() => {
    existsMock.mockReset();
    existsMock.mockResolvedValue(true);
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
      render(<SessionInfoBar session={makeSession()} />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("shows the right action set per spec §5.3", () => {
    const cases: Record<SessionState, string[]> = {
      alive: [
        "View Live",
        "Resume in Terminal",
        "Open CWD",
        "Open in VS Code",
        "Tag/Rename",
        "Stop",
      ],
      ended: [
        "Resume",
        "Fork",
        "View Conversation",
        "Open CWD",
        "Open in VS Code",
        "Tag/Rename",
        "Archive",
      ],
      orphaned: ["Resume", "Open CWD", "Delete"],
      archived: ["Unarchive", "View Conversation", "Delete"],
    };
    for (const state of ALL_STATES) {
      cleanup();
      render(<SessionInfoBar session={makeSession({ state })} />);
      expect(actionLabels()).toEqual(cases[state]);
    }
  });

  it("ALIVE never shows a plain 'Resume' button (spec §5.3)", () => {
    render(<SessionInfoBar session={makeSession({ state: "alive" })} />);
    expect(screen.queryByTestId("action-resume")).not.toBeInTheDocument();
    expect(screen.getByTestId("action-view-live")).toBeInTheDocument();
    expect(screen.getByTestId("action-resume-terminal")).toBeInTheDocument();
  });

  it("all action buttons are disabled with a 'Coming soon' tooltip until handlers are wired", () => {
    // Action wiring (terminal launch, SIGTERM, archive, …) is later-phase.
    // The defect: every button looks interactive but does nothing on click.
    // Fix: render `disabled` + `title="Coming soon"` so users can tell.
    for (const state of ALL_STATES) {
      cleanup();
      render(<SessionInfoBar session={makeSession({ state })} />);
      const buttons = document.querySelectorAll('[data-testid^="action-"]');
      expect(buttons.length).toBeGreaterThan(0);
      for (const btn of Array.from(buttons)) {
        expect(btn).toBeDisabled();
        expect(btn.getAttribute("title")).toBe("Coming soon");
      }
    }
  });

  it("clicking a disabled action button does nothing — no confirm prompt, no error", () => {
    // Regression guard: previously Stop spawned a window.confirm even though
    // the SIGTERM wiring did not exist. Now the button is disabled, so no
    // dialog should appear.
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);
    render(<SessionInfoBar session={makeSession({ state: "alive" })} />);
    fireEvent.click(screen.getByTestId("action-stop"));
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("dead CWD disables Open CWD / Open in VS Code and shows warning (spec §17.5)", async () => {
    existsMock.mockResolvedValue(false);
    render(
      <SessionInfoBar
        session={makeSession({ state: "ended", cwd: "/missing/path" })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("dead-cwd-warning")).toBeInTheDocument();
    });
    // a11y: the warning icon must expose an accessible name to SR users —
    // a parent `title` attribute is unreliable across AT vendors.
    expect(
      screen.getByRole("img", { name: "Directory not found" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("action-open-cwd")).toBeDisabled();
    expect(screen.getByTestId("action-open-vscode")).toBeDisabled();
  });

  it("name field is editable and commits to the store on blur", () => {
    const session = makeSession({ sessionId: "edit-me", displayName: "Old" });
    useSessionStore.setState({ sessions: [session] });
    render(<SessionInfoBar session={session} />);

    const input = screen.getByTestId(
      "session-name-input",
    ) as HTMLInputElement;
    expect(input.value).toBe("Old");

    fireEvent.change(input, { target: { value: "Brand New Name" } });
    fireEvent.blur(input);

    const updated = useSessionStore
      .getState()
      .sessions.find((s) => s.sessionId === "edit-me");
    expect(updated?.displayName).toBe("Brand New Name");
  });

  it("renders state pill, model badge, message count, entrypoint badge", () => {
    render(
      <SessionInfoBar
        session={makeSession({
          state: "alive",
          model: "claude-opus-4.7",
          messageCount: 42,
          entrypoint: "interactive",
        })}
      />,
    );
    expect(screen.getByTestId("state-pill")).toHaveTextContent("Alive");
    expect(screen.getByTestId("model-badge")).toHaveTextContent(
      "claude-opus-4.7",
    );
    expect(screen.getByTestId("message-count-badge")).toHaveTextContent(
      "42 msgs",
    );
    expect(screen.getByTestId("entrypoint-badge")).toHaveTextContent(
      "interactive",
    );
  });

  it("state pill exposes the correct data-state for theme parity selectors", () => {
    for (const state of ALL_STATES) {
      cleanup();
      render(<SessionInfoBar session={makeSession({ state })} />);
      expect(screen.getByTestId("state-pill")).toHaveAttribute(
        "data-state",
        state,
      );
    }
  });
});
