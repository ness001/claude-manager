import { describe, it, expect, beforeEach } from "vitest";
import {
  useNavigationStore,
  type Section,
} from "../../src/stores/navigation-store";

describe("navigation-store", () => {
  beforeEach(() => {
    // Reset store to defaults between tests.
    useNavigationStore.setState({ activeSection: "dashboard" });
  });

  it("defaults to dashboard", () => {
    const state = useNavigationStore.getState();
    expect(state.activeSection).toBe("dashboard");
  });

  const sections: Section[] = [
    "dashboard",
    "sessions",
    "plugins",
    "skills",
    "mcp",
    "settings",
  ];

  it.each(sections)("navigateTo('%s') sets activeSection", (section) => {
    useNavigationStore.getState().navigateTo(section);
    expect(useNavigationStore.getState().activeSection).toBe(section);
  });
});
