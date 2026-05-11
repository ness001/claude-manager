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

import { useEffect, useId, useState } from "react";

type HealthStatus = "ok" | "warn" | "fail" | "checking";

/** Hard timeout for the API HEAD probe (ms). See useEffect below for rationale. */
const API_CHECK_TIMEOUT_MS = 8000;

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
  // WCAG 1.4.11 (Non-text Contrast): the warn dot is a 2x2 (8px) circle
  // sitting on the white card-bg in light mode. The original
  // `bg-status-yellow` (#eab308) gives only ~1.6:1 contrast against
  // #ffffff — well below the 3:1 floor for graphical UI components, so
  // sighted users in light mode see what is essentially an invisible
  // dot for the only visual cue distinguishing "warn" from "ok" rows
  // in the System Health card. The status text fills in the gap for SR
  // users (each <li> aria-label says "MCP: 0 servers — Warning") but
  // the visible signal is gone. Swap to `--color-status-amber`
  // (#d97706 light / #fab387 dark) which already stands for "warning"
  // in this codebase (PR #293 ActivityChart staleness banner, the
  // PluginCard update-pill, the McpServerCard "starting" pill) — on
  // white it gives ~3.36:1, comfortably above the 3:1 non-text floor,
  // and the dark theme override is unaffected because amber is already
  // a pale color on dark surfaces. Only swapped for the SystemHealth
  // dot here; other `bg-status-yellow` sites (orphaned-state SessionCard
  // / PluginCard / SessionInfoBar dots, ConversationViewer corruption
  // banner) retain the yellow stripe and will be fixed in their own
  // PRs to keep blast radius surgical.
  warn: "bg-status-amber",
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
  //
  // Hard timeout: 8s. Without it a stalled connection (no SYN-ACK, captive
  // portal, dropped packets) leaves the dot stuck on "Checking…" forever —
  // the user can't tell whether the API is degraded or whether the probe
  // just never finished. AbortController + setTimeout cancels the in-flight
  // request and surfaces "fail" so the indicator is always actionable.
  useEffect(() => {
    if (skipApiCheck) {
      setApiStatus("ok");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CHECK_TIMEOUT_MS);
    void (async () => {
      try {
        const res = await fetch(apiCheckUrl, {
          method: "HEAD",
          signal: controller.signal,
        });
        if (cancelled) return;
        // The indicator measures *reachability* of api.anthropic.com, not
        // endpoint correctness. Any HTTP response (2xx, 3xx, 4xx, 5xx)
        // proves the server answered: DNS resolved, TCP/TLS handshake
        // completed, and a status line came back. Only network-level
        // failures (DNS NXDOMAIN, connection refused, TLS error,
        // captive-portal hijack, timeout) should surface as "Down".
        //
        // The previous code treated only `res.ok || 401 || 403` as OK, so:
        //   - HEAD → 405 Method Not Allowed (common — many edges reject
        //     HEAD on /v1) → showed "API: Down" even though the user's
        //     CLI worked.
        //   - HEAD → 404 (the bare /v1 root has no handler at some edges)
        //     → showed "API: Down".
        //   - Any 5xx (transient upstream blip) → showed "API: Down" until
        //     the user navigated away and back.
        // All four are reachability successes — the API is up; it's the
        // probe URL or method that the server happens to reject.
        // Discard `res.ok` and `res.status` checks: if we got here, the
        // server answered.
        setApiStatus("ok");
      } catch {
        // AbortError (timeout or unmount) and network errors both → fail.
        // Unmount is handled by the cancelled flag below so we don't write state.
        if (!cancelled) setApiStatus("fail");
      } finally {
        clearTimeout(timeoutId);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [apiCheckUrl, skipApiCheck]);

  const mcpStatus: HealthStatus = mcpCount > 0 ? "ok" : "warn";
  const pluginStatus: HealthStatus = pluginCount > 0 ? "ok" : "warn";
  const cliStatus: HealthStatus = cliVersion === "unknown" ? "warn" : "ok";

  // WCAG 1.3.1 + WAI-ARIA APG: dashboard cards each have a visible <h3>
  // header but render as bare <div>s — the SR landmarks rotor cannot
  // surface them by name. Promote the card to a labelled <section> bound
  // to its <h3> via aria-labelledby so users can route to "System Health"
  // directly. Mirrors PR #262 (ModelDonut) and the broader region-
  // landmark sweep (#245 / #256 / #261).
  const headingId = useId();

  return (
    <section
      data-testid="system-health"
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-md border border-border bg-card-bg p-4"
    >
      <h3
        id={headingId}
        className="text-xs uppercase tracking-wide text-text-muted"
      >
        System Health
      </h3>
      {/* WCAG 2.4.6 (Headings and Labels) / 1.3.1 (Info and Relationships):
          screen-reader users navigating by lists (NVDA "L", JAWS "L") would
          hear "list, 4 items" with no clue this is the system-health
          breakdown — the visual context (the "System Health" h3 above) is
          not exposed to AT for the list itself. aria-label promotes the
          list to a recognizably named landmark in the rotor / elements
          list. Mirrors the labeled-list pattern in ModelDonut
          (donut-legend, lines 114-124). */}
      <ul aria-label="System health indicators" className="flex flex-col gap-1.5 text-xs">
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
    </section>
  );
}

interface IndicatorProps {
  label: string;
  status: HealthStatus;
  value: string;
  testId?: string;
}

function Indicator({ label, status, value, testId }: IndicatorProps) {
  // Coherent SR announcement (WCAG 1.3.1 / 4.1.2): the indicator visually
  // composes label + value + status-dot into one tile, but the DOM is a
  // colored dot ("OK") plus two flat sibling spans ("MCP", "0 servers")
  // with no programmatic linkage. SR users walking the list hear three
  // disconnected fragments per item ("image, OK, MCP, 0 servers") and
  // the rotor list view shows each <li> only by its first text node.
  // Promote the <li> to a self-contained announcement that combines the
  // dimension, the value, and the status: "MCP: 0 servers — Warning".
  // Mirrors StatCard (lines 70-73) and ModelDonut donut-legend's labeled-
  // list pattern. The dot keeps its own role="img" + aria-label so direct
  // image-rotor navigation still works (and the existing test pinning
  // dot.aria-label="OK" stays green); the visible layout is unchanged.
  const liAriaLabel = `${label}: ${value} — ${STATUS_LABEL[status]}`;
  return (
    <li
      data-testid={testId ?? "health-indicator"}
      data-status={status}
      aria-label={liAriaLabel}
      className="flex items-center gap-2"
    >
      <span
        role="img"
        aria-label={STATUS_LABEL[status]}
        data-testid="health-dot"
        className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATUS_COLOR[status]}`}
      />
      <span className="text-text-secondary w-16 shrink-0">{label}</span>
      {/* `truncate` clips long values (CLI version strings include build
          metadata + commit SHA; future MCP/plugin labels can be long).
          Indicators are non-interactive, so without `title` a sighted user
          has no way to recover the hidden tail. Mirror the visible string
          into title — same fix as RecentSessions name (PR #170) and
          SkillCard skill-path (PR #167). */}
      <span className="text-text-muted truncate" title={value}>{value}</span>
    </li>
  );
}
