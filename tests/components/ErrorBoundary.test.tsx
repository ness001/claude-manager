// Tests for the top-level ErrorBoundary fallback UI.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
    } finally {
      errSpy.mockRestore();
    }
  });
});
