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

async function actClick(testid: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testid));
    await Promise.resolve();
    await Promise.resolve();
  });
}

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

    expect(screen.getByTestId("form-error-name").textContent).toContain(
      "required",
    );
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "bad name!" },
    });
    expect(screen.getByTestId("form-error-name").textContent).toContain(
      "Alphanumeric",
    );

    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "taken" },
    });
    expect(screen.getByTestId("form-error-name").textContent).toContain(
      "unique",
    );

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

  // === a11y assertions (PRs #36, #72-#79) ===

  it("name input has an accessible name (aria-label)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByTestId("form-name").getAttribute("aria-label")).toBe(
      "Server name",
    );
  });

  it("command input has an accessible name (aria-label)", () => {
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

  it("url input has an accessible name (aria-label)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("form-type-http"));
    expect(screen.getByTestId("form-url").getAttribute("aria-label")).toBe(
      "URL",
    );
  });

  it("form-arg-input has an accessible name (aria-label)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const input = screen.getByTestId("form-arg-input");
    expect(input.getAttribute("aria-label")).toBe("Add command argument");
  });

  it("arg-tag remove button has an aria-label naming the arg being removed", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("form-arg-input"), {
      target: { value: "--port" },
    });
    fireEvent.keyDown(screen.getByTestId("form-arg-input"), { key: "Enter" });
    expect(
      screen.getByTestId("form-arg-remove-0").getAttribute("aria-label"),
    ).toBe("Remove --port");
  });

  it("KeyValueEditor remove button has an aria-label naming the key being removed", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("form-env-add"));
    expect(
      screen.getByTestId("form-env-remove-0").getAttribute("aria-label"),
    ).toBe("Remove row");
    fireEvent.change(screen.getByTestId("form-env-key-0"), {
      target: { value: "TOKEN" },
    });
    expect(
      screen.getByTestId("form-env-remove-0").getAttribute("aria-label"),
    ).toBe("Remove TOKEN");
  });

  it("KeyValueEditor key/value inputs have accessible names (aria-label)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    // env editor: row-indexed labels before any key is typed
    fireEvent.click(screen.getByTestId("form-env-add"));
    expect(
      screen.getByTestId("form-env-key-0").getAttribute("aria-label"),
    ).toBe("Environment variable 1 key");
    expect(
      screen.getByTestId("form-env-val-0").getAttribute("aria-label"),
    ).toBe("Environment variable 1 value");

    // once a key is typed, the value input is named after the key for SR context
    fireEvent.change(screen.getByTestId("form-env-key-0"), {
      target: { value: "TOKEN" },
    });
    expect(
      screen.getByTestId("form-env-val-0").getAttribute("aria-label"),
    ).toBe("Environment variable TOKEN value");

    // headers editor uses the "HTTP header" label
    fireEvent.click(screen.getByTestId("form-type-http"));
    fireEvent.click(screen.getByTestId("form-header-add"));
    expect(
      screen.getByTestId("form-header-key-0").getAttribute("aria-label"),
    ).toBe("HTTP header 1 key");
    expect(
      screen.getByTestId("form-header-val-0").getAttribute("aria-label"),
    ).toBe("HTTP header 1 value");
  });

  it("Save and Cancel buttons have a focus-visible ring", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    for (const id of ["form-save", "form-cancel"]) {
      const cls = screen.getByTestId(id).className;
      expect(cls).toContain("focus-visible:ring-2");
      expect(cls).toContain("focus-visible:ring-accent");
    }
  });

  it("Escape key closes the form without saving (a11y: dialog pattern)", () => {
    const onClose = vi.fn();
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={onClose}
        onSaved={() => {}}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
  });

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
    fireEvent.change(screen.getByTestId("form-name"), {
      target: { value: "ok" },
    });
    fireEvent.change(screen.getByTestId("form-command"), {
      target: { value: "npx" },
    });
    await actClick("form-save");
    const err = screen.getByTestId("form-error");
    expect(err.getAttribute("role")).toBe("alert");
  });

  // a11y: role="dialog" alone tells assistive tech the rest of the page is
  // still navigable. The backdrop here behaves modally (covers the page,
  // captures clicks, Esc closes), so it must declare aria-modal="true".
  // Also: the title <h2> already names the dialog visibly — point
  // aria-labelledby at it instead of duplicating the text via aria-label
  // (WCAG 2.5.3 Label in Name).
  it("backdrop is announced as modal and labelled by the visible heading", () => {
    render(
      <McpServerForm
        initial={null}
        existingNames={EMPTY_NAMES}
        cwd="/tmp"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const backdrop = screen.getByTestId("mcp-form-backdrop");
    expect(backdrop.getAttribute("role")).toBe("dialog");
    expect(backdrop.getAttribute("aria-modal")).toBe("true");
    const labelledBy = backdrop.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).not.toBeNull();
    expect(titleEl!.textContent).toBe("Add MCP Server");
    // Old aria-label removed — having both is redundant; aria-labelledby wins
    // anyway but keeping the duplicate would be a sign of stale code.
    expect(backdrop.getAttribute("aria-label")).toBeNull();
  });

  it("edit-mode dialog title flips to 'Edit MCP Server' and aria-labelledby tracks it", () => {
    render(
      <McpServerForm
        initial={{
          name: "x",
          scope: "user",
          type: "stdio",
          command: "npx",
          args: [],
          env: {},
        }}
        existingNames={EMPTY_NAMES}
        cwd="/tmp"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const backdrop = screen.getByTestId("mcp-form-backdrop");
    const titleEl = document.getElementById(backdrop.getAttribute("aria-labelledby")!);
    expect(titleEl!.textContent).toBe("Edit MCP Server");
  });
});
