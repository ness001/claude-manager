// System health panel — see spec §4.1 Row 3 (right bottom).
//
// Indicator dots for: MCP connection count, plugin count, API reachability,
// CLI version. The API check is a HEAD request to ANTHROPIC_BASE_URL and
// MUST be non-blocking — the dot starts in "checking" and resolves async.
//
// Phase 2 ships the UI shell with conservative defaults; the actual data
// sources (MCP/plugin counts from settings/installed_plugins.json, CLI
// version from `claude --version`) are wired in later phases. Props let
// callers feed real values in once those sources exist.

import { useEffect, useState } from "react";

type HealthStatus = "ok" | "warn" | "fail" | "checking";

interface SystemHealthProps {
  /** Number of configured MCP servers (default 0 — unknown). */
  mcpCount?: number;
  /** Number of installed plugins (default 0 — unknown). */
  pluginCount?: number;
  /** CLI version string, e.g. "1.2.3" (default "unknown"). */
  cliVersion?: string;
  /**
   * Optional override for the API HEAD-check URL. Defaults to the public
   * Anthropic API base. Tests inject a mock URL here.
   */
  apiCheckUrl?: string;
  /**
   * Test seam: when true, skip the network HEAD check entirely. Used to
   * keep unit tests deterministic. Production code leaves this `false`.
   */
  skipApiCheck?: boolean;
}

const STATUS_COLOR: Record<HealthStatus, string> = {
  ok: "bg-status-green",
  warn: "bg-status-yellow",
  fail: "bg-status-red",
  checking: "bg-text-muted",
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  ok: "OK",
  warn: "Warning",
  fail: "Down",
  checking: "Checking…",
};

export function SystemHealth({
  mcpCount = 0,
  pluginCount = 0,
  cliVersion = "unknown",
  apiCheckUrl = "https://api.anthropic.com/v1",
  skipApiCheck = false,
}: SystemHealthProps) {
  const [apiStatus, setApiStatus] = useState<HealthStatus>("checking");

  // Non-blocking HEAD probe. We deliberately do NOT await this in any way
  // that could stall first paint. Errors (network, CORS, 4xx, 5xx) → "fail";
  // any 2xx/3xx → "ok". The check fires once on mount.
  useEffect(() => {
    if (skipApiCheck) {
      setApiStatus("ok");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(apiCheckUrl, { method: "HEAD" });
        if (cancelled) return;
        // 401/403 still mean the API is reachable — surface as OK.
        setApiStatus(res.ok || res.status === 401 || res.status === 403 ? "ok" : "fail");
      } catch {
        if (!cancelled) setApiStatus("fail");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiCheckUrl, skipApiCheck]);

  const mcpStatus: HealthStatus = mcpCount > 0 ? "ok" : "warn";
  const pluginStatus: HealthStatus = pluginCount > 0 ? "ok" : "warn";
  const cliStatus: HealthStatus = cliVersion === "unknown" ? "warn" : "ok";

  return (
    <div
      data-testid="system-health"
      className="flex flex-col gap-2 rounded-md border border-border bg-card-bg p-4"
    >
      <h3 className="text-xs uppercase tracking-wide text-text-muted">
        System Health
      </h3>
      <ul className="flex flex-col gap-1.5 text-xs">
        <Indicator
          label="MCP"
          status={mcpStatus}
          value={`${mcpCount} ${mcpCount === 1 ? "server" : "servers"}`}
        />
        <Indicator label="Plugins" status={pluginStatus} value={`${pluginCount} ${pluginCount === 1 ? "plugin" : "plugins"} installed`} />
        <Indicator
          label="API"
          status={apiStatus}
          value={STATUS_LABEL[apiStatus]}
          testId="health-api"
        />
        <Indicator label="CLI" status={cliStatus} value={cliVersion} />
      </ul>
    </div>
  );
}

interface IndicatorProps {
  label: string;
  status: HealthStatus;
  value: string;
  testId?: string;
}

function Indicator({ label, status, value, testId }: IndicatorProps) {
  return (
    <li
      data-testid={testId ?? "health-indicator"}
      data-status={status}
      className="flex items-center gap-2"
    >
      <span
        role="img"
        aria-label={STATUS_LABEL[status]}
        data-testid="health-dot"
        className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATUS_COLOR[status]}`}
      />
      <span className="text-text-secondary w-16 shrink-0">{label}</span>
      <span className="text-text-muted truncate">{value}</span>
    </li>
  );
}
