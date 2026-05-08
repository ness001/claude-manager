// Tests for McpServerForm — type swap, validation, ${ENV_VAR} pass-through,
// save calls saveMcpServer, cancel does not write.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from "@testing-library/react";

const saveMock = vi.fn();
vi.mock("../../../src/lib/mcp-loader", async () => {
  const actual =
    await vi.importActual<typeof import("../../../src/lib/mcp-loader")>(
      "../../../src/lib/mcp-loader",
    );
  return { ...actual, saveMcpServer: (...a: unknown[]) => saveMock(...a) };
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn() }));

import { McpServerForm } from "../../../src/components/mcp/McpServerForm";
import type { McpScope } from "../../../src/lib/mcp-types";

const EMPTY_NAMES: Record<McpScope, string[]> = {
  user: [],
  local: [],
  project: [],
};

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("McpServerForm", () => {
  it("type radio swaps fields between stdio and http", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByTestId("form-command")).toBeInTheDocument();
    expect(screen.queryByTestId("form-url")).toBeNull();

    fireEvent.click(screen.getByTestId("form-type-http"));
    expect(screen.queryByTestId("form-command")).toBeNull();
    expect(screen.getByTestId("form-url")).toBeInTheDocument();
  });

  it("name validation: required, alphanumeric+hyphens, unique within scope", () => {
    render(
      <McpServerForm
        existingNames={{ user: ["taken"], local: [], project: [] }}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const save = screen.getByTestId("form-save") as HTMLButtonElement;

    // Empty → required
    expect(screen.getByTestId("form-error-name").textContent).toContain(
      "required",
    );
    expect(save.disabled).toBe(true);

    // Invalid chars
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "bad name!" },
    });
    expect(screen.getByTestId("form-error-name").textContent).toContain(
      "Alphanumeric",
    );

    // Taken
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "taken" },
    });
    expect(screen.getByTestId("form-error-name").textContent).toContain(
      "unique",
    );

    // Valid
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "ok-name" },
    });
    fireEvent.change(screen.getByTestId("form-command"), {
      target: { value: "x" },
    });
    expect(screen.queryByTestId("form-error-name")).toBeNull();
    expect((screen.getByTestId("form-save") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("URL validation for sse/http", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("form-type-http"));
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "ok" },
    });

    fireEvent.change(screen.getByTestId("form-url"), {
      target: { value: "not a url" },
    });
    expect(screen.getByTestId("form-error-url").textContent).toContain(
      "valid URL",
    );

    fireEvent.change(screen.getByTestId("form-url"), {
      target: { value: "https://x.test/mcp" },
    });
    expect(screen.queryByTestId("form-error-url")).toBeNull();
  });

  it("${ENV_VAR} placeholder in headers is accepted (no validation rejection)", async () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("form-type-http"));
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "ok" },
    });
    fireEvent.change(screen.getByTestId("form-url"), {
      target: { value: "https://x.test" },
    });
    fireEvent.click(screen.getByTestId("form-header-add"));
    fireEvent.change(screen.getByTestId("form-header-key-0"), {
      target: { value: "Authorization" },
    });
    fireEvent.change(screen.getByTestId("form-header-val-0"), {
      target: { value: "Bearer ${TOKEN}" },
    });

    await actClick("form-save");
    expect(saveMock).toHaveBeenCalledTimes(1);
    const arg = saveMock.mock.calls[0][0];
    expect(arg.headers).toEqual({ Authorization: "Bearer ${TOKEN}" });
  });

  it("Save calls saveMcpServer; Cancel closes without writing", async () => {
    const onClose = vi.fn();
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd="C:/proj"
        onClose={onClose}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "ok" },
    });
    fireEvent.change(screen.getByTestId("form-command"), {
      target: { value: "npx" },
    });

    fireEvent.click(screen.getByTestId("form-cancel"));
    expect(saveMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    // Re-render and save.
    saveMock.mockReset();
    saveMock.mockResolvedValue(undefined);
    cleanup();
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd="C:/proj"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "ok" },
    });
    fireEvent.change(screen.getByTestId("form-command"), {
      target: { value: "npx" },
    });
    await actClick("form-save");
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][1]).toEqual({ cwd: "C:/proj" });
  });
});

async function actClick(testid: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testid));
    // Allow the awaited save promise inside handleSubmit to resolve.
    await Promise.resolve();
    await Promise.resolve();
  });
}
