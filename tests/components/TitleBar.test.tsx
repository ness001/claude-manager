import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { TitleBar } from "../../src/components/TitleBar";

afterEach(() => cleanup());

describe("TitleBar", () => {
  it("renders the three window control buttons by aria-label", async () => {
    render(<TitleBar />);
    // isMaximized resolves to false by the global mock; wait for the async
    // initial state to settle before asserting Maximize (vs. Restore).
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Maximize" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Minimize" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  // Defensive correctness: without `type="button"`, a <button> defaults to
  // type="submit". If the title bar is rendered inside a <form> (Settings,
  // MCP form, etc.) the controls would submit the form on click instead of
  // minimizing/maximizing/closing the window. Repo precedent: every other
  // <button> in the codebase declares type="button" explicitly.
  it("all three window control buttons declare type='button'", async () => {
    render(<TitleBar />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Maximize" }),
      ).toBeInTheDocument();
    });
    for (const name of ["Minimize", "Maximize", "Close"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "type",
        "button",
      );
    }
  });

  // WCAG 4.1.2 (Name, Role, Value): the buttons already have descriptive
  // aria-labels ("Minimize" / "Maximize" / "Close"). The lucide icon SVGs
  // are decorative — without aria-hidden, AT may double-announce the icon's
  // computed name on top of the button's label.
  it("each button's lucide icon is aria-hidden", async () => {
    render(<TitleBar />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Maximize" }),
      ).toBeInTheDocument();
    });
    for (const name of ["Minimize", "Maximize", "Close"]) {
      const btn = screen.getByRole("button", { name });
      const svg = btn.querySelector("svg");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  // WCAG 2.4.7 Focus Visible — keyboard users tabbing into the title bar
  // need a visible focus indicator on every window control. The Close
  // button is the highest-stakes control in the entire app — it tears
  // down the window with no confirmation — so a missed focus state on
  // it is particularly dangerous. Uses ring-inset because the title
  // bar is only 32-px tall; an outside ring would clip against the
  // parent flex container's edge. Mirrors PRs #17/#45/#48/#49/#56/#57
  // /#67/#111/#112/#113/#116.
  it("all three window controls have a focus-visible ring (WCAG 2.4.7)", async () => {
    render(<TitleBar />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Maximize" }),
      ).toBeInTheDocument();
    });
    for (const name of ["Minimize", "Maximize", "Close"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).toContain("focus-visible:ring-2");
      expect(cls).toContain("focus-visible:ring-accent");
      expect(cls).toContain("focus-visible:ring-inset");
    }
  });
});
