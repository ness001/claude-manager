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

  // WAI-ARIA `aria-keyshortcuts`: the shortcut info is currently only on the
  // visible `title` tooltip, which is sighted-hover-only. SR users (NVDA /
  // JAWS / VoiceOver) need the shortcut announced on focus through the
  // dedicated `aria-keyshortcuts` attribute, not by polluting the
  // accessible name.
  it("each nav button exposes its shortcut via aria-keyshortcuts", () => {
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
      ).toHaveAttribute("aria-keyshortcuts", shortcut);
    }
  });

  it("buttons have a focus-visible ring class for keyboard navigation", () => {
    render(<SidebarRail />);
    const btn = screen.getByRole("button", { name: "Dashboard" });
    expect(btn.className).toContain("focus-visible:ring-2");
  });

  it("ArrowDown moves focus to the next rail item, wrapping at the end", () => {
    render(<SidebarRail />);
    const dash = screen.getByRole("button", { name: "Dashboard" });
    const sessions = screen.getByRole("button", { name: "Sessions" });
    const settings = screen.getByRole("button", { name: "Settings" });
    dash.focus();
    fireEvent.keyDown(dash, { key: "ArrowDown" });
    expect(document.activeElement).toBe(sessions);

    settings.focus();
    fireEvent.keyDown(settings, { key: "ArrowDown" });
    expect(document.activeElement).toBe(dash);
  });

  it("ArrowUp moves focus to the previous rail item, wrapping at the start", () => {
    render(<SidebarRail />);
    const dash = screen.getByRole("button", { name: "Dashboard" });
    const sessions = screen.getByRole("button", { name: "Sessions" });
    const settings = screen.getByRole("button", { name: "Settings" });
    sessions.focus();
    fireEvent.keyDown(sessions, { key: "ArrowUp" });
    expect(document.activeElement).toBe(dash);

    dash.focus();
    fireEvent.keyDown(dash, { key: "ArrowUp" });
    expect(document.activeElement).toBe(settings);
  });

  it("Home jumps to the first item, End jumps to the last", () => {
    render(<SidebarRail />);
    const dash = screen.getByRole("button", { name: "Dashboard" });
    const plugins = screen.getByRole("button", { name: "Plugins" });
    const settings = screen.getByRole("button", { name: "Settings" });
    plugins.focus();
    fireEvent.keyDown(plugins, { key: "End" });
    expect(document.activeElement).toBe(settings);

    fireEvent.keyDown(settings, { key: "Home" });
    expect(document.activeElement).toBe(dash);
  });

  it("non-navigation keys are ignored (no preventDefault, focus unchanged)", () => {
    render(<SidebarRail />);
    const dash = screen.getByRole("button", { name: "Dashboard" });
    dash.focus();
    fireEvent.keyDown(dash, { key: "a" });
    expect(document.activeElement).toBe(dash);
  });

  // WAI-ARIA roving tabindex pattern — only the active rail item should be
  // in the Tab sequence. Without this, native <button> defaults give every
  // item tabIndex=0, so Tab walks all 6 items one at a time, defeating the
  // purpose of the arrow-key roving above.
  it("only the active rail item has tabIndex=0; the rest are tabIndex=-1", () => {
    render(<SidebarRail />);
    const dash = screen.getByRole("button", { name: "Dashboard" });
    expect(dash.tabIndex).toBe(0);
    for (const label of labels.filter((l) => l !== "Dashboard")) {
      const btn = screen.getByRole("button", { name: label });
      expect(btn.tabIndex).toBe(-1);
    }
  });

  it("changing the active section moves tabIndex=0 to the new active item", () => {
    useNavigationStore.setState({ activeSection: "skills" });
    render(<SidebarRail />);
    expect(
      screen.getByRole("button", { name: "Skills" }).tabIndex,
    ).toBe(0);
    for (const label of labels.filter((l) => l !== "Skills")) {
      expect(
        screen.getByRole("button", { name: label }).tabIndex,
      ).toBe(-1);
    }
  });

  // WCAG 4.1.2 (Name, Role, Value): each rail button already exposes its
  // section name via aria-label. The lucide-react SVG inside is purely
  // decorative — without aria-hidden it can contribute its own computed
  // name (e.g. "Settings") and a screen reader may announce the label
  // twice. Mirrors the icon-hidden pattern used in QuickActions.
  it("decorative rail icons are hidden from assistive tech (aria-hidden)", () => {
    render(<SidebarRail />);
    for (const label of labels) {
      const btn = screen.getByRole("button", { name: label });
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  // WAI-ARIA APG navigation pattern + WCAG 1.3.1 (Info and Relationships):
  // a <nav> rail of N items should expose its links/buttons as a list so
  // SR rotor users hear "navigation, Primary, list, 6 items" rather than
  // "navigation, Primary" with the item count lost. Mirrors PRs #235/#236/
  // #237/#238/#239/#240 (collection containers).
  it("rail items are wrapped in a <ul>/<li> inside the <nav> (WCAG 1.3.1)", () => {
    render(<SidebarRail />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const list = nav.querySelector("ul");
    expect(list).not.toBeNull();
    const items = list!.querySelectorAll(":scope > li");
    expect(items).toHaveLength(6);
    items.forEach((li) => {
      expect(li.querySelector("button")).not.toBeNull();
    });
  });
});
