// Hooks tab — see spec §6.6. Event name + command from hooks.json.

import type { HookInfo } from "../../lib/plugin-types";

interface PluginHooksTabProps {
  hooks: HookInfo[];
}

export function PluginHooksTab({ hooks }: PluginHooksTabProps) {
  if (hooks.length === 0) {
    return (
      <div
        data-testid="hooks-empty"
        role="status"
        aria-live="polite"
        className="text-sm text-text-muted"
      >
        No hooks bundled.
      </div>
    );
  }
  return (
    // WCAG 2.4.6 / 1.3.1: bare <ul> is "list, N items" in the SR rotor
    // with no collection name. aria-label promotes it to a named
    // landmark. Mirrors the PluginAgentsTab / PluginSkillsTab fix in
    // this PR plus the broader semantic-list family.
    <ul
      data-testid="hooks-list"
      aria-label="Bundled hooks"
      className="flex flex-col gap-2"
    >
      {hooks.map((h, i) => (
        <li
          key={`${h.event}:${i}`}
          data-testid="hook-row"
          className="rounded-md border border-border p-2"
        >
          {/* WCAG 1.3.1 (Info and Relationships): event name + command form a
              key/value (term/description) pair. Rendering them as flat <span>
              siblings hides that relationship from AT — SR users hear two
              unrelated strings. <dl>/<dt>/<dd> exposes the term-description
              association so screen-readers (NVDA, VoiceOver) can announce
              "term: SessionStart, description: echo hi" and the elements
              are individually navigable in the rotor. */}
          <dl className="flex flex-col gap-0.5 m-0">
            <dt
              data-testid="hook-event"
              className="text-sm font-medium text-text-primary"
            >
              {h.event}
            </dt>
            <dd className="m-0">
              <code className="break-all text-xs text-text-secondary">
                {h.command}
              </code>
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
