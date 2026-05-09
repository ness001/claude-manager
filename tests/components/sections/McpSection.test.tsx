// McpSection wires McpPanel + the form modal, and runs the spec §13
// refresh cadence (15s visible, 60s hidden, 2s post-action burst).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const loadMcpServersMock = vi.fn(async () => []);
const saveMcpServerMock = vi.fn(async () => undefined);
const deleteMcpServerMock = vi.fn(async () => undefined);
vi.mock("../../../src/lib/mcp-loader", async () => {
  const actual =
    await vi.importActual<typeof import("../../../src/lib/mcp-loader")>(
      "../../../src/lib/mcp-loader",
    );
  return {
    ...actual,
    loadMcpServers: (...a: unknown[]) => loadMcpServersMock(...a),
    saveMcpServer: (...a: unknown[]) => saveMcpServerMock(...a),
    deleteMcpServer: (...a: unknown[]) => deleteMcpServerMock(...a),
  };
});

const invokeMock = vi.fn(async () => "");
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn() }));

import { McpSection } from "../../../src/sections/McpSection";
import { useMcpStore } from "../../../src/stores/mcp-store";
import { FIX_CONNECTED } from "../../fixtures/mcp-ui/servers";

beforeEach(() => {
  loadMcpServersMock.mockReset();
  loadMcpServersMock.mockResolvedValue([]);
  saveMcpServerMock.mockReset();
  saveMcpServerMock.mockResolvedValue(undefined);
  deleteMcpServerMock.mockReset();
  deleteMcpServerMock.mockResolvedValue(undefined);
  invokeMock.mockReset();
  invokeMock.mockResolvedValue("");
  useMcpStore.setState({
    servers: [],
    searchQuery: "",
    isLoading: false,
    error: null,
    editingServer: null,
    cwd: "",
    projectRoots: [],
  });
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("McpSection", () => {
  it("mounts without console errors and renders McpPanel", async () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      await act(async () => {
        render(<McpSection />);
        await Promise.resolve();
      });
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
    expect(screen.getByTestId("mcp-panel")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-section")).toBeInTheDocument();
  });

  it("loadServers is called once on mount", async () => {
    await act(async () => {
      render(<McpSection />);
      await Promise.resolve();
    });
    expect(loadMcpServersMock).toHaveBeenCalledTimes(1);
  });

  it("kicks off an immediate status refresh on mount (regression: 'all servers DISCONNECTED forever')", async () => {
    // Without the immediate refresh, servers stay at the default
    // `disconnected` for VISIBLE_INTERVAL_MS (15s) before the first
    // poll-tick fires — presenting as "all servers DISCONNECTED forever"
    // until the user notices something change. Spec §13 mandates an
    // initial refresh chained after loadServers.
    await act(async () => {
      render(<McpSection />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const statusCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "check_mcp_status",
    ).length;
    expect(statusCalls).toBe(1);
  });

  it("refresh interval: 15s when visible, 60s when hidden, 2s burst after action", async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<McpSection />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Mount load is via loadMcpServers + an immediate refreshStatus().
    // From here, interval ticks add to that baseline.
    const statusCalls = () =>
      invokeMock.mock.calls.filter((c) => c[0] === "check_mcp_status").length;

    expect(statusCalls()).toBe(1);

    // Visible cadence: tick 15s → one more refresh.
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(statusCalls()).toBe(2);

    // Switch to hidden — interval re-arms at 60s.
    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    // 15s after switch should NOT fire (hidden cadence is 60s).
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(statusCalls()).toBe(2);
    // Total 60s after switch → fires.
    await act(async () => {
      vi.advanceTimersByTime(45_000);
      await Promise.resolve();
    });
    expect(statusCalls()).toBe(3);

    // Post-action burst: server count change triggers a 2s refresh.
    await act(async () => {
      useMcpStore.setState({ servers: [FIX_CONNECTED] });
      await Promise.resolve();
    });
    const before = statusCalls();
    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });
    expect(statusCalls()).toBe(before + 1);
  });

  it("setting editingServer mounts McpServerForm; stopEditing closes it", async () => {
    await act(async () => {
      render(<McpSection />);
      await Promise.resolve();
    });
    expect(screen.queryByTestId("form-name")).toBeNull();

    // Open form via store (mirrors what add-server-btn does in McpPanel).
    await act(async () => {
      useMcpStore.getState().startEditing({
        ...FIX_CONNECTED,
        name: "",
      });
      await Promise.resolve();
    });
    expect(screen.getByTestId("form-name")).toBeInTheDocument();

    // Cancel closes.
    fireEvent.click(screen.getByTestId("form-cancel"));
    await flush();
    expect(screen.queryByTestId("form-name")).toBeNull();
  });

  it("never spawns the real claude CLI: check_mcp_status only via mocked invoke", async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<McpSection />);
      await Promise.resolve();
    });
    // Drive the visible cadence a few times.
    await act(async () => {
      vi.advanceTimersByTime(45_000);
      await Promise.resolve();
    });
    // Every check_mcp_status call must have hit the mock — the mock is the
    // only handler bound to invoke in this test, so any real subprocess
    // would have produced an unhandled rejection.
    const calls = invokeMock.mock.calls.map((c) => c[0]);
    // At least one refresh fired, and ALL went through the mock.
    expect(calls.filter((c) => c === "check_mcp_status").length).toBeGreaterThan(
      0,
    );
  });

  it("dark + light theme parity: section keeps the same root utilities", async () => {
    const { unmount } = render(<McpSection />);
    await flush();
    const lightClass = screen.getByTestId("mcp-section").className;
    unmount();
    document.documentElement.classList.add("dark");
    try {
      await act(async () => {
        render(<McpSection />);
        await Promise.resolve();
      });
      const darkClass = screen.getByTestId("mcp-section").className;
      expect(darkClass).toBe(lightClass);
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });
});
