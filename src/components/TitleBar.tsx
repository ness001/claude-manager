import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Custom title bar replacing the native OS chrome (decorations: false).
 * - The flex-1 spacer is the OS drag region (data-tauri-drag-region).
 * - Three buttons mimic Windows controls: minimize, maximize/restore, close.
 * - Tracks `isMaximized` so the middle button swaps icon (square vs. restore).
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setIsMaximized);
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setIsMaximized);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const win = getCurrentWindow();

  return (
    <div className="flex h-8 w-full shrink-0 items-center border-b border-border bg-sidebar-bg text-text-secondary select-none">
      <div
        data-tauri-drag-region
        className="flex h-full flex-1 items-center px-3 text-xs font-medium"
      >
        Claude Manager
      </div>
      {/* WAI-ARIA Toolbar pattern: the Minimize / Maximize / Close trio is a
        * related control group operating on the same target (the application
        * window). Without role="toolbar" + an accessible name, screen-reader
        * users navigating button-by-button hear three orphan controls with
        * no grouping context — and because the title bar replaces the OS
        * native chrome (decorations: false), AT cannot fall back to OS-
        * provided window-control semantics. role="toolbar" with
        * aria-label="Window controls" gives the cluster a discoverable
        * landmark name. Mirrors PR #246 (SessionInfoBar actions),
        * PR #248 (McpServerCard actions), PR #249 (PluginCard recovery
        * actions), PR #258 (PluginDetailView actions). */}
      <div
        role="toolbar"
        aria-label="Window controls"
        data-testid="window-controls-toolbar"
        className="flex h-full"
      >
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => win.minimize()}
          className="flex h-full w-11 items-center justify-center hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? "Restore" : "Maximize"}
          onClick={() => win.toggleMaximize()}
          className="flex h-full w-11 items-center justify-center hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {isMaximized ? <Copy size={12} aria-hidden="true" /> : <Square size={12} aria-hidden="true" />}
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => win.close()}
          className="flex h-full w-11 items-center justify-center hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
