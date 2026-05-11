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

// plugin-shell open() is used by the now-wired open-cwd / open-vscode actions.
const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => openMock(...args),
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

  it("all action buttons are disabled with a 'Coming soon' tooltip until handlers are wired (except wired open-cwd / open-vscode)", () => {
    // Action wiring (terminal launch, SIGTERM, archive, …) is later-phase.
    // The defect: every button looks interactive but does nothing on click.
    // Fix: render `disabled` + `title="Coming soon"` so users can tell.
    //
    // open-cwd / open-vscode are now wired via @tauri-apps/plugin-shell and
    // ARE interactive (when CWD exists). Skip them in this audit.
    const WIRED = new Set(["action-open-cwd", "action-open-vscode"]);
    for (const state of ALL_STATES) {
      cleanup();
      render(<SessionInfoBar session={makeSession({ state })} />);
      const buttons = document.querySelectorAll('[data-testid^="action-"]');
      expect(buttons.length).toBeGreaterThan(0);
      for (const btn of Array.from(buttons)) {
        if (WIRED.has(btn.getAttribute("data-testid") ?? "")) continue;
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

  // WCAG 1.4.11 (3:1 contrast for non-text UI components / state indicators):
  // the dead-CWD warning is a state indicator. Using `text-status-yellow`
  // (#eab308 light) on `bg-bg-secondary` (#f8f9fa) gives ~1.7:1 — fails 1.4.11.
  // Fix uses Tailwind's `text-yellow-700` (#a16207 ≈ 4.5:1 on the same surface)
  // for light mode and falls back to `dark:text-status-yellow` (the pale
  // #f9e2af) for dark mode where ~10:1 is comfortably above the bar.
  it("dead-CWD warning icon uses contrast-safe yellow (WCAG 1.4.11)", async () => {
    existsMock.mockResolvedValue(false);
    render(
      <SessionInfoBar
        session={makeSession({ state: "ended", cwd: "/missing/path" })}
      />,
    );
    const warning = await screen.findByTestId("dead-cwd-warning");
    // Must include the darker light-mode token; must NOT use the bare
    // `text-status-yellow` class (which was the failing color).
    expect(warning.className).toContain("text-yellow-700");
    expect(warning.className).toContain("dark:text-status-yellow");
    expect(warning.className).not.toMatch(/(^|\s)text-status-yellow(\s|$)/);
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

  it("name field surfaces 'session-scoped — not persisted' affordance via title + aria-label", () => {
    // Until SQLite persistence is wired (session-loader.ts:28-31), renames
    // only live in the in-memory Zustand store. The input must label this
    // so users — including SR users — know edits won't survive reload.
    render(<SessionInfoBar session={makeSession()} />);
    const input = screen.getByTestId("session-name-input");
    expect(input.getAttribute("title")).toMatch(/not yet saved across reloads/i);
    expect(input.getAttribute("aria-label")).toMatch(/session-scoped/i);
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

  // Mirrors the pluralization fixes in PR #87 (SessionCard) and PR #93
  // (RecentSessions). The bare "{n} msgs" string read as "1 msgs" for
  // single-message sessions, which both reads as broken English and risks
  // looking like a stale-data bug to users.
  it.each([
    [0, "0 msgs"],
    [1, "1 msg"],
    [2, "2 msgs"],
  ])("message count %d renders as %j", (n, expected) => {
    render(<SessionInfoBar session={makeSession({ messageCount: n })} />);
    expect(screen.getByTestId("message-count-badge")).toHaveTextContent(
      expected,
    );
  });

  // Functional gap: open-cwd / open-vscode were rendered `disabled` with a
  // "Coming soon" tooltip even though @tauri-apps/plugin-shell is already
  // allowlisted in capabilities and SkillCard uses the same pattern. Wire
  // them now so the SessionInfoBar matches the rest of the app's CWD UX.
  it("'Open CWD' invokes shell open with session.cwd when CWD exists", async () => {
    openMock.mockReset().mockResolvedValue(undefined);
    existsMock.mockResolvedValue(true);
    render(<SessionInfoBar session={makeSession({ cwd: "/repos/foo" })} />);
    const btn = screen.getByTestId("action-open-cwd") as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    fireEvent.click(btn);
    expect(openMock).toHaveBeenCalledWith("/repos/foo");
  });

  it("'Open in VS Code' converts Windows backslashes to forward slashes (URI scheme)", async () => {
    openMock.mockReset().mockResolvedValue(undefined);
    existsMock.mockResolvedValue(true);
    render(
      <SessionInfoBar
        session={makeSession({ cwd: "C:\\Users\\me\\repos\\foo" })}
      />,
    );
    const btn = screen.getByTestId("action-open-vscode") as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    fireEvent.click(btn);
    expect(openMock).toHaveBeenCalledWith(
      "vscode://file/C:/Users/me/repos/foo",
    );
  });

  it("'Open CWD' / 'Open in VS Code' stay disabled when CWD is missing (§17.5 wins over wiring)", async () => {
    existsMock.mockResolvedValue(false);
    render(<SessionInfoBar session={makeSession({ cwd: "/gone" })} />);
    const cwd = screen.getByTestId("action-open-cwd") as HTMLButtonElement;
    const vsc = screen.getByTestId("action-open-vscode") as HTMLButtonElement;
    await waitFor(() => expect(cwd.disabled).toBe(true));
    expect(cwd.title).toBe("Directory not found");
    expect(vsc.disabled).toBe(true);
    expect(vsc.title).toBe("Directory not found");
  });

  it("openShell rejection surfaces an inline alert (mirrors SkillCard)", async () => {
    existsMock.mockResolvedValue(true);
    openMock.mockReset().mockRejectedValueOnce(new Error("ENOENT"));
    render(<SessionInfoBar session={makeSession({ cwd: "/repos/foo" })} />);
    const btn = screen.getByTestId("action-open-cwd") as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    fireEvent.click(btn);
    const alert = await screen.findByTestId("session-open-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("ENOENT");
  });

  // WCAG 2.4.7 Focus Visible — the inline name-edit input previously used
  // `outline-none focus:ring-1 focus:ring-accent`, which (a) strips the
  // browser default outline for *every* focus including mouse and (b)
  // replaces it with a 1-px ring shown on every focus event. Mirrors the
  // focus-ring trio fix landed in PRs #138 / #139 / #140.
  it("session-name input has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<SessionInfoBar session={makeSession()} />);
    const input = screen.getByTestId("session-name-input");
    expect(input.className).toContain("focus-visible:outline-none");
    expect(input.className).toContain("focus-visible:ring-2");
    expect(input.className).toContain("focus-visible:ring-accent");
    // Regression guard: the old non-`focus-visible` classes are gone, so
    // mouse clicks no longer strip the outline silently.
    expect(input.className).not.toMatch(/(^|\s)outline-none(\s|$)/);
    expect(input.className).not.toMatch(/(^|\s)focus:ring-1(\s|$)/);
  });

  // WCAG 4.1.2 (Name, Role, Value): the action buttons that aren't yet
  // wired (everything except open-cwd / open-vscode) carry a `title="Coming
  // soon"` tooltip for sighted users, and the dead-CWD case carries a
  // `title="Directory not found"` tooltip — but the buttons' accessible
  // name was just the visible label ("Resume", "Fork", …). A screen-reader
  // user navigating by buttons hears "<action>, button, dimmed" with no
  // hint why. Mirror the visual tooltip into aria-label so SR and sighted
  // users get the same affordance.
  it("unwired actions announce (coming soon) status to AT", () => {
    existsMock.mockResolvedValue(true);
    render(<SessionInfoBar session={makeSession({ state: "ended" })} />);
    // Resume/Fork/View Conversation/Tag-Rename/Archive are unwired in this
    // state row; pick one we know is in the row regardless of CWD checks.
    const fork = screen.getByTestId("action-fork");
    expect(fork.getAttribute("aria-label")).toBe("Fork (coming soon)");
    expect(fork).toBeDisabled();
  });

  it("dead-CWD actions announce (directory not found) status to AT", async () => {
    existsMock.mockResolvedValue(false);
    render(
      <SessionInfoBar
        session={makeSession({ state: "ended", cwd: "/missing/path" })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("dead-cwd-warning")).toBeInTheDocument();
    });
    const cwdBtn = screen.getByTestId("action-open-cwd");
    expect(cwdBtn.getAttribute("aria-label")).toBe(
      "Open CWD (directory not found)",
    );
    const codeBtn = screen.getByTestId("action-open-vscode");
    expect(codeBtn.getAttribute("aria-label")).toBe(
      "Open in VS Code (directory not found)",
    );
  });

  it("wired actions do NOT add a redundant aria-label", async () => {
    existsMock.mockResolvedValue(true);
    render(<SessionInfoBar session={makeSession({ state: "ended" })} />);
    await waitFor(() => {
      expect(screen.getByTestId("action-open-cwd")).not.toBeDisabled();
    });
    // The visible "Open CWD" text already serves as the accessible name;
    // adding aria-label="Open CWD" would be redundant noise.
    expect(screen.getByTestId("action-open-cwd").hasAttribute("aria-label")).toBe(
      false,
    );
  });

  // WCAG 4.1.2 (Name, Role, Value): the model / message-count / entrypoint
  // badges render bare values ("claude-sonnet-4-6", "47 msgs",
  // "interactive") with no semantic prefix. Sighted users infer the role
  // from the badge layout; SR users hear opaque strings ("claude dash
  // sonnet dash four dash six") and have no idea which dimension that
  // describes. Mirror the implicit visual role into the accessible name
  // via aria-label, matching the disabled-stub aria-label family
  // (#181/#183/#184/#222) — visible text untouched. The state-pill is
  // intentionally NOT covered here because its visible text already reads
  // as a complete value ("Alive", "Ended"), and adding a "State: …"
  // prefix would just make SR announcements longer without adding info.
  it("model / message-count / entrypoint badges expose semantic role via aria-label (WCAG 4.1.2)", () => {
    render(
      <SessionInfoBar
        session={makeSession({
          model: "claude-sonnet-4-6",
          messageCount: 47,
          entrypoint: "interactive",
        })}
      />,
    );
    expect(screen.getByTestId("model-badge").getAttribute("aria-label")).toBe(
      "Model: claude-sonnet-4-6",
    );
    expect(
      screen.getByTestId("message-count-badge").getAttribute("aria-label"),
    ).toBe("Messages: 47");
    expect(
      screen.getByTestId("entrypoint-badge").getAttribute("aria-label"),
    ).toBe("Entrypoint: interactive");
  });

  // WAI-ARIA Toolbar pattern: the row of action buttons (View Live / Resume /
  // Stop / Archive / …) is a related control group. Without role="toolbar" +
  // an accessible name, SR users hear them as a flat sequence of unrelated
  // buttons, indistinguishable from any other strip on the page.
  it("action row is a named toolbar landmark (a11y: button-group context)", () => {
    useSessionStore.setState({
      sessions: [makeSession({ sessionId: "x", state: "ended" })],
      selectedId: "x",
    });
    render(<SessionInfoBar session={makeSession({ sessionId: "x", state: "ended" })} />);
    const tb = screen.getByTestId("session-actions-toolbar");
    expect(tb.getAttribute("role")).toBe("toolbar");
    expect(tb.getAttribute("aria-label")).toBe("Session actions");
    const byRole = screen.getByRole("toolbar", { name: "Session actions" });
    expect(byRole).toBe(tb);
  });

  // a11y: WCAG 4.1.2 (Name, Role, Value) — the state-pill's visible label
  // ("ALIVE" / "ENDED" / "ORPHANED") is an opaque token without a "Session
  // state:" prefix. Mirrors the model-badge / message-count-badge /
  // entrypoint-badge labelling pattern (PRs #247/#250/#252).
  it("state-pill exposes 'Session state: <label>' to assistive tech", () => {
    render(<SessionInfoBar session={makeSession({ state: "alive" })} />);
    expect(
      screen.getByTestId("state-pill").getAttribute("aria-label"),
    ).toBe("Session state: Alive");
  });

  it("state-pill aria-label tracks state changes (ended)", () => {
    render(<SessionInfoBar session={makeSession({ state: "ended" })} />);
    expect(
      screen.getByTestId("state-pill").getAttribute("aria-label"),
    ).toBe("Session state: Ended");
  });
});
