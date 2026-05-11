// Tests for QuickActions — T2.12.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { QuickActions } from "../../../src/components/dashboard/QuickActions";

afterEach(() => cleanup());

describe("QuickActions", () => {
  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<QuickActions />);
    } finally {
      console.error = orig;
    }
    expect(errs).toEqual([]);
  });

  it("renders 4 buttons present and disabled (handlers deferred to later phase)", () => {
    render(<QuickActions />);
    expect(screen.getByTestId("action-new-session")).toBeInTheDocument();
    expect(screen.getByTestId("action-resume-latest")).toBeInTheDocument();
    expect(screen.getByTestId("action-open-cwd")).toBeInTheDocument();
    expect(screen.getByTestId("action-rebuild-stats")).toBeInTheDocument();
    // All four buttons exist.
    const root = screen.getByTestId("quick-actions");
    const buttons = root.querySelectorAll("button");
    expect(buttons).toHaveLength(4);
    // Buttons are disabled until handler wiring lands.
    buttons.forEach((b) => expect(b).toBeDisabled());
  });

  it("New Session button uses the prominent accent variant", () => {
    render(<QuickActions />);
    const btn = screen.getByTestId("action-new-session");
    expect(btn.className).toContain("bg-accent");
  });

  // WCAG 4.1.2 (Name, Role, Value): each button already carries its label as
  // text content, so the leading lucide icon is decorative — without
  // aria-hidden, screen readers may announce the SVG's computed name (e.g.
  // "Plus") redundantly with the button text.
  it("decorative icons are hidden from assistive tech (aria-hidden)", () => {
    render(<QuickActions />);
    const ids = [
      "action-new-session",
      "action-resume-latest",
      "action-open-cwd",
      "action-rebuild-stats",
    ];
    for (const id of ids) {
      const btn = screen.getByTestId(id);
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("section label uses an <h3> heading (WCAG 1.3.1 / 2.4.6)", () => {
    // Defect: visual section label rendered as a <div>, so screen-reader
    // users couldn't navigate to it via the headings list. Mirrors PR #61
    // (SystemHealth) and PR #63 (ModelDonut).
    render(<QuickActions />);
    const heading = screen.getByRole("heading", { name: "Quick Actions", level: 3 });
    expect(heading.tagName).toBe("H3");
  });

  // WCAG 4.1.2 (Name, Role, Value): each button is rendered `disabled` with
  // a `title="Coming soon"` tooltip for sighted users, but the accessible
  // name was just the visible label ("New Session" etc.). A screen-reader
  // user navigating by buttons hears "New Session, button, dimmed" with no
  // hint that the dimmed state is intentional/temporary — they may assume
  // the app is broken. Mirror the visual tooltip into aria-label so SR and
  // sighted users get the same affordance.
  it("disabled buttons announce their (coming soon) status to assistive tech", () => {
    render(<QuickActions />);
    const cases: Array<[string, string]> = [
      ["action-new-session", "New Session (coming soon)"],
      ["action-resume-latest", "Resume Latest (coming soon)"],
      ["action-open-cwd", "Open CWD (coming soon)"],
      ["action-rebuild-stats", "Rebuild Stats (coming soon)"],
    ];
    for (const [id, label] of cases) {
      expect(screen.getByTestId(id).getAttribute("aria-label")).toBe(label);
    }
  });

  // WCAG 1.3.1 (Info and Relationships): the four action buttons form a
  // coherent group under the "Quick Actions" heading. Without a labelled
  // <ul>, screen-reader rotor users get no list count and no programmatic
  // tie between heading and buttons. Mirrors PRs #235 / #236 / #237 / #230.
  it("wraps action buttons in a <ul aria-labelledby> with one <li> per action", () => {
    render(<QuickActions />);
    const list = screen.getByTestId("quick-actions-list");
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("aria-labelledby")).toBe("quick-actions-heading");
    const heading = screen.getByRole("heading", { name: "Quick Actions", level: 3 });
    expect(heading.id).toBe("quick-actions-heading");
    const byRole = screen.getByRole("list", { name: "Quick Actions" });
    expect(byRole).toBe(list);
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    items.forEach((li) => {
      expect(li.querySelector("button")).not.toBeNull();
    });
  });

  // a11y: WCAG 1.3.1 + WAI-ARIA APG — promote the card root to a labelled
  // <section> bound to the visible <h3> via aria-labelledby so it appears
  // in the SR rotor's landmarks list. Mirrors PRs #262 (ModelDonut),
  // #263 (SystemHealth), and the broader region-landmark sweep.
  it("card root is a labelled <section> region bound to the visible <h3> heading", () => {
    render(<QuickActions />);
    const root = screen.getByTestId("quick-actions");
    expect(root.tagName).toBe("SECTION");
    expect(root.getAttribute("aria-labelledby")).toBe("quick-actions-heading");
    const heading = document.getElementById("quick-actions-heading");
    expect(heading).not.toBeNull();
    expect(heading!.tagName).toBe("H3");
    expect(heading!.textContent).toBe("Quick Actions");
  });
});
