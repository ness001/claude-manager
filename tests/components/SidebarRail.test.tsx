import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { SidebarRail } from "../../src/components/SidebarRail";
import { useNavigationStore } from "../../src/stores/navigation-store";

describe("SidebarRail", () => {
  beforeEach(() => {
    useNavigationStore.setState({ activeSection: "dashboard" });
  });

  afterEach(() => {
    cleanup();
  });

  const labels = [
    "Dashboard",
    "Sessions",
    "Plugins",
    "Skills",
    "MCP Servers",
    "Settings",
  ];

  it("renders all 6 nav buttons by aria-label", () => {
    render(<SidebarRail />);
    for (const label of labels) {
      expect(
        screen.getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("marks the active section's button with data-active='true' and others false", () => {
    render(<SidebarRail />);
    expect(
      screen.getByRole("button", { name: "Dashboard" }),
    ).toHaveAttribute("data-active", "true");
    for (const label of labels.filter((l) => l !== "Dashboard")) {
      expect(
        screen.getByRole("button", { name: label }),
      ).toHaveAttribute("data-active", "false");
    }
  });

  it("reflects updates when activeSection changes in the store", () => {
    useNavigationStore.setState({ activeSection: "plugins" });
    render(<SidebarRail />);
    expect(
      screen.getByRole("button", { name: "Plugins" }),
    ).toHaveAttribute("data-active", "true");
    expect(
      screen.getByRole("button", { name: "Dashboard" }),
    ).toHaveAttribute("data-active", "false");
  });

  it("clicking a button calls navigateTo with the corresponding section id", () => {
    render(<SidebarRail />);
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(useNavigationStore.getState().activeSection).toBe("sessions");

    fireEvent.click(screen.getByRole("button", { name: "MCP Servers" }));
    expect(useNavigationStore.getState().activeSection).toBe("mcp");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(useNavigationStore.getState().activeSection).toBe("settings");
  });

  it("active button has aria-current='page' and inactive buttons do not", () => {
    render(<SidebarRail />);
    expect(
      screen.getByRole("button", { name: "Dashboard" }),
    ).toHaveAttribute("aria-current", "page");
    for (const label of labels.filter((l) => l !== "Dashboard")) {
      expect(
        screen.getByRole("button", { name: label }),
      ).not.toHaveAttribute("aria-current");
    }
  });

  it("tooltip (title attr) includes the keyboard shortcut", () => {
    render(<SidebarRail />);
    const pairs: Array<[string, string]> = [
      ["Dashboard", "Ctrl+1"],
      ["Sessions", "Ctrl+2"],
      ["Plugins", "Ctrl+3"],
      ["Skills", "Ctrl+4"],
      ["MCP Servers", "Ctrl+5"],
      ["Settings", "Ctrl+6"],
    ];
    for (const [label, shortcut] of pairs) {
      expect(
        screen.getByRole("button", { name: label }),
      ).toHaveAttribute("title", `${label} (${shortcut})`);
    }
  });

  it("buttons have a focus-visible ring class for keyboard navigation", () => {
    render(<SidebarRail />);
    const btn = screen.getByRole("button", { name: "Dashboard" });
    expect(btn.className).toContain("focus-visible:ring-2");
  });

  // WCAG 4.1.2 (Name, Role, Value): each rail button is icon-only with its
  // accessible name supplied by aria-label on the <button>. Without
  // aria-hidden on the inner SVG, screen readers may announce the lucide
  // icon's computed name (e.g. "LayoutDashboard") *in addition to* the
  // button's aria-label, producing redundant noise like
  // "Dashboard, LayoutDashboard, button". Mirrors PRs #96 (SkillCard) and
  // #98 (PluginListView).
  it("each rail button's icon SVG is aria-hidden", () => {
    render(<SidebarRail />);
    for (const label of labels) {
      const btn = screen.getByRole("button", { name: label });
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
