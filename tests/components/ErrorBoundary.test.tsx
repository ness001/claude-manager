// Tests for the top-level ErrorBoundary fallback UI.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ErrorBoundary } from "../../src/components/ErrorBoundary";

function Boom({ message = "synthetic test error" }: { message?: string }) {
  throw new Error(message);
}

afterEach(() => cleanup());

describe("ErrorBoundary", () => {
  it("renders children unchanged when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("hello");
    expect(screen.queryByTestId("error-boundary-fallback")).toBeNull();
  });

  it("renders fallback UI when a child throws during render", () => {
    // React logs the caught error via console.error — silence it for this
    // test only, so the suite output stays clean.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Boom message="oh no" />
        </ErrorBoundary>,
      );
      const fallback = screen.getByTestId("error-boundary-fallback");
      expect(fallback).toHaveAttribute("role", "alert");
      expect(fallback).toHaveTextContent("Something went wrong");
      expect(fallback).toHaveTextContent("oh no");
      expect(screen.getByTestId("error-boundary-reload")).toBeInTheDocument();
      expect(screen.getByTestId("error-boundary-retry")).toBeInTheDocument();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("'Try again' clears the error so the boundary re-renders children", () => {
    // Defect: previously the only escape was Reload (full page reload),
    // which was a sledgehammer for transient render errors and meant
    // sidebar navigation was effectively trapped behind the fallback
    // (the boundary wraps the whole app). The retry button just resets
    // the boundary's `error` state so React tries the subtree again.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Strategy: render the boundary around a child controlled by a
      // *re-renderable* prop. First render the throwing version → fallback.
      // Click "Try again" → boundary state resets. Re-render the same tree
      // with a non-throwing child → no fallback. This isolates the boundary
      // mechanics from React's StrictMode double-invoke quirks.
      function Child({ throwIt }: { throwIt: boolean }) {
        if (throwIt) throw new Error("transient");
        return <div data-testid="recovered">recovered</div>;
      }
      const { rerender } = render(
        <ErrorBoundary>
          <Child throwIt />
        </ErrorBoundary>,
      );
      expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();

      // Reset the boundary by clicking Try again, then re-render the
      // tree with a non-throwing child to simulate the underlying
      // condition having cleared (e.g. a stale prop / network blip).
      // Both wrapped in a single act() so React flushes the state update
      // before we re-render with the new child.
      act(() => {
        fireEvent.click(screen.getByTestId("error-boundary-retry"));
        rerender(
          <ErrorBoundary>
            <Child throwIt={false} />
          </ErrorBoundary>,
        );
      });
      expect(screen.queryByTestId("error-boundary-fallback")).toBeNull();
      expect(screen.getByTestId("recovered")).toHaveTextContent("recovered");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("'Reload' button calls window.location.reload (escape hatch for non-recoverable errors)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // jsdom: window.location.reload is non-configurable; spy via a wrapper.
    const reloadSpy = vi.fn();
    const origLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...origLocation, reload: reloadSpy },
    });
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      fireEvent.click(screen.getByTestId("error-boundary-reload"));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: origLocation,
      });
      errSpy.mockRestore();
    }
  });

  // WCAG 1.4.11 Non-text Contrast (AA): the focus indicator must have ≥3:1
  // contrast against adjacent colors. The 'Try again' button uses bg-accent
  // as its background AND ring-accent for the focus ring — the ring is the
  // same color as its own background, so it's invisible to keyboard users
  // when focused. Adding a 2px ring-offset against the page background
  // (bg-bg-primary) creates a clean visual separation in both themes.
  // The Reload button is unaffected (it uses bg-bg-tertiary, so ring-accent
  // already has adequate contrast against it).
  it("'Try again' focus ring has an offset for contrast against bg-accent (WCAG 1.4.11)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      const retry = screen.getByTestId("error-boundary-retry");
      expect(retry.className).toContain("focus-visible:ring-offset-2");
      expect(retry.className).toContain("focus-visible:ring-offset-bg-primary");
    } finally {
      errSpy.mockRestore();
    }
  });
});
