// Tool-call block — see spec §5.8.
//
// Renders a `tool_use` (or paired `tool_use` + `tool_result`) entry. Header
// shows the tool name with a blue left border. Input JSON and output are
// inside a collapsible `<details>`. When the paired `tool_result` reports
// `is_error: true`, the block gets a red left border.

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";

interface ToolCallBlockProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput?: string;
  isError?: boolean;
}

export function ToolCallBlock({
  toolName,
  toolInput,
  toolOutput,
  isError,
}: ToolCallBlockProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const borderClass = isError
    ? "border-l-status-red"
    : "border-l-status-blue";

  return (
    <div
      data-testid="tool-call-block"
      data-error={isError ? "true" : "false"}
      className={`rounded-md border-l-4 ${borderClass} bg-bg-secondary px-3 py-2 text-sm`}
    >
      <button
        type="button"
        data-testid="tool-call-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded text-left text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="font-mono font-semibold">{toolName || "tool"}</span>
        {isError && (
          <span className="ml-auto rounded bg-status-red/15 px-1.5 py-0.5 text-[10px] font-medium text-status-red">
            Error
          </span>
        )}
      </button>
      {open && (
        <div
          id={bodyId}
          data-testid="tool-call-body"
          className="mt-2 flex flex-col gap-2"
        >
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Input
            </div>
            <pre className="overflow-auto rounded bg-bg-tertiary p-2 text-xs font-mono text-text-secondary">
              {JSON.stringify(toolInput, null, 2)}
            </pre>
          </div>
          {toolOutput !== undefined && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Output
              </div>
              <pre className="overflow-auto rounded bg-bg-tertiary p-2 text-xs font-mono text-text-secondary whitespace-pre-wrap">
                {toolOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
