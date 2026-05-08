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
});
