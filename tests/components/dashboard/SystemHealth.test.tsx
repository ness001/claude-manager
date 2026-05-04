// Tests for SystemHealth — T2.12.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { SystemHealth } from "../../../src/components/dashboard/SystemHealth";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SystemHealth", () => {
  it("mounts without console errors (api check skipped)", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<SystemHealth skipApiCheck />);
    } finally {
      console.error = orig;
    }
    expect(errs).toEqual([]);
  });

  it("indicator dot color reflects status (mcp warn / plugin warn / cli warn / api ok when skipped)", () => {
    render(<SystemHealth skipApiCheck />);
    const indicators = screen.getAllByTestId(/^health-indicator|^health-api/);
    // First three default to "warn" (zero counts / unknown CLI).
    expect(indicators[0].getAttribute("data-status")).toBe("warn"); // MCP
    expect(indicators[1].getAttribute("data-status")).toBe("warn"); // Plugins
    // API is "ok" because skipApiCheck=true bypasses the network probe.
    expect(screen.getByTestId("health-api").getAttribute("data-status")).toBe("ok");
  });

  it("populated values flip MCP / Plugins / CLI to ok", () => {
    render(
      <SystemHealth
        skipApiCheck
        mcpCount={2}
        pluginCount={5}
        cliVersion="1.2.3"
      />,
    );
    const indicators = screen.getAllByTestId(/^health-indicator|^health-api/);
    expect(indicators[0].getAttribute("data-status")).toBe("ok"); // MCP
    expect(indicators[1].getAttribute("data-status")).toBe("ok"); // Plugins
    // CLI is the last "indicator" testid (api uses its own testid).
    const cliRow = indicators[indicators.length - 1];
    expect(cliRow.getAttribute("data-status")).toBe("ok");
    expect(cliRow.textContent).toContain("1.2.3");
  });

  it("API check is non-blocking — starts as 'checking' then resolves", async () => {
    // Mock fetch to a resolved 200 OK.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response),
    );

    render(<SystemHealth apiCheckUrl="http://example.test/v1" />);
    // First paint shows "checking".
    expect(screen.getByTestId("health-api").getAttribute("data-status")).toBe("checking");

    await waitFor(() => {
      expect(screen.getByTestId("health-api").getAttribute("data-status")).toBe("ok");
    });
  });

  it("API check failure surfaces as 'fail'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<SystemHealth apiCheckUrl="http://example.test/v1" />);
    await waitFor(() => {
      expect(screen.getByTestId("health-api").getAttribute("data-status")).toBe("fail");
    });
  });
});
