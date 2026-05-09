// Tests for ConversationViewer — T2.11.
//
// Mocks at the module boundary:
//   - `@tauri-apps/api/core` → `invoke("read_jsonl_file", ...)` returns
//     fixture lines
//   - `@tanstack/react-virtual` → returns a flat list of virtual items so we
//     can assert on the rendered output without needing a real scroll
//     container (jsdom does not implement layout).
//
// We never mock the unit under test (ConversationViewer itself) or the
// frontend JSONL parser — entries flow through the real parser so the test
// confirms end-to-end shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// `useVirtualizer` returns DOM-measurement-driven virtual items. Under jsdom
// every element has zero size, so the real virtualizer renders nothing. Stub
// it to render every row — sufficient for assertion-level testing while
// preserving the public API surface (the production code still calls into
// the real library). We never stub `ConversationViewer` itself.
vi.mock("@tanstack/react-virtual", () => {
  return {
    useVirtualizer: ({ count }: { count: number }) => ({
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          start: i * 100,
          size: 100,
          key: i,
        })),
      getTotalSize: () => count * 100,
      scrollToIndex: vi.fn(),
      measureElement: () => undefined,
    }),
  };
});

import { ConversationViewer } from "../../../src/components/conversation/ConversationViewer";

const FIXTURES = join(__dirname, "..", "..", "fixtures", "conversation-viewer");

function readFixture(name: string): string[] {
  const text = readFileSync(join(FIXTURES, name), "utf8");
  return text.split("\n");
}

beforeEach(() => {
  invokeMock.mockReset();
});
afterEach(() => cleanup());

describe("ConversationViewer", () => {
  it("mounts without console errors", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<ConversationViewer path="/fake.jsonl" />);
      await waitFor(() =>
        expect(screen.getByTestId("conversation-viewer")).toBeInTheDocument(),
      );
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("shows the loading state before the IPC resolves", async () => {
    let resolve: (v: string[]) => void = () => {};
    invokeMock.mockReturnValue(new Promise<string[]>((r) => (resolve = r)));
    render(<ConversationViewer path="/fake.jsonl" />);
    expect(screen.getByTestId("conversation-viewer-loading")).toBeInTheDocument();
    // Resolve + flush so React doesn't log an act() warning after the test.
    await act(async () => {
      resolve([]);
      await Promise.resolve();
    });
  });

  it("renders user, assistant, tool-call (with paired result), system divider, and summary", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => {
      expect(screen.getByTestId("conversation-viewer")).toBeInTheDocument();
    });

    expect(screen.getAllByTestId("user-message").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("assistant-message").length).toBeGreaterThan(
      0,
    );

    // Two tool-use lines + two tool_result lines → after pairing, 2 blocks.
    const toolBlocks = screen.getAllByTestId("tool-call-block");
    expect(toolBlocks).toHaveLength(2);
    // The Read tool result was an error → second block has the error marker.
    const errorBlocks = toolBlocks.filter(
      (b) => (b as HTMLElement).dataset.error === "true",
    );
    expect(errorBlocks).toHaveLength(1);

    // System dividers: one turn_duration, one compact_boundary.
    const dividers = screen.getAllByTestId("system-divider");
    const variants = dividers.map((d) => (d as HTMLElement).dataset.variant);
    expect(variants).toContain("turn");
    expect(variants).toContain("compact");

    // Summary banner.
    expect(screen.getByTestId("summary-banner")).toBeInTheDocument();
  });

  it("skips SKIP_TYPES lines entirely (zero rendered nodes)", async () => {
    invokeMock.mockResolvedValue(readFixture("skip-only.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("conversation-viewer")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("user-message")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-message")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tool-call-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("system-divider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("summary-banner")).not.toBeInTheDocument();
    // SKIP_TYPES are NOT corruption — no warning banner.
    expect(screen.queryByTestId("corruption-warning")).not.toBeInTheDocument();
  });

  it("counts corrupted lines and surfaces the warning banner (spec §17.5)", async () => {
    invokeMock.mockResolvedValue(readFixture("with-corruption.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("corruption-warning")).toBeInTheDocument(),
    );
    const banner = screen.getByTestId("corruption-warning");
    // Two corrupted lines in the fixture (mid-JSON cut + plain text line).
    expect(banner.textContent).toMatch(/2 lines/);
    // a11y: banner must be exposed as an alert so screen readers announce it
    // (yellow color alone fails WCAG 1.4.1 / 4.1.2). The ⚠ glyph is
    // decorative — its meaning is in the text, so it's wrapped in aria-hidden.
    expect(banner.getAttribute("role")).toBe("alert");
  });

  it("shows turn navigation when the session has turns", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-nav"));
    const nav = screen.getByTestId("turn-nav");
    expect(nav).toHaveTextContent(/\/ \d+/);
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    expect(input.value).toBe("1");
  });

  it("Ctrl+ArrowDown advances the current turn (spec §5.7)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    expect(input.value).toBe("1");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", ctrlKey: true }),
      );
    });
    await waitFor(() => expect(input.value).toBe("2"));
  });

  it("Ctrl+ArrowDown is ignored while focus is in a text input (no hijack)", async () => {
    invokeMock.mockResolvedValue(readFixture("renderable.jsonl"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() => screen.getByTestId("turn-input"));
    const input = screen.getByTestId("turn-input") as HTMLInputElement;
    expect(input.value).toBe("1");
    input.focus();
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    // Turn must NOT have advanced — the handler bailed because focus was in INPUT.
    expect(input.value).toBe("1");
  });

  it("renders an error state when the IPC rejects", async () => {
    invokeMock.mockRejectedValue(new Error("ENOENT"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("conversation-viewer-error")).toBeInTheDocument(),
    );
  });

  it("error banner has role='alert' so SR users hear it (WCAG 4.1.3)", async () => {
    // Defect: when the JSONL load fails, the message renders without
    // role="alert", so screen-reader users get no announcement. Mirrors
    // PR #44 (corruption-warning banner).
    invokeMock.mockRejectedValue(new Error("ENOENT"));
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("conversation-viewer-error")).toHaveAttribute(
        "role",
        "alert",
      ),
    );
  });

  // Spec §17.8 perf budget: parse the first 50 entries quickly so the first
  // paint can land < 500ms. We measure the time from `render()` to the point
  // where `conversation-viewer` is in the DOM (which only happens after the
  // sync batch is parsed and `loading` is flipped). Generous threshold
  // accounts for jsdom + cold module load.
  it("first paint of first 50 messages from a 5000-line file is fast", async () => {
    const oneLine = JSON.stringify({
      type: "user",
      message: { role: "user", content: "x" },
      uuid: "u",
      timestamp: "2026-05-04T09:00:00.000Z",
    });
    const lines = Array.from({ length: 5000 }, () => oneLine);
    invokeMock.mockResolvedValue(lines);

    const t0 = performance.now();
    render(<ConversationViewer path="/fake.jsonl" />);
    await waitFor(() =>
      expect(screen.getByTestId("conversation-viewer")).toBeInTheDocument(),
    );
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2000);
  });
});
