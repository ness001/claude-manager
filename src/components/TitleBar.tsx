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
    <div className="flex h-8 w-full shrink-0 items-center bg-sidebar-bg text-text-secondary select-none">
      <div
        data-tauri-drag-region
        className="flex h-full flex-1 items-center px-3 text-xs font-medium"
      >
        Claude Manager
      </div>
      <div className="flex h-full">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => win.minimize()}
          className="flex h-full w-11 items-center justify-center hover:bg-white/10"
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? "Restore" : "Maximize"}
          onClick={() => win.toggleMaximize()}
          className="flex h-full w-11 items-center justify-center hover:bg-white/10"
        >
          {isMaximized ? <Copy size={12} aria-hidden="true" /> : <Square size={12} aria-hidden="true" />}
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => win.close()}
          className="flex h-full w-11 items-center justify-center hover:bg-red-600 hover:text-white"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
