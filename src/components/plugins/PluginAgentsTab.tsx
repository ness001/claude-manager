// Agents tab — see spec §6.6. Name + description + model + tools.

import type { AgentInfo } from "../../lib/plugin-types";

interface PluginAgentsTabProps {
  agents: AgentInfo[];
}

export function PluginAgentsTab({ agents }: PluginAgentsTabProps) {
  if (agents.length === 0) {
    return (
      <div data-testid="agents-empty" className="text-sm text-text-muted">
        No agents bundled.
      </div>
    );
  }
  return (
    <ul data-testid="agents-list" className="flex flex-col gap-2">
      {agents.map((a) => (
        <li
          key={a.name}
          data-testid="agent-row"
          className="flex flex-col gap-0.5 rounded-md border border-border p-2"
        >
          <span className="text-sm font-medium text-text-primary">
            {a.name}
          </span>
          <span className="text-xs text-text-secondary">{a.description}</span>
          <div className="flex gap-2 text-[10px] text-text-muted">
            {a.model && <span data-testid="agent-model">model: {a.model}</span>}
            {a.tools && a.tools.length > 0 && (
              <span data-testid="agent-tools">
                tools: {a.tools.join(", ")}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
