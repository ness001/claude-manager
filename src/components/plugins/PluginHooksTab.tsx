// Hooks tab — see spec §6.6. Event name + command from hooks.json.

import type { HookInfo } from "../../lib/plugin-types";

interface PluginHooksTabProps {
  hooks: HookInfo[];
}

export function PluginHooksTab({ hooks }: PluginHooksTabProps) {
  if (hooks.length === 0) {
    return (
      <div data-testid="hooks-empty" className="text-sm text-text-muted">
        No hooks bundled.
      </div>
    );
  }
  return (
    <ul data-testid="hooks-list" className="flex flex-col gap-2">
      {hooks.map((h, i) => (
        <li
          key={`${h.event}:${i}`}
          data-testid="hook-row"
          className="flex flex-col gap-0.5 rounded-md border border-border p-2"
        >
          <span className="text-sm font-medium text-text-primary">
            {h.event}
          </span>
          <code className="break-all text-xs text-text-secondary">
            {h.command}
          </code>
        </li>
      ))}
    </ul>
  );
}
