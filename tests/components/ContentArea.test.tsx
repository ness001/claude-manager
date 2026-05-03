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

  const cases: Array<{ section: Section; heading: string }> = [
    { section: "dashboard", heading: "Dashboard" },
    { section: "sessions", heading: "Sessions" },
    { section: "plugins", heading: "Plugins" },
    { section: "skills", heading: "Skills" },
    { section: "mcp", heading: "MCP Servers" },
    { section: "settings", heading: "Settings" },
  ];

  it.each(cases)(
    "renders the $heading heading when activeSection is $section",
    ({ section, heading }) => {
      useNavigationStore.getState().navigateTo(section);
      render(<ContentArea />);
      expect(
        screen.getByRole("heading", { level: 1, name: heading }),
      ).toBeInTheDocument();
    },
  );

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
});
