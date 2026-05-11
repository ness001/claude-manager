// Tests for SettingsSection — Phase-1 placeholder. Covers the landmark/
// heading binding only; full settings UI is a later-phase task.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SettingsSection } from "../../src/sections/SettingsSection";

afterEach(() => cleanup());

describe("SettingsSection", () => {
  it("renders the Settings heading", () => {
    render(<SettingsSection />);
    expect(
      screen.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeInTheDocument();
  });

  // WCAG 1.3.1 (Info and Relationships) + 2.4.6 (Headings and Labels):
  // <section> contributes a region landmark to the AT tree only when it
  // carries an accessible name. Without aria-labelledby, SR users
  // navigating by regions saw an unnamed region nested in <main>.
  // Mirrors the same fix on DashboardSection/SessionsSection.
  it("section landmark is bound to the visible <h1> via aria-labelledby", () => {
    render(<SettingsSection />);
    const section = screen.getByTestId("settings-section");
    expect(section.tagName).toBe("SECTION");
    const labelledby = section.getAttribute("aria-labelledby");
    expect(labelledby).toBe("settings-heading");
    const heading = document.getElementById(labelledby!);
    expect(heading?.tagName).toBe("H1");
    expect(heading?.textContent).toBe("Settings");
  });
});
