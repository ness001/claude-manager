// Tests for McpServerDetail — stdio shows command + args, sse/http shows
// URL + headers, env values are masked with reveal toggle.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn() }));

import { McpServerDetail } from "../../../src/components/mcp/McpServerDetail";
import {
  FIX_CONNECTED,
  FIX_HTTP,
  FIX_SSE,
} from "../../fixtures/mcp-ui/servers";

afterEach(() => cleanup());

describe("McpServerDetail", () => {
  it("stdio shows command + args", () => {
    render(<McpServerDetail server={FIX_CONNECTED} />);
    expect(screen.getByTestId("detail-command").textContent).toBe(
      FIX_CONNECTED.command,
    );
    expect(screen.getByTestId("detail-args").textContent).toBe(
      FIX_CONNECTED.args!.join(" "),
    );
  });

  it("sse and http show URL", () => {
    const { unmount } = render(<McpServerDetail server={FIX_HTTP} />);
    expect(screen.getByTestId("detail-url").textContent).toBe(FIX_HTTP.url);
    unmount();
    render(<McpServerDetail server={FIX_SSE} />);
    expect(screen.getByTestId("detail-url").textContent).toBe(FIX_SSE.url);
  });

  it("headers preserved verbatim, including ${ENV_VAR} placeholders", () => {
    render(<McpServerDetail server={FIX_HTTP} />);
    const value = screen.getByTestId("header-value-Authorization");
    expect(value.textContent).toBe("Bearer ${API_TOKEN}");
  });

  it("env values masked with reveal toggle", () => {
    render(<McpServerDetail server={FIX_CONNECTED} />);
    const valueEl = screen.getByTestId("env-value-TOKEN");
    expect(valueEl.textContent).toBe("•".repeat(8));
    fireEvent.click(screen.getByTestId("env-value-TOKEN-toggle"));
    expect(valueEl.textContent).toBe("secret-value");
    fireEvent.click(screen.getByTestId("env-value-TOKEN-toggle"));
    expect(valueEl.textContent).toBe("•".repeat(8));
  });

  // WCAG 4.1.2 (Name, Role, Value): when env vars list multiple secrets,
  // a generic "Reveal value" / "Hide value" label gives SR users no way
  // to tell the toggles apart. Now the toggle is named after its env-var
  // key — "Reveal TOKEN", "Hide TOKEN" — flipping with state.
  it("env reveal toggle aria-label includes the env-var name + flips on toggle", () => {
    render(<McpServerDetail server={FIX_CONNECTED} />);
    const toggle = screen.getByTestId("env-value-TOKEN-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Reveal TOKEN");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-label")).toBe("Hide TOKEN");
  });

  // WCAG 4.1.2 (Name, Role, Value): a stateful toggle button must expose
  // its pressed state, otherwise SR users cannot tell whether the secret
  // is currently revealed or hidden — particularly important for a
  // secret-masking control.
  it("env reveal toggle exposes aria-pressed and flips with state", () => {
    render(<McpServerDetail server={FIX_CONNECTED} />);
    const toggle = screen.getByTestId("env-value-TOKEN-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  // The Eye / EyeOff icons are decorative — the button already has a
  // descriptive aria-label ("Reveal TOKEN" / "Hide TOKEN"). aria-hidden
  // on the SVG prevents AT from double-announcing the icon's accessible
  // name (if the lucide build leaks one) on top of the button's label.
  it("env reveal toggle icon is aria-hidden in both states", () => {
    render(<McpServerDetail server={FIX_CONNECTED} />);
    const toggle = screen.getByTestId("env-value-TOKEN-toggle");
    expect(toggle.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  // WCAG 2.4.7 (Focus Visible): the env-value reveal/hide toggle had no
  // focus ring — relying on the browser default, which Tauri's WebView
  // renders inconsistently across platforms. A keyboard user could land on
  // a button that toggles secret visibility without seeing it. Mirrors
  // PRs #117 / #118 / #119 / #125 / #126 / #128 / #129.
  it("env reveal toggle exposes a visible focus ring (WCAG 2.4.7)", () => {
    render(<McpServerDetail server={FIX_CONNECTED} />);
    const toggle = screen.getByTestId("env-value-TOKEN-toggle");
    expect(toggle.className).toContain("focus-visible:outline-none");
    expect(toggle.className).toContain("focus-visible:ring-2");
    expect(toggle.className).toContain("focus-visible:ring-accent");
  });
});
