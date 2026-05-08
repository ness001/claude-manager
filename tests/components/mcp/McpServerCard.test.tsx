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

  it("action set varies per state (spec §8.3)", () => {
    const cases: Array<[typeof FIX_CONNECTED, string[]]> = [
      [
        FIX_CONNECTED,
        [
          "action-restart",
          "action-view-tools",
          "action-view-logs",
          "action-edit",
          "action-remove",
        ],
      ],
      [
        FIX_DISCONNECTED,
        ["action-connect", "action-view-logs", "action-edit", "action-remove"],
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
});
