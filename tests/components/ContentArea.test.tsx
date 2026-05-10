import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ContentArea } from "../../src/components/ContentArea";
import {
  useNavigationStore,
  type Section,
} from "../../src/stores/navigation-store";

describe("ContentArea", () => {
  beforeEach(() => {
    useNavigationStore.setState({ activeSection: "dashboard" });
  });

  afterEach(() => {
    cleanup();
  });

  // Sessions section was upgraded in T2.9 — it now mounts SessionListPanel
  // instead of a placeholder heading. Dashboard section was upgraded in
  // T2.13 — it now mounts the full dashboard layout (no <h1>). Other
  // sections remain placeholders.
  const headingCases: Array<{ section: Section; heading: string }> = [
    { section: "plugins", heading: "Plugins" },
    { section: "skills", heading: "Custom Skills" },
    { section: "mcp", heading: "MCP Servers" },
    { section: "settings", heading: "Settings" },
  ];

  it.each(headingCases)(
    "renders the $heading heading when activeSection is $section",
    ({ section, heading }) => {
      useNavigationStore.getState().navigateTo(section);
      render(<ContentArea />);
      expect(
        screen.getByRole("heading", { level: 1, name: heading }),
      ).toBeInTheDocument();
    },
  );

  it("renders DashboardSection layout when activeSection is dashboard", () => {
    useNavigationStore.getState().navigateTo("dashboard");
    render(<ContentArea />);
    expect(screen.getByTestId("dashboard-section")).toBeInTheDocument();
  });

  it("renders SessionsSection when activeSection is sessions", () => {
    useNavigationStore.getState().navigateTo("sessions");
    render(<ContentArea />);
    expect(screen.getByTestId("sessions-section")).toBeInTheDocument();
  });

  it("renders the MCP section heading as 'MCP Servers' specifically", () => {
    useNavigationStore.getState().navigateTo("mcp");
    render(<ContentArea />);
    expect(
      screen.getByRole("heading", { level: 1, name: "MCP Servers" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "MCP" }),
    ).not.toBeInTheDocument();
  });

  // WCAG 2.4.1 / ARIA APG — the <main> landmark needs an accessible name so
  // screen-reader landmark navigation can identify which of the six sections
  // is mounted. Without aria-label, NVDA's "D" landmark cycle and the
  // VoiceOver rotor announce only "main", indistinguishable across sections.
  const labelCases: Array<{ section: Section; label: string }> = [
    { section: "dashboard", label: "Dashboard" },
    { section: "sessions", label: "Sessions" },
    { section: "plugins", label: "Plugins" },
    { section: "skills", label: "Skills" },
    { section: "mcp", label: "MCP Servers" },
    { section: "settings", label: "Settings" },
  ];

  it.each(labelCases)(
    "main landmark aria-label is '$label' when activeSection is $section (WCAG 2.4.1)",
    ({ section, label }) => {
      useNavigationStore.getState().navigateTo(section);
      render(<ContentArea />);
      const main = screen.getByRole("main");
      expect(main.getAttribute("aria-label")).toBe(label);
    },
  );
});
