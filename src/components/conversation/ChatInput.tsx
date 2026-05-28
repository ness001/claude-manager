import { useEffect, useRef, useState } from "react";
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
  exitCode?: number | null;
  stderr?: string;
}

export function ChatInput({ session, onMessageSent }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const connectedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionIdRef = useRef(session.sessionId);

  useEffect(() => {
    sessionIdRef.current = session.sessionId;
  }, [session.sessionId]);

  useEffect(() => {
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let cancelled = false;
    (async () => {
      const u1 = await listen<ChatOutputPayload>("chat:output", (e) => {
        if (e.payload.sessionId !== sessionIdRef.current) return;
        setStreamBuffer((b) => (b ? `${b}\n${e.payload.text}` : e.payload.text));
      });
      const u2 = await listen<ChatDonePayload>("chat:done", (e) => {
        if (e.payload.sessionId !== sessionIdRef.current) return;
        connectedRef.current = false;
        setIsSending(false);
        setStreamBuffer("");
        if (e.payload.exitCode != null && e.payload.exitCode !== 0) {
          setError(`claude exited with code ${e.payload.exitCode}`);
        } else if (e.payload.stderr) {
          setError(e.payload.stderr);
        } else {
          onMessageSent();
        }
      });
      if (cancelled) {
        u1();
        u2();
        return;
      }
      unlistenOutput = u1;
      unlistenDone = u2;
    })();
    return () => {
      cancelled = true;
      unlistenOutput?.();
      unlistenDone?.();
    };
  }, [onMessageSent]);

  useEffect(() => {
    const previousId = sessionIdRef.current;
    return () => {
      if (connectedRef.current) {
        invoke("stop_chat_session", { sessionId: previousId }).catch(() => {});
        connectedRef.current = false;
      }
    };
  }, [session.sessionId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 4 * 24;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [message]);

  const send = async () => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    setError(null);
    try {
      if (!connectedRef.current) {
        await invoke("start_chat_session", {
          sessionId: session.sessionId,
          cwd: session.cwd ?? null,
          isAlive: session.state === "alive",
        });
        connectedRef.current = true;
      }
      await invoke("send_chat_message", {
        sessionId: session.sessionId,
        message: trimmed,
      });
      setMessage("");
      setIsSending(true);
      setStreamBuffer("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      connectedRef.current = false;
      setIsSending(false);
    }
  };

  return (
    <div
      data-testid="chat-input"
      className="flex flex-col gap-1 border-t border-border bg-bg-secondary px-3 py-2"
    >
      {isSending && streamBuffer && (
        <div
          data-testid="chat-stream"
          className="max-h-32 overflow-auto rounded border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-secondary whitespace-pre-wrap"
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
          data-testid="chat-message-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={
            session.state === "alive"
              ? "Continue this live session…"
              : "Resume and send a message…"
          }
          disabled={isSending}
          className="flex-1 resize-none rounded-md border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          aria-label="Chat message"
        />
        <button
          type="button"
          data-testid="chat-send"
          onClick={() => void send()}
          disabled={isSending || message.trim() === ""}
          className="flex items-center justify-center rounded-md bg-accent px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Send message"
        >
          <SendHorizonal size={16} />
        </button>
      </div>
    </div>
  );
}
