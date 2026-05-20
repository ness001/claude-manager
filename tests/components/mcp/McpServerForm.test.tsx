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

  it("Enter on a text input submits the form (universal form UX)", async () => {
    // Repro: McpServerForm previously wrapped its fields in a <div>, so
    // pressing Enter inside the name/command/url inputs did nothing. Users
    // had to mouse over to the Save button to commit. Wrapping in <form>
    // + a submit button enables the browser's implicit-submission behavior.
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
    // Direct submit dispatch on the form mirrors what the browser does
    // when the user presses Enter inside any text input within an
    // implicit-submission form.
    await act(async () => {
      fireEvent.submit(screen.getByTestId("mcp-form"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("Enter on the args input adds an arg and does NOT submit", async () => {
    // Regression guard for the form-arg-input's preventDefault path:
    // adding an argument with Enter must NOT also trigger the implicit
    // form submission. The arg input's onKeyDown calls e.preventDefault()
    // which by browser default also cancels the implicit submit.
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
    const argInput = screen.getByTestId("form-arg-input");
    fireEvent.change(argInput, { target: { value: "--flag" } });
    await act(async () => {
      fireEvent.keyDown(argInput, { key: "Enter" });
      await Promise.resolve();
    });
    // The arg got added (arg pill rendered) and save was NOT called.
    expect(screen.getByText("--flag")).toBeTruthy();
    expect(saveMock).not.toHaveBeenCalled();
  });

  // === a11y assertions (PRs #36, #72-#79) ===

  it("Scope radios are wrapped in role=radiogroup with an accessible name (WAI-ARIA Radio Group)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    // Walk up from a known radio to find the radiogroup ancestor — pinning
    // by closest("[role=radiogroup]") survives layout reshuffles that pure
    // testid lookups would miss.
    const userRadio = screen.getByTestId("form-scope-user");
    const group = userRadio.closest('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(group!.getAttribute("aria-label")).toBe("Scope");
    // Both scope radios live inside this group (sanity).
    expect(group!.contains(screen.getByTestId("form-scope-local"))).toBe(true);
  });

  it("Type radios are wrapped in role=radiogroup with an accessible name (WAI-ARIA Radio Group)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const stdioRadio = screen.getByTestId("form-type-stdio");
    const group = stdioRadio.closest('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(group!.getAttribute("aria-label")).toBe("Type");
    // All three type radios live inside this group.
    expect(group!.contains(screen.getByTestId("form-type-sse"))).toBe(true);
    expect(group!.contains(screen.getByTestId("form-type-http"))).toBe(true);
  });

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

  // WCAG 1.4.11 Non-text Contrast (AA): the focus indicator must have ≥3:1
  // contrast against adjacent colors. The Save button uses bg-accent as its
  // background AND ring-accent for the focus ring — same color on same color
  // is invisible to keyboard users. Adding a 2-px ring-offset against the
  // page background (bg-bg-primary) creates clean visual separation in both
  // light (#ffffff) and dark (#0f0f1a) themes. Mirrors PR #117 (ErrorBoundary
  // 'Try again' button). The Cancel button uses border + bg-transparent so
  // its ring-accent already has adequate contrast — left untouched.
  it("Save focus ring has an offset for contrast against bg-accent (WCAG 1.4.11)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const cls = screen.getByTestId("form-save").className;
    expect(cls).toContain("focus-visible:ring-offset-2");
    expect(cls).toContain("focus-visible:ring-offset-bg-primary");
  });

  // WCAG 2.4.7 (Focus Visible): the inline arg-tag remove button, the env /
  // headers row remove buttons, and the env / headers "+ Add" buttons are
  // wired interactive controls (each mutates form state) but had no focus
  // ring at all — relying on the browser default which Tauri's WebView
  // renders inconsistently across platforms. The remove buttons are
  // particularly important to flag because they are destructive (drop a
  // row from the form). Mirrors PRs #117 / #118 / #119 / #125 / #126 / #128
  // / #129 / #132 / #133 / #134.
  it("inline form row buttons (arg-remove, env add/remove) expose a focus ring (WCAG 2.4.7)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    // Arg tag remove (after typing one tag).
    fireEvent.change(screen.getByTestId("form-arg-input"), {
      target: { value: "--port" },
    });
    fireEvent.keyDown(screen.getByTestId("form-arg-input"), { key: "Enter" });
    // Env add then env remove.
    fireEvent.click(screen.getByTestId("form-env-add"));

    for (const id of [
      "form-arg-remove-0",
      "form-env-add",
      "form-env-remove-0",
    ]) {
      const cls = screen.getByTestId(id).className;
      expect(cls, `missing focus ring on ${id}`).toContain(
        "focus-visible:outline-none",
      );
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

  // WCAG 2.4.7 Focus Visible — keyboard users tabbing through the form
  // need a visible focus indicator on every text input. Previously these
  // inputs carried no focus styling at all and relied on the browser
  // default outline (often suppressed by app-level CSS). Mirrors the
  // focus-ring trio fix landed in PR #138/#139 for search inputs.
  it("text inputs (stdio path) have a focus-visible ring (WCAG 2.4.7)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    // type defaults to stdio → form-name + form-command + form-arg-input visible
    for (const id of ["form-name", "form-command", "form-arg-input"]) {
      const el = screen.getByTestId(id);
      expect(el.className).toContain("focus-visible:outline-none");
      expect(el.className).toContain("focus-visible:ring-2");
      expect(el.className).toContain("focus-visible:ring-accent");
    }
  });

  it("URL input (http path) has a focus-visible ring (WCAG 2.4.7)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("form-type-http"));
    const url = screen.getByTestId("form-url");
    expect(url.className).toContain("focus-visible:outline-none");
    expect(url.className).toContain("focus-visible:ring-2");
    expect(url.className).toContain("focus-visible:ring-accent");
  });

  it("KeyValueEditor key/val inputs (env + headers) have a focus-visible ring (WCAG 2.4.7)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    // Add an env row (stdio default) so form-env-key-0/val-0 render.
    fireEvent.click(screen.getByTestId("form-env-add"));
    for (const id of ["form-env-key-0", "form-env-val-0"]) {
      const el = screen.getByTestId(id);
      expect(el.className).toContain("focus-visible:outline-none");
      expect(el.className).toContain("focus-visible:ring-2");
      expect(el.className).toContain("focus-visible:ring-accent");
    }
    // Switch to http, add a header row.
    fireEvent.click(screen.getByTestId("form-type-http"));
    fireEvent.click(screen.getByTestId("form-header-add"));
    for (const id of ["form-header-key-0", "form-header-val-0"]) {
      const el = screen.getByTestId(id);
      expect(el.className).toContain("focus-visible:outline-none");
      expect(el.className).toContain("focus-visible:ring-2");
      expect(el.className).toContain("focus-visible:ring-accent");
    }
  });

  // WAI-ARIA APG modal-dialog pattern: when a modal opens, focus must
  // move into it. Otherwise focus stays on the trigger button outside the
  // dialog (e.g. "Add Server"), and keyboard/SR users have to manually
  // click into the dialog before typing. Name is the first required
  // field — a sensible default.
  it("auto-focuses the Name input when the modal opens", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const nameInput = screen.getByTestId("form-name");
    expect(document.activeElement).toBe(nameInput);
  });

  // WCAG 2.4.3 Focus Order + WAI-ARIA APG modal-dialog pattern: closing the
  // modal must return focus to the element that opened it. Without this,
  // keyboard/SR users were dumped at <body> on close — they'd Tab from page
  // start to relocate the trigger. Mirrors the open-side fix already shipped
  // (auto-focus the Name input on mount).
  it("restores focus to the previously-focused element when the modal unmounts (WCAG 2.4.3)", () => {
    // Simulate the trigger button outside the dialog (e.g. "Add Server" in
    // McpPanel header). It must exist in the DOM and be focused at the time
    // McpServerForm mounts.
    const trigger = document.createElement("button");
    trigger.textContent = "Add Server";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    // Open-side: focus moved into the dialog.
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    // Close-side: focus returned to the trigger.
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  // WCAG 2.4.6 (Headings and Labels) — both Headers and Env KeyValueEditor
  // instances render a button with the bare visible text "+ Add". A screen
  // reader user navigating the form by buttons hears "+ Add, button" twice
  // with no indication of WHICH list they'd extend. Inject the parent
  // field's label into an aria-label so the two buttons are unique and
  // self-describing.
  it("KeyValueEditor add button aria-label includes the field name (WCAG 2.4.6)", () => {
    // Switch to HTTP type so both Headers + Env KeyValueEditors render.
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("form-type-http"));
    expect(
      screen.getByTestId("form-header-add").getAttribute("aria-label"),
    ).toBe("Add HTTP header entry");
    expect(
      screen.getByTestId("form-env-add").getAttribute("aria-label"),
    ).toBe("Add Environment variable entry");
  });

  // WCAG 1.3.1 / 4.1.2 — visible <label> text ("Name", "Command", "URL")
  // must be programmatically associated with its <input> via htmlFor/id.
  // Without this association, clicking the visible label text does NOT
  // focus the input (sighted-user click affordance lost) and accessibility
  // linters flag the orphan <label> as missing its required association.
  // The aria-label remains as the input's accessible name; this test
  // pins the htmlFor↔id wiring so future refactors can't quietly drop it.
  it("Name/Command/URL labels are associated with their inputs via htmlFor/id (WCAG 1.3.1)", () => {
    render(
      <McpServerForm
        existingNames={EMPTY_NAMES}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const checkAssociation = (testid: string, labelText: string) => {
      const input = screen.getByTestId(testid) as HTMLInputElement;
      const id = input.getAttribute("id");
      expect(id, `${testid} should have an id`).toBeTruthy();
      const label = document.querySelector(`label[for="${id}"]`);
      expect(
        label,
        `<label htmlFor="${id}"> should exist for ${testid}`,
      ).not.toBeNull();
      expect(label?.textContent).toBe(labelText);
    };

    checkAssociation("form-name", "Name");
    checkAssociation("form-command", "Command");

    fireEvent.click(screen.getByTestId("form-type-http"));
    checkAssociation("form-url", "URL");
  });

  // WCAG 3.3.1 (Error Identification) + 1.3.1 (Info and Relationships) — when
  // a Field has an error, the underlying input must expose aria-invalid="true"
  // and aria-describedby pointing at the rendered error message. Pre-fix, the
  // error <p> rendered as an inert sibling — SR users heard the field's
  // accessible name (from PRs #75/#77/#78/#79) but not that it was invalid,
  // and not the error text.
  it("errored fields expose aria-invalid + aria-describedby pointing at their error <p> (WCAG 3.3.1)", () => {
    render(
      <McpServerForm
        existingNames={{ user: ["taken"], local: [], project: [] }}
        cwd=""
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    // Name: starts empty → "required" error.
    const name = screen.getByTestId("form-name");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toBe("form-error-name");
    expect(document.getElementById("form-error-name")?.textContent).toMatch(
      /required/i,
    );

    // Command: starts empty in stdio mode → "required" error.
    const command = screen.getByTestId("form-command");
    expect(command.getAttribute("aria-invalid")).toBe("true");
    expect(command.getAttribute("aria-describedby")).toBe("form-error-command");
    expect(document.getElementById("form-error-command")).not.toBeNull();

    // Once the user fixes the name, aria-invalid + aria-describedby drop off.
    fireEvent.change(name, { target: { value: "ok-name" } });
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(name.getAttribute("aria-describedby")).toBeNull();

    // Switching to http mode surfaces a URL field that's also required.
    fireEvent.click(screen.getByTestId("form-type-http"));
    const url = screen.getByTestId("form-url");
    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect(url.getAttribute("aria-describedby")).toBe("form-error-url");
  });
});
