// Agents tab — see spec §6.6. Name + description + model + tools.

import type { AgentInfo } from "../../lib/plugin-types";

interface PluginAgentsTabProps {
  agents: AgentInfo[];
}

export function PluginAgentsTab({ agents }: PluginAgentsTabProps) {
  if (agents.length === 0) {
    return (
      <div
        data-testid="agents-empty"
        role="status"
        aria-live="polite"
        className="text-sm text-text-muted"
      >
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
          {/* WCAG 1.3.1 (Info and Relationships): "model: <value>" and
              "tools: <value>" are key/value (term/description) pairs. The
              previous flat <span> rendering hid the relationship from AT —
              SR users heard "model colon claude-sonnet-4 tools colon Read
              Edit Bash" as one undifferentiated string. <dl>/<dt>/<dd>
              exposes the term-description association so screen-readers
              (NVDA, VoiceOver) can announce them as discrete pairs and
              navigate them via the rotor. Mirrors PR #199 (PluginHooksTab
              event/command). The visible "model:" / "tools:" prefixes are
              kept on the <dt> for sighted-user parity. `m-0` neutralizes
              the UA-default <dl>/<dd> margins so the visible row layout
              stays identical. */}
          {((a.model && a.model.length > 0) ||
            (a.tools && a.tools.length > 0)) && (
            <dl className="flex gap-2 text-[10px] text-text-muted m-0">
              {a.model && (
                <div data-testid="agent-model" className="flex gap-1">
                  <dt>model:</dt>
                  <dd className="m-0">{a.model}</dd>
                </div>
              )}
              {a.tools && a.tools.length > 0 && (
                <div data-testid="agent-tools" className="flex gap-1">
                  <dt>tools:</dt>
                  <dd className="m-0">{a.tools.join(", ")}</dd>
                </div>
              )}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}
