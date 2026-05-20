// Plugins-scope log viewer — see spec §6.8. Opened in a separate window
// via `open_plugin_log_window`. Mounts → loads current log via
// `read_plugin_log`, then subscribes to the `plugin-log` Tauri event to
// append live entries.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LogEntry {
  timestamp: string;
  op: string;
  key: string;
  marker: string;
  payload: string;
}

function formatEntry(e: LogEntry): string {
  const payload = e.payload ? `\t${e.payload}` : "";
  return `${e.timestamp}\t${e.op}\t${e.key}\t${e.marker}${payload}`;
}

export function LogView() {
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const initial = await invoke<string>("read_plugin_log");
        setText(initial);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      try {
        const off = await listen<LogEntry>("plugin-log", (event) => {
          setText((prev) => prev + (prev && !prev.endsWith("\n") ? "\n" : "") + formatEntry(event.payload) + "\n");
        });
        unlisten = off;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div
      data-testid="plugins-log-view"
      className="flex h-screen w-screen flex-col bg-bg-primary text-text-primary"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h1 className="text-sm font-semibold">Plugins — Log</h1>
        <span className="text-[11px] text-text-muted">
          {text ? `${text.split("\n").filter(Boolean).length} entries` : "no entries yet"}
        </span>
      </header>
      {error && (
        <p role="alert" className="px-4 py-2 text-xs text-status-red">
          {error}
        </p>
      )}
      <pre
        data-testid="plugins-log-pre"
        className="flex-1 overflow-auto whitespace-pre-wrap break-all px-4 py-2 text-[11px] font-mono text-text-secondary"
      >
        {text || "Plugins activity will appear here as you install, uninstall, toggle, or check for updates."}
      </pre>
    </div>
  );
}
