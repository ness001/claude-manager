// Tests for ConversationViewer — T2.11.
//
// Mocks at the module boundary:
//   - `@tauri-apps/api/core` → `invoke("read_jsonl_file", ...)` returns
//     fixture lines
//   - `@tanstack/react-virtual` → returns a flat list of virtual items so we
//     can assert on the rendered output without needing a real scroll
//     container (jsdom does not implement layout).
//
// We never mock the unit under test (ConversationViewer itself) or the
// frontend JSONL parser — entries flow through the real parser so the test
// confirms end-to-end shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// `useVirtualizer` returns DOM-measurement-driven virtual items. Under jsdom
// every element has zero size, so the real virtualizer renders nothing. Stub
// it to render every row — sufficient for assertion-level testing while
// preserving the public API surface (the production code still calls into
// the real library). We never stub `ConversationViewer` itself.
vi.mock("@tanstack/react-virtual", () => {
  return {
    useVirtualizer: ({ count }: { count: number }) => ({
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          start: i * 100,
          size: 100,
          key: i,
        })),
      getTotalSize: () => count * 100,
      scrollToIndex: vi.fn(),
      measureElement: () => undefined,
    }),
  };
});

import { ConversationViewer } from "../../../src/components/conversation/ConversationViewer";

const FIXTURES = join(__dirname, "..", "..", "fixtures", "conversation-viewer");

function readFixture(name: string): string[] {
  const text = readFileSync(join(FIXTURES, name), "utf8");
  return text.split("\n");
}

beforeEach(() => {
  invokeMock.mockReset();
});
afterEach(() => cleanup());

describe("ConversationViewer", () => {
  it("mounts without console errors", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<ConversationViewer path="/fake.jsonl" />);
      await waitFor(() =>
        expect(screen.getByTestId("conversation-viewer")).toBeInTheDocument(),
      );
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("shows the loading state before the IPC resolves", async () => {
    let resolve: (v: string[]) => void = () => {};
    invokeMock.mockReturnValue(new Promise<string[]>((r) => (resolve = r)));
    render(<ConversationViewer path="/fake.jsonl" />);
    expect(screen.getByTestId("conversation-viewer-loading")).toBeInTheDocument();
    // Resolve + flush so React doesn't log an act() warning after the test.
    await act(async () => {
      resolve([]);
      await Promise.resolve();
    });
  });

  // a11y: the "Loading conversation…" message appears asynchronously while
  // the JSONL IPC is in flight. Without role="status" + aria-live="polite"
  // screen-reader users get silence — they can't tell whether the click
  // registered, the load is still pending, or the panel is broken. The
  // sibling error branch right below it already declares role="alert"
  // (see "error banner has role='alert'" test); the loading branch was the
  // remaining outlier between the two transient-status surfaces. Mirrors
  // PR #193 (SkillsListView empty-state ↔ no-matches parity) and PR #44
  // (corruption-warning banner role="alert").
  it("loading banner is a polite live region (a11y: load-in-flight announce)", async () => {
    let resolve: (v: string[]) => void = () => {};
    invokeMock.mockReturnValue(new Promise<string[]>((r) => (resolve = r)));
    render(<ConversationViewer path="/fake.jsonl" />);
    const loading = screen.getByTestId("conversation-viewer-loading");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    await act(async () => {
      resolve([]);
      await Promise.resolve();
    });
  });

  it("renders user, assistant, tool-call (with paired result), system divider, and summary", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => {
      expect(screen.getByTestId("conversation-viewer")).toBeInTheDocument();
    });

    expect(screen.getAllByTestId("user-message").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("assistant-message").length).toBeGreaterThan(
      0,
    );

    // Two tool-use lines + two tool_result lines → after pairing, 2 blocks.
    const toolBlocks = screen.getAllByTestId("tool-call-block");
    expect(toolBlocks).toHaveLength(2);
    // The Read tool result was an error → second block has the error marker.
    const errorBlocks = toolBlocks.filter(
      (b) => (b as HTMLElement).dataset.error === "true",
    );
    expect(errorBlocks).toHaveLength(1);

    // System dividers: one turn_duration, one compact_boundary.
    const dividers = screen.getAllByTestId("system-divider");
    const variants = dividers.map((d) => (d as HTMLElement).dataset.variant);
    expect(variants).toContain("turn");
    expect(variants).toContain("compact");

    // Summary banner.
    expect(screen.getByTestId("summary-banner")).toBeInTheDocument();
  });

  it("skips SKIP_TYPES lines entirely (zero rendered nodes)", async () => {
    invokeMock.mockResolvedValue(readFixture("skip-only.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("conversation-viewer")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("user-message")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-message")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tool-call-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("system-divider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("summary-banner")).not.toBeInTheDocument();
    // SKIP_TYPES are NOT corruption — no warning banner.
    expect(screen.queryByTestId("corruption-warning")).not.toBeInTheDocument();
  });

  it("counts corrupted lines and surfaces the warning banner (spec §17.5)", async () => {
    invokeMock.mockResolvedValue(readFixture("with-corruption.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("corruption-warning")).toBeInTheDocument(),
    );
    const banner = screen.getByTestId("corruption-warning");
    // Two corrupted lines in the fixture (mid-JSON cut + plain text line).
    expect(banner.textContent).toMatch(/2 lines/);
    // a11y: banner must be exposed as an alert so screen readers announce it
    // (yellow color alone fails WCAG 1.4.1 / 4.1.2). The ⚠ glyph is
    // decorative — its meaning is in the text, so it's wrapped in aria-hidden.
    expect(banner.getAttribute("role")).toBe("alert");
  });

  // WCAG 1.4.3 (Contrast Minimum, 4.5:1 for normal text): the corruption
  // warning text used `text-status-yellow` (#eab308 light) on a 10%-opacity
  // status-yellow fill over the parent surface. That gave ~1.7:1 contrast
  // — sighted low-vision users could see "something yellow happened" but
  // could not read the line count. Use the dedicated `text-status-yellow-text`
  // token (#a16207 light → ~4.7:1, #f9e2af dark → ~10:1). The decorative
  // bg/border tints stay at the vivid `status-yellow` so the banner still
  // reads as a warning at a glance — only the *text* token changes.
  // Mirrors the SessionInfoBar dead-cwd-warning text fix and StatCard's
  // yellow value-color pattern (StatCard.tsx lines 45-50).
  it("corruption warning uses readable yellow-text token (WCAG 1.4.3)", async () => {
    invokeMock.mockResolvedValue(readFixture("with-corruption.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("corruption-warning")).toBeInTheDocument(),
    );
    const banner = screen.getByTestId("corruption-warning");
    expect(banner.className).toContain("text-status-yellow-text");
    // Regression guard: the failing color (`text-status-yellow` as a
    // standalone class) is gone. We still allow the bg/border `/10`/`/40`
    // opacity-suffixed variants which are decorative.
    expect(banner.className).not.toMatch(/(^|\s)text-status-yellow(\s|$)/);
  });

  it("shows turn navigation when the session has turns", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-nav"));
    const nav = screen.getByTestId("turn-nav");
    expect(nav).toHaveTextContent(/\/ \d+/);
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    expect(input.value).toBe("1");
  });

  // The floating turn-nav widget (`absolute bottom-2 right-3`, ~28px tall)
  // overlaps the bottom of the conversation scroller. Without bottom padding
  // on the scroller the last 36-40px of content sit underneath the floating
  // overlay, so the final assistant/tool message is visually clipped and
  // unreachable even after scrolling fully down. Reserve `pb-14` (≈56px,
  // > widget+offset) when totalTurns>0; omit it when there's no widget.
  it("scroller has bottom padding to clear the floating turn-nav overlay", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-nav"));
    const scroller = screen.getByTestId("conversation-scroller");
    expect(scroller.className).toContain("pb-14");
  });

  it("scroller has no extra bottom padding when there are no turns", async () => {
    invokeMock.mockResolvedValue("");
    render(<ConversationViewer path="/fake.jsonl" />);
    const scroller = await screen.findByTestId("conversation-scroller");
    expect(screen.queryByTestId("turn-nav")).toBeNull();
    expect(scroller.className).not.toContain("pb-14");
  });

  // WCAG 1.3.1 / 4.1.2: the floating turn-nav widget composes "Turn",
  // a spin-button input, and "/ N" into one logical control. Without a
  // wrapping role + name SR users hear three disconnected fragments and
  // the widget never appears as a discoverable group. role="group" +
  // aria-label exposes it as one named unit (matches the StatCard
  // pattern).
  it("turn-nav exposes role=group + aria-label so it announces as one unit", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-nav"));
    const nav = screen.getByTestId("turn-nav");
    expect(nav.getAttribute("role")).toBe("group");
    expect(nav.getAttribute("aria-label")).toBe("Turn navigation");
  });

  // WAI-ARIA `aria-keyshortcuts`: Ctrl+ArrowDown / Ctrl+ArrowUp step turns
  // (handler at ConversationViewer lines 288-308) but the shortcuts have
  // no visible affordance and the role=group label says nothing about
  // them. Expose via aria-keyshortcuts so AT announces them on focus.
  // Mirrors PR #276 (SidebarRailItem Ctrl+1..6).
  it("turn-nav exposes its Ctrl+Arrow shortcuts via aria-keyshortcuts", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-nav"));
    const nav = screen.getByTestId("turn-nav");
    expect(nav.getAttribute("aria-keyshortcuts")).toBe(
      "Control+ArrowDown Control+ArrowUp",
    );
  });

  // WCAG 4.1.2 (Name, Role, Value): the previous aria-label "Jump to
  // turn" gave SR users the field's purpose but NOT the legal range.
  // The visible "/ N" sibling is not programmatically associated with
  // the input, so AT users had to discover the upper bound by trying
  // values and hitting validation. Embedding the range in the
  // accessible name makes the spin-button announcement actionable.
  it("turn-input has an accessible name embedding the upper bound (WCAG 4.1.2)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    const totalText = screen.getByTestId("turn-nav").textContent ?? "";
    const total = Number(totalText.match(/\/ (\d+)/)?.[1] ?? "0");
    expect(total).toBeGreaterThan(0);
    expect(input.getAttribute("aria-label")).toBe(`Jump to turn (1 to ${total})`);
  });

  it("turn-input does not jump on every keystroke; commits on blur (clamped)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    const totalText = screen.getByTestId("turn-nav").textContent ?? "";
    const total = Number(totalText.match(/\/ (\d+)/)?.[1] ?? "0");
    expect(total).toBeGreaterThan(0);

    // Type a value that exceeds max — while editing, the displayed draft
    // must reflect what the user typed (no mid-typing snap).
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "999" } });
    expect(input.value).toBe("999");

    // Blur commits and clamps to totalTurns.
    act(() => input.blur());
    await waitFor(() => expect(input.value).toBe(String(total)));
  });

  it("turn-input clamps to 1 on blur when value is below min", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;

    act(() => input.focus());
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("0");
    act(() => input.blur());
    await waitFor(() => expect(input.value).toBe("1"));
  });

  it("turn-input restores last committed value on blur when emptied", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    expect(input.value).toBe("1");

    act(() => input.focus());
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    act(() => input.blur());
    // Empty draft → restore previous committed value (still 1), do NOT jump.
    await waitFor(() => expect(input.value).toBe("1"));
  });

  it("turn-input commits on Enter and Escape reverts the draft", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;

    // Enter commits.
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(input.value).toBe("2"));

    // Escape reverts an in-progress draft back to the committed value.
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "9" } });
    expect(input.value).toBe("9");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(input.value).toBe("2"));
  });

  it("Ctrl+ArrowDown advances the current turn (spec §5.7)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    expect(input.value).toBe("1");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", ctrlKey: true }),
      );
    });
    // Ctrl+ArrowDown requires two render cycles to propagate to the input
    // (parent's setCurrentTurn → TurnInput's re-sync useEffect → setDraft).
    // The default 1s waitFor timeout is tight under CI CPU pressure; widen
    // defensively to keep this from flaking on busy runners.
    await waitFor(() => expect(input.value).toBe("2"), { timeout: 2000 });
  });

  it("Ctrl+ArrowDown is ignored while focus is in a text input (no hijack)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    expect(input.value).toBe("1");
    act(() => {
      input.focus();
    });
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    // Turn must NOT have advanced — the handler bailed because focus was in INPUT.
    expect(input.value).toBe("1");
  });

  it("renders an error state when the IPC rejects", async () => {
    invokeMock.mockRejectedValue(new Error("ENOENT"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("conversation-viewer-error")).toBeInTheDocument(),
    );
  });

  it("error banner has role='alert' so SR users hear it (WCAG 4.1.3)", async () => {
    // Defect: when the JSONL load fails, the message renders without
    // role="alert", so screen-reader users get no announcement. Mirrors
    // PR #44 (corruption-warning banner).
    invokeMock.mockRejectedValue(new Error("ENOENT"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("conversation-viewer-error")).toHaveAttribute(
        "role",
        "alert",
      ),
    );
  });

  // Spec §17.8 perf budget: parse the first 50 entries quickly so the first
  // paint can land < 500ms. We measure the time from `render()` to the point
  // where `conversation-viewer` is in the DOM (which only happens after the
  // sync batch is parsed and `loading` is flipped). Generous threshold
  // accounts for jsdom + cold module load.
  it("first paint of first 50 messages from a 5000-line file is fast", async () => {
    const oneLine = JSON.stringify({
      type: "user",
      message: { role: "user", content: "x" },
      uuid: "u",
      timestamp: "2026-05-04T09:00:00.000Z",
    });
    const lines = Array.from({ length: 5000 }, () => oneLine);
    invokeMock.mockResolvedValue(lines);

    const t0 = performance.now();
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("conversation-viewer")).toBeInTheDocument(),
    );
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2000);
  });

  // WCAG 2.4.7 Focus Visible — the turn-input previously used
  // `outline-none focus:ring-1 focus:ring-accent`, which (a) strips the
  // browser default outline for *every* focus including mouse and (b)
  // shows a 1-px ring on every focus event. Mirrors the focus-ring trio
  // fix landed in PRs #138 / #139 / #140 / #141 — same defect, same swap.
  it("turn-input has a focus-visible ring (WCAG 2.4.7)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input");
    expect(input.className).toContain("focus-visible:outline-none");
    expect(input.className).toContain("focus-visible:ring-2");
    expect(input.className).toContain("focus-visible:ring-accent");
    // Regression guard: the old non-`focus-visible` classes are gone.
    expect(input.className).not.toMatch(/(^|\s)outline-none(\s|$)/);
    expect(input.className).not.toMatch(/(^|\s)focus:ring-1(\s|$)/);
  });

  // Cross-session leak: when the parent re-uses this component instance
  // and changes the `path` prop (the typical session-switch flow in
  // SessionDetailPanel), the JSONL parse effect resets entries / loading
  // / error — but `currentTurn` carried over. If the user was on Turn 47
  // of session A and clicked session B, the turn-input still showed 47
  // until they blurred it (and silently auto-jumped on B if B had ≥47
  // turns). Verify the input snaps back to "1" on path change.
  it("currentTurn resets to 1 when the session path changes (no cross-session leak)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    const { rerender } = render(<ConversationViewer path="/sessionA.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;

    // Move to a non-default turn on session A and commit on blur.
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.blur(input);
    expect(input.value).toBe("2");

    // Switch to session B (new path → same component instance).
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    rerender(<ConversationViewer path="/sessionB.jsonl" />);
    // Path-change reset propagates through multiple cycles: parent's
    // useEffect([path]) → setCurrentTurn(1) → re-render → TurnInput's
    // re-sync useEffect → setDraft("1"). Default 1s waitFor timeout is
    // tight under CI CPU pressure; widen defensively (same rationale
    // as the Ctrl+ArrowDown test above).
    await waitFor(() => {
      const after = screen.getByTestId("turn-input") as HTMLInputElement;
      expect(after.value).toBe("1");
    }, { timeout: 2000 });
  });

  // Cross-session leak (scroll position): same shape as the currentTurn
  // leak above. The browser preserves the scroller's scrollTop across
  // re-renders that change `path` — without an explicit reset, switching
  // from a long session (scrolled deep) to a short one opens the new
  // session at whatever pixel offset the previous one happened to be at,
  // leaving the actual conversation invisible above the viewport. The
  // user sees blank space and has to scroll up to find their content.
  it("scroller resets scrollTop to 0 when the session path changes", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    const { rerender } = render(<ConversationViewer path="/sessionA.jsonl" />);
    const scrollerA = await screen.findByTestId("conversation-scroller");
    // jsdom doesn't lay out pixels, so scrollTop assignment / reads are
    // backed by a regular property — that's enough to verify the effect
    // writes 0 to it. Seed a non-zero value as if the user had scrolled.
    scrollerA.scrollTop = 500;
    expect(scrollerA.scrollTop).toBe(500);

    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    rerender(<ConversationViewer path="/sessionB.jsonl" />);
    await waitFor(() => {
      const scrollerB = screen.getByTestId("conversation-scroller");
      expect(scrollerB.scrollTop).toBe(0);
    });
  });

  // WCAG 2.1.1 Keyboard — the conversation pane is the largest scrollable
  // region in the app. Without tabIndex={0} keyboard users cannot focus it
  // to arrow/Page-Down through prior turns; they're stuck in the turn input
  // below. Mirrors the focus-ring family (PRs #17/#45/#48/...) for visible
  // focus on the new tab stop.
  it("conversation scroller is keyboard-focusable with a visible focus ring (WCAG 2.1.1 / 2.4.7)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    const scroller = await screen.findByTestId("conversation-scroller");
    expect(scroller.getAttribute("tabindex")).toBe("0");
    expect(scroller.getAttribute("aria-label")).toBe("Conversation");
    expect(scroller.className).toContain("focus-visible:ring-2");
    expect(scroller.className).toContain("focus-visible:ring-accent");
  });

  // a11y: WAI-ARIA + WCAG 1.3.1 — a focusable named scroll container
  // without a role announces as a generic clickable. `role="region"` +
  // the existing aria-label promotes the pane to a proper landmark in
  // the SR rotor's landmarks list. Mirrors the region-landmark family
  // (UserMessage / SummaryBanner / SessionDetailPanel #245 / ToolCallBlock
  // #256).
  it("conversation scroller is exposed as a region landmark (WCAG 1.3.1)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    const scroller = await screen.findByTestId("conversation-scroller");
    expect(scroller.getAttribute("role")).toBe("region");
    expect(scroller.getAttribute("aria-label")).toBe("Conversation");
  });
});
