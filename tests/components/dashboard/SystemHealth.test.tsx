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

  it("status dots expose status to screen readers (WCAG 4.1.2 / 1.4.1)", () => {
    // Defect: dots had `aria-hidden` so the only signal of ok/warn/fail was
    // color, leaving SR users with no status info. Fix gives each dot
    // role="img" + an aria-label matching STATUS_LABEL[status].
    render(
      <SystemHealth skipApiCheck mcpCount={0} pluginCount={3} cliVersion="unknown" />,
    );
    const dots = screen.getAllByTestId("health-dot");
    // MCP (warn), Plugins (ok), API (ok via skipApiCheck), CLI (warn).
    expect(dots[0]).toHaveAttribute("role", "img");
    expect(dots[0]).toHaveAttribute("aria-label", "Warning");
    expect(dots[1]).toHaveAttribute("aria-label", "OK");
    expect(dots[2]).toHaveAttribute("aria-label", "OK");
    expect(dots[3]).toHaveAttribute("aria-label", "Warning");
    // No `aria-hidden` survives — that was the regression.
    for (const dot of dots) {
      expect(dot.getAttribute("aria-hidden")).toBeNull();
    }
  });

  it("section label uses an <h3> heading (WCAG 1.3.1 / 2.4.6)", () => {
    // Defect: visual section label rendered as a <div>, so screen-reader
    // users couldn't navigate to it via headings list. Mirrors PR #52
    // (SessionListPanel group headers).
    render(<SystemHealth skipApiCheck />);
    const heading = screen.getByRole("heading", { name: "System Health", level: 3 });
    expect(heading.tagName).toBe("H3");
  });
});
