// Tests for SystemHealth — T2.12.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

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

  it("warn dot uses the contrast-safe status-amber background, not the bare yellow (WCAG 1.4.11)", () => {
    // The original `bg-status-yellow` (#eab308) on the white card-bg gave
    // ~1.6:1 contrast — well below the 3:1 non-text floor. Sighted users
    // in light mode saw what was effectively an invisible dot for the
    // primary visual signal distinguishing "warn" from "ok" rows. Pin
    // both the positive (status-amber present) and the negative (no bare
    // status-yellow) so a future refactor can't silently regress.
    render(<SystemHealth skipApiCheck />);
    const indicators = screen.getAllByTestId(/^health-indicator|^health-api/);
    // First indicator (MCP) defaults to "warn" (mcpCount=0).
    const warnRow = indicators[0];
    expect(warnRow.getAttribute("data-status")).toBe("warn");
    const dot = warnRow.querySelector("[data-testid='health-dot']");
    expect(dot).not.toBeNull();
    const cls = dot!.getAttribute("class") ?? "";
    expect(cls).toContain("bg-status-amber");
    expect(cls).not.toMatch(/bg-status-yellow(?!-)/);
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

  // Defect: a stalled HEAD probe (network never responds) used to leave the
  // dot stuck on "Checking…" forever. Fix adds an 8s AbortController-driven
  // timeout that flips the dot to "fail" so the indicator stays actionable.
  it("API check times out after 8s and surfaces 'fail'", async () => {
    vi.useFakeTimers();
    // Pending fetch: rejects only when its signal aborts (mirrors real
    // browser semantics — fetch throws an AbortError when controller.abort()
    // fires).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const sig = init.signal;
          if (sig) {
            sig.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }
        });
      }),
    );

    render(<SystemHealth apiCheckUrl="http://example.test/v1" />);
    expect(screen.getByTestId("health-api").getAttribute("data-status")).toBe("checking");

    // Advance past the 8 s timeout. waitFor doesn't mix with fake timers, so
    // drive the timer + microtask queue explicitly via act.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8001);
    });

    expect(screen.getByTestId("health-api").getAttribute("data-status")).toBe("fail");

    vi.useRealTimers();
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

  // a11y: WCAG 1.3.1 + WAI-ARIA APG — promote the card root to a labelled
  // <section> bound to the visible <h3> via aria-labelledby so it appears
  // in the SR rotor's landmarks list. Mirrors PR #262 (ModelDonut) and
  // the broader region-landmark sweep (#245 / #256 / #261).
  it("card root is a labelled <section> region bound to the visible <h3> heading", () => {
    render(<SystemHealth skipApiCheck />);
    const root = screen.getByTestId("system-health");
    expect(root.tagName).toBe("SECTION");
    const labelledBy = root.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    const heading = document.getElementById(labelledBy!);
    expect(heading).not.toBeNull();
    expect(heading!.tagName).toBe("H3");
    expect(heading!.textContent).toBe("System Health");
  });

  // WCAG 2.4.6 (Headings and Labels) / 1.3.1 (Info and Relationships):
  // screen-reader users navigating by lists (NVDA "L", JAWS "L") would hear
  // "list, 4 items" with no clue this is the system-health breakdown — the
  // visual context (the "System Health" h3 above) is not exposed to AT for
  // the list itself. Mirrors the labeled-list pattern in ModelDonut
  // (donut-legend, lines 114-124).
  it("indicator list has an aria-label so AT rotor users get context", () => {
    render(<SystemHealth skipApiCheck />);
    const list = screen.getByRole("list", { name: "System health indicators" });
    expect(list.tagName).toBe("UL");
  });

  // MCP indicator pluralization. Previously hardcoded to "servers", so a
  // single configured server rendered the ungrammatical "1 servers".
  it.each([
    { mcpCount: 0, expected: "0 servers" },
    { mcpCount: 1, expected: "1 server" },
    { mcpCount: 2, expected: "2 servers" },
  ])("MCP row pluralization — $mcpCount → $expected", ({ mcpCount, expected }) => {
    render(<SystemHealth skipApiCheck mcpCount={mcpCount} />);
    const indicators = screen.getAllByTestId(/^health-indicator|^health-api/);
    expect(indicators[0].textContent).toContain(expected);
  });

  // Plugins indicator pluralization. Previously hardcoded to "installed"
  // with no count word, so "1 installed" lacked grammatical agreement and
  // diverged from the MCP row's "1 server" / "N servers" shape. Same fix
  // shape as the MCP row.
  it.each([
    { pluginCount: 0, expected: "0 plugins installed" },
    { pluginCount: 1, expected: "1 plugin installed" },
    { pluginCount: 2, expected: "2 plugins installed" },
  ])(
    "Plugins row pluralization — $pluginCount → $expected",
    ({ pluginCount, expected }) => {
      render(<SystemHealth skipApiCheck pluginCount={pluginCount} />);
      const indicators = screen.getAllByTestId(/^health-indicator|^health-api/);
      expect(indicators[1].textContent).toContain(expected);
    },
  );

  // Defect: the value cell has `truncate`, so long CLI version strings
  // (release builds embed "+commit-abcdef0") and future long MCP/plugin
  // labels get clipped with no recovery — the row is non-interactive, so
  // a sighted user has no way to read the hidden tail. Mirror the visible
  // string into `title`. Mirrors PR #170 (RecentSessions) and PR #167
  // (SkillCard skill-path).
  it("indicator value mirrors its visible text into the `title` attribute (UX truncation recovery)", () => {
    render(
      <SystemHealth
        skipApiCheck
        cliVersion="1.2.3+build.20260511.commit-abcdef0123456789"
      />,
    );
    // Find the CLI row by its label.
    const indicators = screen.getAllByTestId(/^health-indicator|^health-api/);
    const cliRow = indicators[indicators.length - 1];
    const valueSpan = cliRow.querySelector("span.truncate") as HTMLElement | null;
    expect(valueSpan).not.toBeNull();
    expect(valueSpan!.getAttribute("title")).toBe(
      "1.2.3+build.20260511.commit-abcdef0123456789",
    );
  });

  // WCAG 1.3.1 (Info and Relationships) / 4.1.2 (Name, Role, Value): the
  // indicator visually composes label + value + status-dot into one tile,
  // but the DOM is a colored dot ("OK") plus two flat sibling spans
  // ("MCP", "0 servers") with no programmatic linkage. SR users walking
  // the list hear three disconnected fragments per item; rotor list view
  // shows each <li> only by its first text node. Promote the <li> to a
  // self-contained announcement combining all three pieces:
  // "MCP: 0 servers — Warning". Mirrors StatCard (#37) coherent-tile
  // pattern. Visible layout unchanged.
  it("each <li> exposes a coherent label+value+status aria-label (WCAG 1.3.1 / 4.1.2)", () => {
    render(
      <SystemHealth
        skipApiCheck
        mcpCount={2}
        pluginCount={5}
        cliVersion="1.2.3"
      />,
    );
    const indicators = screen.getAllByTestId(/^health-indicator|^health-api/);
    // Order matches the JSX in SystemHealth.tsx: MCP, Plugins, API, CLI.
    expect(indicators[0].getAttribute("aria-label")).toBe(
      "MCP: 2 servers — OK",
    );
    expect(indicators[1].getAttribute("aria-label")).toBe(
      "Plugins: 5 plugins installed — OK",
    );
    expect(indicators[2].getAttribute("aria-label")).toBe("API: OK");
    expect(indicators[3].getAttribute("aria-label")).toBe("CLI: 1.2.3 — OK");
  });

  // WCAG 4.1.2 (Name, Role, Value): the API row's `value` IS the status
  // label ("OK" / "Down" / "Checking…"), so the previous unconditional
  // `${label}: ${value} — ${status}` template stuttered as "API: OK — OK".
  // Some SR rotors collapse the duplicate, others read it back twice.
  // Pin: when value === status label, the trailing suffix is suppressed.
  // Cover both states the API row actually visits.
  it("API row drops redundant status suffix in aria-label (no 'API: OK — OK')", () => {
    render(
      <SystemHealth
        skipApiCheck
        mcpCount={2}
        pluginCount={5}
        cliVersion="1.2.3"
      />,
    );
    const apiRow = screen.getByTestId("health-api");
    expect(apiRow.getAttribute("aria-label")).toBe("API: OK");
    expect(apiRow.getAttribute("aria-label")).not.toContain("— OK");
  });

  // Singular case: 1 server / 1 plugin must read naturally. Ensures the
  // existing pluralization in the value string flows through to the
  // aria-label without grammar drift like "1 servers".
  it("aria-label respects singular pluralization (n=1)", () => {
    render(
      <SystemHealth
        skipApiCheck
        mcpCount={1}
        pluginCount={1}
        cliVersion="2.0.0"
      />,
    );
    const indicators = screen.getAllByTestId(/^health-indicator|^health-api/);
    expect(indicators[0].getAttribute("aria-label")).toBe(
      "MCP: 1 server — OK",
    );
    expect(indicators[1].getAttribute("aria-label")).toBe(
      "Plugins: 1 plugin installed — OK",
    );
  });
});
