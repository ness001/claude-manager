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
    <dl
      data-testid="mcp-server-detail"
      className="flex flex-col gap-2 rounded border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary m-0"
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
          {/* WAI-ARIA APG + WCAG 1.3.1: an unlabeled <ul> exposes role+count
              but not purpose. Multiple expanded MCP cards on the same panel
              produce several "list with N items" entries in the SR rotor with
              no way to tell them apart. `aria-label` scopes the list to the
              owning server name so SR users can route to the correct one.
              Mirrors the labeled-collection sweep (#235/#236/#237/#254/#255/
              #257/#259). */}
          <ul
            data-testid="detail-tools"
            aria-label={`Tools exposed by ${server.name}`}
            className="list-inside list-disc"
          >
            {server.tools.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Row>
      )}
    </dl>
  );
}

// WCAG 1.3.1 (Info and Relationships): each row is a label/value pair
// (Command/<the cmd>, URL/<the url>, Env/<list>, …). Previously rendered
// as <span>+<div> with no programmatic association — SR users heard the
// label and value as two unrelated strings. <dt>/<dd> exposes the
// term-description relationship so screen readers announce them together
// and the rotor can navigate them as discrete pairs. Mirrors PR #199
// (PluginHooksTab) and PR #200 (PluginAgentsTab). The visible row layout
// is unchanged; `m-0` neutralizes UA-default <dd> indentation.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-16 shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-all m-0">{children}</dd>
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
  // When the value is masked, the visible text is 8 bullet glyphs
  // (`••••••••`). Screen readers will literally announce eight "bullet"
  // characters — a noisy, semantically meaningless reading. Override the
  // accessible name so SR users hear "TOKEN value hidden" (or just
  // "value hidden" when no key name is provided) instead of bullet noise.
  // When revealed, drop the override so the actual value is announced.
  const valueAriaLabel = revealed
    ? undefined
    : name
      ? `${name} value hidden`
      : "value hidden";
  return (
    <span className="flex items-center gap-1">
      <code data-testid={testid} aria-label={valueAriaLabel}>
        {revealed ? value : "•".repeat(8)}
      </code>
      <button
        type="button"
        data-testid={`${testid}-toggle`}
        aria-label={ariaLabel}
        aria-pressed={revealed}
        onClick={() => setRevealed((r) => !r)}
        className="rounded-sm text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {revealed ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
      </button>
    </span>
  );
}
