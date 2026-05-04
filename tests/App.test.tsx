import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import App from "../src/App";
import { useNavigationStore } from "../src/stores/navigation-store";
import { useThemeStore } from "../src/stores/theme-store";

describe("App", () => {
  beforeEach(() => {
    useNavigationStore.setState({ activeSection: "dashboard" });
    useThemeStore.setState({ mode: "dark", resolved: "dark" });
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
  });

  it("renders the SidebarRail and ContentArea (default Dashboard)", () => {
    render(<App />);
    // DashboardSection (T2.13) testid proves ContentArea mounted with default section.
    expect(screen.getByTestId("dashboard-section")).toBeInTheDocument();
    // Sidebar nav item proves SidebarRail mounted.
    expect(
      screen.getByRole("button", { name: /dashboard/i }),
    ).toBeInTheDocument();
  });

  it("toggles the `dark` class on documentElement when resolved theme changes", () => {
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      useThemeStore.setState({ mode: "light", resolved: "light" });
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => {
      useThemeStore.setState({ mode: "dark", resolved: "dark" });
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("navigates to a section when Ctrl+<digit> is pressed", () => {
    render(<App />);
    expect(useNavigationStore.getState().activeSection).toBe("dashboard");

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "2", ctrlKey: true }),
      );
    });
    expect(useNavigationStore.getState().activeSection).toBe("sessions");

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: ",", ctrlKey: true }),
      );
    });
    expect(useNavigationStore.getState().activeSection).toBe("settings");
  });

  it("ignores Ctrl shortcuts when focus is in an input element", () => {
    render(<App />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "2",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    expect(useNavigationStore.getState().activeSection).toBe("dashboard");

    document.body.removeChild(input);
  });
});
