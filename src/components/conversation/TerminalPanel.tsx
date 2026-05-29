import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

import type { SessionMeta } from "../../lib/session-types";

interface TerminalPanelProps {
  session: SessionMeta;
}

interface PtyOutputPayload {
  sessionId: string;
  data: string;
}

interface PtyExitPayload {
  sessionId: string;
}

function getTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue("--color-bg-primary").trim() || "#1a1a2e",
    foreground: style.getPropertyValue("--color-text-primary").trim() || "#cdd6f4",
    cursor: "#cdd6f4",
  };
}

export function TerminalPanel({ session }: TerminalPanelProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef(session.sessionId);

  useEffect(() => {
    sessionIdRef.current = session.sessionId;
  }, [session.sessionId]);

  useEffect(() => {
    const container = termRef.current;
    if (!container) return;

    const terminal = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: "monospace",
      fontSize: 14,
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const sid = session.sessionId;

    invoke("start_pty_session", {
      sessionId: sid,
      cwd: session.cwd ?? null,
      isAlive: session.state === "alive",
    }).catch((e) => {
      terminal.writeln(`\r\n[Error starting session: ${e}]`);
    });

    terminal.onData((data) => {
      invoke("write_pty_session", { sessionId: sessionIdRef.current, data }).catch(() => {});
    });

    let unlistenOutput: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;
    let cancelled = false;

    (async () => {
      const u1 = await listen<PtyOutputPayload>("pty:output", (e) => {
        if (e.payload.sessionId !== sessionIdRef.current) return;
        terminal.write(e.payload.data);
      });
      const u2 = await listen<PtyExitPayload>("pty:exit", (e) => {
        if (e.payload.sessionId !== sessionIdRef.current) return;
        terminal.writeln("\r\n[Session ended]");
      });
      if (cancelled) {
        u1();
        u2();
        return;
      }
      unlistenOutput = u1;
      unlistenExit = u2;
    })();

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      invoke("resize_pty_session", {
        sessionId: sessionIdRef.current,
        rows: terminal.rows,
        cols: terminal.cols,
      }).catch(() => {});
    });
    observer.observe(container);

    return () => {
      cancelled = true;
      unlistenOutput?.();
      unlistenExit?.();
      observer.disconnect();
      invoke("stop_pty_session", { sessionId: sid }).catch(() => {});
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [session.sessionId, session.cwd, session.state]);

  return <div ref={termRef} data-testid="terminal-panel" className="flex-1 min-h-0" />;
}
