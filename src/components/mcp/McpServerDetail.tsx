// Expanded card body — see spec §8.4. stdio shows command + args; sse/http
// shows URL + headers; env vars are masked with reveal toggle; tools list
// rendered when present.

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import type { McpServer } from "../../lib/mcp-types";

interface McpServerDetailProps {
  server: McpServer;
}

export function McpServerDetail({ server }: McpServerDetailProps) {
  return (
    <div
      data-testid="mcp-server-detail"
      className="flex flex-col gap-2 rounded border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
    >
      {server.type === "stdio" ? (
        <>
          <Row label="Command">
            <code data-testid="detail-command">{server.command ?? ""}</code>
          </Row>
          <Row label="Args">
            <code data-testid="detail-args">
              {(server.args ?? []).join(" ") || "—"}
            </code>
          </Row>
        </>
      ) : (
        <>
          <Row label="URL">
            <code data-testid="detail-url">{server.url ?? ""}</code>
          </Row>
          {server.headers && Object.keys(server.headers).length > 0 && (
            <Row label="Headers">
              <KeyValueList entries={server.headers} testidPrefix="header" />
            </Row>
          )}
        </>
      )}

      <Row label="Env">
        <KeyValueList
          entries={server.env}
          testidPrefix="env"
          masked
        />
      </Row>

      {server.tools && server.tools.length > 0 && (
        <Row label="Tools">
          <ul data-testid="detail-tools" className="list-inside list-disc">
            {server.tools.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-16 shrink-0 text-text-muted">{label}</span>
      <div className="min-w-0 flex-1 break-all">{children}</div>
    </div>
  );
}

function KeyValueList({
  entries,
  testidPrefix,
  masked = false,
}: {
  entries: Record<string, string>;
  testidPrefix: string;
  masked?: boolean;
}) {
  const keys = Object.keys(entries);
  if (keys.length === 0) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {keys.map((k) => (
        <li
          key={k}
          data-testid={`${testidPrefix}-row`}
          className="flex items-baseline gap-2"
        >
          <code className="text-text-primary">{k}</code>
          <span className="text-text-muted">=</span>
          <MaskedValue
            value={entries[k]}
            masked={masked}
            name={k}
            testid={`${testidPrefix}-value-${k}`}
          />
        </li>
      ))}
    </ul>
  );
}

function MaskedValue({
  value,
  masked,
  name,
  testid,
}: {
  value: string;
  masked: boolean;
  name?: string;
  testid: string;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!masked) {
    return <code data-testid={testid}>{value}</code>;
  }
  const action = revealed ? "Hide" : "Reveal";
  const ariaLabel = name ? `${action} ${name}` : `${action} value`;
  return (
    <span className="flex items-center gap-1">
      <code data-testid={testid}>{revealed ? value : "•".repeat(8)}</code>
      <button
        type="button"
        data-testid={`${testid}-toggle`}
        aria-label={ariaLabel}
        aria-pressed={revealed}
        onClick={() => setRevealed((r) => !r)}
        className="text-text-muted hover:text-text-primary"
      >
        {revealed ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
      </button>
    </span>
  );
}
