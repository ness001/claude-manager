// MCP Servers section — see spec §8, §13 (refresh strategy).
//
// Mounts McpPanel and orchestrates load + refresh:
//   - on mount: loadServers(), refreshStatus()
//   - poll refreshStatus every 15s while panel visible, 60s when document
//     hidden (visibilitychange)
//   - 2s burst after add/edit/remove (the store reloads servers on each
//     write; this triggers a status refresh shortly after)
//
// McpServerForm modal opens whenever editingServer is non-null.

import { useEffect, useRef } from "react";

import { McpPanel } from "../components/mcp/McpPanel";
import { McpServerForm } from "../components/mcp/McpServerForm";
import { useMcpStore } from "../stores/mcp-store";

const VISIBLE_INTERVAL_MS = 15_000;
const HIDDEN_INTERVAL_MS = 60_000;
const POST_ACTION_BURST_MS = 2_000;

export function McpSection() {
  const loadServers = useMcpStore((s) => s.loadServers);
  const refreshStatus = useMcpStore((s) => s.refreshStatus);
  const editingServer = useMcpStore((s) => s.editingServer);
  const stopEditing = useMcpStore((s) => s.stopEditing);
  const servers = useMcpStore((s) => s.servers);
  const cwd = useMcpStore((s) => s.cwd);

  // Used by the burst poll: when servers list length changes, we ran an
  // add/remove; schedule a 2s status refresh.
  const lastServerCount = useRef(servers.length);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  // Poll cadence — switches based on document visibility (spec §13).
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (ms: number) => {
      if (timer !== null) clearInterval(timer);
      timer = setInterval(() => {
        void refreshStatus();
      }, ms);
    };
    const onVisibility = () => {
      start(
        document.visibilityState === "hidden"
          ? HIDDEN_INTERVAL_MS
          : VISIBLE_INTERVAL_MS,
      );
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== null) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshStatus]);

  // 2s burst after add/edit/remove — detected by server count change.
  useEffect(() => {
    if (servers.length === lastServerCount.current) return;
    lastServerCount.current = servers.length;
    const t = setTimeout(() => {
      void refreshStatus();
    }, POST_ACTION_BURST_MS);
    return () => clearTimeout(t);
  }, [servers.length, refreshStatus]);

  const existingNames = {
    user: servers.filter((s) => s.scope === "user").map((s) => s.name),
    local: servers.filter((s) => s.scope === "local").map((s) => s.name),
    project: servers.filter((s) => s.scope === "project").map((s) => s.name),
  };

  return (
    <section data-testid="mcp-section" className="flex h-full">
      <McpPanel />
      {editingServer && (
        <McpServerForm
          initial={editingServer.name === "" ? null : editingServer}
          existingNames={existingNames}
          cwd={cwd}
          onClose={stopEditing}
          onSaved={() => {
            void loadServers();
          }}
        />
      )}
    </section>
  );
}
