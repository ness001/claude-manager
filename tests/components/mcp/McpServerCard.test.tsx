// Tests for McpServerCard — status dot variants, action sets per state,
// shadowing, remove confirmation. We mock the IPC boundary; the card
// itself is the unit under test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn() }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

import { McpServerCard } from "../../../src/components/mcp/McpServerCard";
import {
  FIX_CONNECTED,
  FIX_DISCONNECTED,
  FIX_ERROR,
  FIX_STARTING,
  FIX_SHADOWED_USER,
} from "../../fixtures/mcp-ui/servers";

beforeEach(() => {
  invokeMock.mockReset();
});
afterEach(() => cleanup());

const noop = () => {};

describe("McpServerCard", () => {
  it("mounts without console errors AND never invokes the real claude CLI", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(
        <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
      );
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
    // Spec §8.3 gate: rendering a card must NEVER spawn `claude mcp list`.
    const calls = invokeMock.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("check_mcp_status");
  });

  it("status dot per state (spec §8.3): connected=green, disconnected=hollow, error=red, starting=amber pulsing", () => {
    for (const fix of [FIX_CONNECTED, FIX_DISCONNECTED, FIX_ERROR, FIX_STARTING]) {
      const { unmount } = render(
        <McpServerCard server={fix} onEdit={noop} onRemove={noop} />,
      );
      const dot = screen.getByTestId("status-dot");
      expect(dot.dataset.state).toBe(fix.status);
      const cls = dot.className;
      switch (fix.status) {
        case "connected":
          expect(cls).toContain("bg-status-success");
          break;
        case "disconnected":
          expect(cls).toContain("border");
          expect(cls).toContain("bg-transparent");
          break;
        case "error":
          expect(cls).toContain("bg-status-error");
          break;
        case "starting":
          expect(cls).toContain("animate-pulse");
          expect(cls).toContain("bg-status-warning");
          break;
      }
      unmount();
    }
  });

  // WCAG 1.4.1 (Use of Color) + 4.1.2 (Name, Role, Value): the status dot is
  // the only programmatic state cue on the card header. Without role="img"
  // the bare aria-label sits on a generic <span> that screen readers skip
  // during element-by-element navigation. Mirrors SessionCard / PluginCard.
  it("status dot exposes role='img' with the state in its aria-label (a11y)", () => {
    for (const fix of [FIX_CONNECTED, FIX_DISCONNECTED, FIX_ERROR, FIX_STARTING]) {
      const { unmount } = render(
        <McpServerCard server={fix} onEdit={noop} onRemove={noop} />,
      );
      const dot = screen.getByTestId("status-dot");
      expect(dot.getAttribute("role")).toBe("img");
      expect(dot.getAttribute("aria-label")).toBe(`status: ${fix.status}`);
      unmount();
    }
  });

  it("action set varies per state (spec §8.3)", () => {
    const cases: Array<[typeof FIX_CONNECTED, string[]]> = [
      [
        FIX_CONNECTED,
        [
          "action-view-tools",
          "action-view-logs",
          "action-edit",
          "action-remove",
        ],
      ],
      [
        FIX_DISCONNECTED,
        ["action-view-logs", "action-edit", "action-remove"],
      ],
      [
        FIX_ERROR,
        ["action-retry", "action-view-logs", "action-edit", "action-remove"],
      ],
      [FIX_STARTING, ["action-cancel", "action-view-logs"]],
    ];
    for (const [fix, expected] of cases) {
      const { unmount } = render(
        <McpServerCard server={fix} onEdit={noop} onRemove={noop} />,
      );
      for (const id of expected) {
        expect(
          screen.getByTestId(id),
          `missing ${id} for status=${fix.status}`,
        ).toBeInTheDocument();
      }
      // Starting must NOT show edit/remove (per spec table — only Cancel +
      // View Logs). Verify Edit is absent.
      if (fix.status === "starting") {
        expect(screen.queryByTestId("action-edit")).toBeNull();
      }
      unmount();
    }
  });

  it("Retry/Cancel buttons are disabled when their handlers aren't wired", () => {
    // Same defect class as View Tools (#30) and View Logs (#32): the buttons
    // render but neither McpPanel nor any caller passes onRetry/onCancel,
    // so clicking is a silent no-op. Disabled-with-tooltip until wired.
    const { unmount: unmountRetry } = render(
      <McpServerCard server={FIX_ERROR} onEdit={noop} onRemove={noop} />,
    );
    const retry = screen.getByTestId("action-retry") as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(retry.title).toBe("Coming soon");
    unmountRetry();

    render(<McpServerCard server={FIX_STARTING} onEdit={noop} onRemove={noop} />);
    const cancel = screen.getByTestId("action-cancel") as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.title).toBe("Coming soon");
  });

  it("shadowed server is dimmed and shows Overridden by [scope] badge", () => {
    render(
      <McpServerCard server={FIX_SHADOWED_USER} onEdit={noop} onRemove={noop} />,
    );
    const card = screen.getByTestId("mcp-server-card");
    expect(card.className).toContain("opacity-60");
    const badge = screen.getByTestId("overridden-badge");
    expect(badge.textContent).toContain("Overridden by project");
  });

  it("Remove → confirmation dialog → calls onRemove only on confirm", () => {
    const onRemove = vi.fn();
    render(
      <McpServerCard
        server={FIX_CONNECTED}
        onEdit={noop}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByTestId("action-remove"));
    expect(screen.getByTestId("remove-confirm-dialog")).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();

    // Cancel → no call.
    fireEvent.click(screen.getByTestId("remove-cancel"));
    expect(screen.queryByTestId("remove-confirm-dialog")).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();

    // Re-open and confirm.
    fireEvent.click(screen.getByTestId("action-remove"));
    fireEvent.click(screen.getByTestId("remove-confirm"));
    expect(onRemove).toHaveBeenCalledWith(FIX_CONNECTED);
  });

  // Mirrors McpServerForm Escape behavior (PR #36): keyboard users need a
  // fast escape hatch from the destructive Remove confirmation prompt.
  it("Remove-confirm dialog: Escape closes without calling onRemove", () => {
    const onRemove = vi.fn();
    const noop = () => {};
    render(
      <McpServerCard
        server={FIX_CONNECTED}
        onEdit={noop}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByTestId("action-remove"));
    expect(screen.getByTestId("remove-confirm-dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("remove-confirm-dialog")).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("View Tools button is disabled when no onViewTools callback is wired", () => {
    const noop = () => {};
    render(
      <McpServerCard
        server={FIX_CONNECTED}
        onEdit={noop}
        onRemove={noop}
      />,
    );
    const btn = screen.getByTestId("action-view-tools");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveAttribute("title", "Coming soon");
  });

  it("View Tools button is enabled and fires onViewTools when wired", () => {
    const noop = () => {};
    const onViewTools = vi.fn();
    render(
      <McpServerCard
        server={FIX_CONNECTED}
        onEdit={noop}
        onRemove={noop}
        onViewTools={onViewTools}
      />,
    );
    const btn = screen.getByTestId("action-view-tools");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onViewTools).toHaveBeenCalledWith(FIX_CONNECTED);
  });

  it("View Logs button is disabled with 'Coming soon' across all 4 states when no onViewLogs callback is wired", () => {
    const noop = () => {};
    for (const fix of [FIX_CONNECTED, FIX_DISCONNECTED, FIX_ERROR, FIX_STARTING]) {
      const { unmount } = render(
        <McpServerCard server={fix} onEdit={noop} onRemove={noop} />,
      );
      const btn = screen.getByTestId("action-view-logs");
      expect(btn, `disabled for status=${fix.status}`).toBeDisabled();
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(btn).toHaveAttribute("title", "Coming soon");
      unmount();
    }
  });

  it("View Logs button is enabled and fires onViewLogs when wired", () => {
    const noop = () => {};
    const onViewLogs = vi.fn();
    render(
      <McpServerCard
        server={FIX_CONNECTED}
        onEdit={noop}
        onRemove={noop}
        onViewLogs={onViewLogs}
      />,
    );
    const btn = screen.getByTestId("action-view-logs");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onViewLogs).toHaveBeenCalledWith(FIX_CONNECTED);
  });

  // WCAG 2.4.7 (Focus Visible): the ActionButton helper renders all action
  // buttons here (View Tools/Logs/Retry/Cancel/Edit/Remove) and previously
  // relied on the browser default ring, which Tauri's WebView renders
  // inconsistently across platforms — keyboard users could lose track of
  // focus. Mirrors PRs #117 / #118 / #119 / #125 / #126.
  it.each([
    ["action-edit"],
    ["action-remove"],
  ])("%s exposes a visible focus ring (WCAG 2.4.7)", (testId) => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    const btn = screen.getByTestId(testId);
    expect(btn.className).toContain("focus-visible:outline-none");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-accent");
  });

  // WCAG 2.4.7 (Focus Visible): the chevron expand-toggle had no focus ring
  // at all — keyboard users tabbing into a card couldn't see they had landed
  // on the disclosure control before pressing Enter. Mirrors #125 / #126 / #128.
  it("expand-toggle exposes a visible focus ring (WCAG 2.4.7)", () => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    const btn = screen.getByTestId("expand-toggle");
    expect(btn.className).toContain("focus-visible:outline-none");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-accent");
  });

  // WAI-ARIA Disclosure pattern (WCAG 4.1.2): the toggle had aria-label but
  // no aria-expanded, so screen readers announced "Expand, button" / "Collapse,
  // button" without conveying current state — and AT users couldn't perceive
  // that the click had toggled anything because there was no state to read.
  it("expand-toggle exposes aria-expanded that flips on click (WCAG 4.1.2)", () => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    const btn = screen.getByTestId("expand-toggle");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  // WCAG 4.1.2 — the chevron SVG is decorative; the button's aria-label is
  // the accessible name. Without aria-hidden, some screen readers announce
  // the SVG's computed name redundantly. Mirrors PRs #53 / #55 / #119.
  it("expand-toggle chevron icon is aria-hidden", () => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    const btn = screen.getByTestId("expand-toggle");
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  // WCAG 2.4.7 Focus Visible — the destructive Remove button inside the
  // confirmation dialog had no focus ring at all. A keyboard user could
  // press Enter on a button they couldn't see, triggering an irreversible
  // server removal. Use the offset trio because the button's `hover` state
  // flips the bg to status-error red, against which a plain accent ring
  // would clash; the offset breaks the ring off the bar edge.
  it("remove-confirm exposes a focus ring with offset (WCAG 2.4.7)", () => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    fireEvent.click(screen.getByTestId("action-remove"));
    const btn = screen.getByTestId("remove-confirm");
    expect(btn.className).toContain("focus-visible:outline-none");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-accent");
    expect(btn.className).toContain("focus-visible:ring-offset-2");
    expect(btn.className).toContain("focus-visible:ring-offset-bg-primary");
  });

  // WCAG 2.4.7 — the Cancel button sits on a neutral bg (no accent-on-accent
  // collision), so the plain focus-visible trio is sufficient.
  it("remove-cancel exposes a visible focus ring (WCAG 2.4.7)", () => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    fireEvent.click(screen.getByTestId("action-remove"));
    const btn = screen.getByTestId("remove-cancel");
    expect(btn.className).toContain("focus-visible:outline-none");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-accent");
  });

  // WAI-ARIA 1.2 — a button with `aria-expanded` should also have
  // `aria-controls` pointing to the disclosed region. Without it, screen
  // readers announce "expanded/collapsed" but users have no programmatic
  // way to know what region this button toggles. The detail panel is
  // rendered conditionally, so the controlled element only exists in the
  // DOM when expanded — the contract still requires the id to point at
  // the panel when present.
  it("expand-toggle has aria-controls pointing to the detail panel", () => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    const btn = screen.getByTestId("expand-toggle");
    const controlsId = btn.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    // While collapsed, no element with that id exists yet.
    expect(document.getElementById(controlsId!)).toBeNull();
    // Expand → the controlled element with the matching id is in the DOM.
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-controls")).toBe(controlsId);
    const panel = document.getElementById(controlsId!);
    expect(panel).not.toBeNull();
    // The panel wraps the McpServerDetail body — sanity-check that some
    // detail content is inside it (env/headers/command sections render
    // their own testids; the wrapper just needs to contain *something*
    // from the detail subtree).
    expect(panel!.children.length).toBeGreaterThan(0);
  });

  // Destructive-confirm UX: when the user clicks Remove, focus must move
  // to the safest default action (Cancel) — same pattern as native browser
  // confirm() dialogs and the WAI-ARIA Authoring Practices guidance for
  // alert dialogs. Without auto-focus, keyboard users hit Remove and focus
  // stays on the (still-visible) Remove ActionButton — they can't reach
  // Cancel without tabbing across the whole card.
  it("auto-focuses the Cancel button when the remove confirm appears", () => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    fireEvent.click(screen.getByTestId("action-remove"));
    const cancel = screen.getByTestId("remove-cancel");
    expect(document.activeElement).toBe(cancel);
  });

  // WAI-ARIA APG: a destructive confirmation that interrupts the user's
  // workflow to acquire a yes/no response is precisely the alertdialog
  // pattern, not a generic dialog. Additionally the question text must
  // be programmatically associated as the dialog's description so SR
  // users hear "Remove server X?" — not just the dialog's aria-label.
  it("remove confirm uses role=alertdialog and aria-describedby points at the question text", () => {
    render(
      <McpServerCard server={FIX_CONNECTED} onEdit={noop} onRemove={noop} />,
    );
    fireEvent.click(screen.getByTestId("action-remove"));
    const dlg = screen.getByTestId("remove-confirm-dialog");
    expect(dlg.getAttribute("role")).toBe("alertdialog");
    const describedBy = dlg.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const msg = document.getElementById(describedBy!);
    expect(msg).not.toBeNull();
    expect(msg!.textContent).toContain("Remove server");
    expect(msg!.textContent).toContain(FIX_CONNECTED.name);
  });
});
