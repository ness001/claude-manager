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
});
