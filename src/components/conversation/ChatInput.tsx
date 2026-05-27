import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { SessionMeta } from "../../lib/session-types";

interface ChatInputProps {
  session: SessionMeta;
  onMessageSent: () => void;
}

interface ChatOutputPayload {
  sessionId: string;
  text: string;
}

interface ChatDonePayload {
  sessionId: string;
}

export function ChatInput({ session, onMessageSent }: ChatInputProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const connectedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let cancelled = false;

    (async () => {
      const off1 = await listen<ChatOutputPayload>("chat:output", (e) => {
        if (e.payload.sessionId !== session.sessionId) return;
        setStreamBuffer((prev) => prev + e.payload.text + "\n");
      });
      const off2 = await listen<ChatDonePayload>("chat:done", (e) => {
        if (e.payload.sessionId !== session.sessionId) return;
        setStreamBuffer("");
        setIsSending(false);
        connectedRef.current = false;
        onMessageSent();
      });
      if (cancelled) {
        off1();
        off2();
      } else {
        unlistenOutput = off1;
        unlistenDone = off2;
      }
    })();

    return () => {
      cancelled = true;
      unlistenOutput?.();
      unlistenDone?.();
      if (connectedRef.current) {
        invoke("stop_chat_session", { sessionId: session.sessionId }).catch(
          () => {},
        );
        connectedRef.current = false;
      }
    };
  }, [session.sessionId, onMessageSent]);

  // Auto-grow textarea between 1-4 rows.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineHeight = 20;
    const maxHeight = lineHeight * 4 + 16;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  }, [draft]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || isSending) return;
    setError(null);
    setIsSending(true);
    setStreamBuffer("");
    try {
      if (!connectedRef.current) {
        await invoke("start_chat_session", {
          sessionId: session.sessionId,
          cwd: session.cwd || null,
          isAlive: session.isAlive,
        });
        connectedRef.current = true;
      }
      await invoke("send_chat_message", {
        sessionId: session.sessionId,
        message,
      });
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsSending(false);
    }
  }, [draft, isSending, session.sessionId, session.cwd, session.isAlive]);

  return (
    <div
      data-testid="chat-input"
      className="flex flex-col gap-2 border-t border-border bg-bg-secondary px-3 py-2"
    >
      {streamBuffer && (
        <div
          data-testid="chat-stream-buffer"
          className="max-h-32 overflow-auto rounded bg-bg-tertiary px-2 py-1 font-mono text-xs text-text-secondary whitespace-pre-wrap"
        >
          {streamBuffer}
        </div>
      )}
      {error && (
        <div role="alert" className="text-xs text-status-red">
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          data-testid="chat-input-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={
            isSending ? "Sending…" : "Type a message (Enter to send, Shift+Enter newline)"
          }
          rows={1}
          disabled={isSending}
          className="flex-1 resize-none rounded-md border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          aria-label="Chat message input"
        />
        <button
          type="button"
          data-testid="chat-send-button"
          onClick={() => void send()}
          disabled={isSending || draft.trim() === ""}
          aria-label="Send message"
          className="rounded-md bg-accent p-2 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <SendHorizonal size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
