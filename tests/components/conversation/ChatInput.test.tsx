// Tests for ChatInput — Bug 7 (chat stuck on "sending" when claude exits
// non-zero or writes to stderr). The fix wires exitCode + stderr into the
// chat:done payload and surfaces an inline error instead of silently
// re-enabling the send button.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const listenMock = vi.fn();
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { ChatInput } from "../../../src/components/conversation/ChatInput";
import type { SessionMeta } from "../../../src/lib/session-types";

function makeSession(): SessionMeta {
  return {
    sessionId: "sess-1",
    cwd: "/tmp",
    firstPrompt: "",
    messageCount: 0,
    startedAt: 0,
    durationMs: 0,
    entrypoint: "interactive",
    kind: "interactive",
    isSidechain: false,
    toolsUsed: [],
    isAlive: true,
    tags: [],
    isPinned: false,
    sortOrder: 0,
    state: "alive",
  };
}

/** Wire `listen()` so each event-name registration captures its callback in
 *  the returned map, letting the test fire payloads at will. */
function wireListenCapture(): Map<string, (e: { payload: unknown }) => void> {
  const handlers = new Map<string, (e: { payload: unknown }) => void>();
  listenMock.mockImplementation(async (event: string, cb: (e: { payload: unknown }) => void) => {
    handlers.set(event, cb);
    return () => handlers.delete(event);
  });
  return handlers;
}

beforeEach(() => {
  listenMock.mockReset();
  invokeMock.mockReset();
});
afterEach(() => cleanup());

describe("ChatInput — Bug 7 chat:done error handling", () => {
  it("surfaces an error and clears isSending when chat:done has non-zero exitCode", async () => {
    const handlers = wireListenCapture();
    const onMessageSent = vi.fn();
    render(<ChatInput session={makeSession()} onMessageSent={onMessageSent} />);
    // Wait one microtask for the async listen() registrations to resolve.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(handlers.has("chat:done")).toBe(true);

    await act(async () => {
      handlers.get("chat:done")!({
        payload: { sessionId: "sess-1", exitCode: 1, stderr: "" },
      });
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("claude exited with code 1");
    expect(onMessageSent).not.toHaveBeenCalled();
    // Textarea must be re-enabled (isSending=false) so the user can retry.
    const textarea = screen.getByTestId("chat-message-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });

  it("surfaces stderr text verbatim when claude wrote to stderr", async () => {
    const handlers = wireListenCapture();
    render(<ChatInput session={makeSession()} onMessageSent={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      handlers.get("chat:done")!({
        payload: { sessionId: "sess-1", exitCode: 0, stderr: "boom: bad cwd\n" },
      });
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("boom: bad cwd");
  });

  it("calls onMessageSent on clean exit (exitCode 0, empty stderr)", async () => {
    const handlers = wireListenCapture();
    const onMessageSent = vi.fn();
    render(<ChatInput session={makeSession()} onMessageSent={onMessageSent} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      handlers.get("chat:done")!({
        payload: { sessionId: "sess-1", exitCode: 0, stderr: "" },
      });
    });
    expect(onMessageSent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores chat:done events for a different sessionId", async () => {
    const handlers = wireListenCapture();
    const onMessageSent = vi.fn();
    render(<ChatInput session={makeSession()} onMessageSent={onMessageSent} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      handlers.get("chat:done")!({
        payload: { sessionId: "other-sess", exitCode: 1, stderr: "ignored" },
      });
    });
    expect(onMessageSent).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
