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
  it("command input has an accessible name (aria-label)", () => {
  it("name input has an accessible name (aria-label)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByTestId("form-command").getAttribute("aria-label")).toBe(
      "Command",
    );
  });

  it("Save and Cancel buttons have a focus-visible ring", () => {

  it("Escape key closes the form without saving (a11y: dialog pattern)", () => {
    const onClose = vi.fn();

  // WCAG 4.1.2 (Name, Role, Value): the per-row remove button in the
  // KeyValueEditor (used for env vars + http headers) was a bare "×" glyph
  // with no accessible name — screen readers announced "button" with no
  // hint of what would be removed. Now carries aria-label="Remove <KEY>"
  // (or "Remove row" when the key is still empty), and a stable testid so
  // tests can target it.
  it("KeyValueEditor remove button has an aria-label naming the key being removed", () => {

  // WCAG 4.1.2 (Name, Role, Value): the args input had only `placeholder=
  // "add arg + Enter"` for its accessible name, and placeholders don't
  // count. Mirrors the search-input fix in PRs #45 / #50 / #51 / #60: add
  // an explicit aria-label so screen readers announce a real name.
  it("form-arg-input has an accessible name (aria-label)", () => {

  // WCAG 4.1.2 (Name, Role, Value): each arg-tag's remove button was a
  // bare "×" glyph with no accessible name, mirroring the KeyValueEditor
  // remove-button defect. SR users heard "button" with no hint of which
  // arg they were about to delete. Now carries aria-label="Remove <ARG>"
  // and a stable testid (form-arg-remove-<i>).
  it("arg-tag remove button has an aria-label naming the arg being removed", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""

  // WCAG 4.1.3 (Status Messages): when saveMcpServer rejects (e.g. CLI
  // failure), the resulting submit-error <p> must carry role="alert" so
  // screen readers announce it without focus moving. Mirrors PR #44
  // (ConversationViewer corruption banner) and PR #62 (ConversationViewer
  // load-error banner).
  it("submit-error <p> has role='alert' so SR users hear save failures", async () => {
    saveMock.mockReset();
    saveMock.mockRejectedValue(new Error("CLI exited 1"));
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd="C:/proj"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    for (const id of ["form-save", "form-cancel"]) {
      const cls = screen.getByTestId(id).className;
      expect(cls).toContain("focus-visible:ring-2");
      expect(cls).toContain("focus-visible:ring-accent");
    }
        onClose={onClose}
        onSaved={() => {}}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "ok" },
    });
    fireEvent.change(screen.getByTestId("form-command"), {
      target: { value: "npx" },
    });
    await actClick("form-save");
    const err = screen.getByTestId("form-error");
    expect(err.getAttribute("role")).toBe("alert");
    fireEvent.click(screen.getByTestId("form-env-add"));
    // Empty key → generic label.
    expect(
      screen.getByTestId("form-env-remove-0").getAttribute("aria-label"),
    ).toBe("Remove row");
    fireEvent.change(screen.getByTestId("form-env-key-0"), {
      target: { value: "TOKEN" },
    });
    expect(
      screen.getByTestId("form-env-remove-0").getAttribute("aria-label"),
    ).toBe("Remove TOKEN");
    const input = screen.getByTestId("form-arg-input");
    expect(input.getAttribute("aria-label")).toBe("Add command argument");
    fireEvent.change(screen.getByTestId("form-arg-input"), {
      target: { value: "--port" },
    });
    fireEvent.keyDown(screen.getByTestId("form-arg-input"), { key: "Enter" });
    expect(
      screen.getByTestId("form-arg-remove-0").getAttribute("aria-label"),
    ).toBe("Remove --port");
  });
    expect(screen.getByTestId("form-name").getAttribute("aria-label")).toBe(
      "Server name",
    );
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
