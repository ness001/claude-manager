import type { ComponentType } from "react";

export interface SidebarRailItemProps {
  /** Display label (used for aria-label and tooltip). */
  label: string;
  /** Lucide icon component. */
  Icon: ComponentType<{ className?: string; size?: number }>;
  /** Whether this item represents the currently active section. */
  active: boolean;
  /** Click handler — typically dispatches navigation. */
  onClick: () => void;
  /** Optional keyboard shortcut shown in the tooltip (e.g. "Ctrl+1"). */
  shortcut?: string;
}

/**
 * One item in the SidebarRail. Icon-only button with aria-label for
 * accessibility and a title attribute for hover tooltip. Active state
 * shows an accent left-border indicator and accent icon color.
 */
export function SidebarRailItem({
  label,
  Icon,
  active,
  onClick,
  shortcut,
}: SidebarRailItemProps) {
  const base =
    "relative flex h-12 w-12 items-center justify-center border-l-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset";
  const activeClasses =
    "bg-sidebar-active border-accent text-accent";
  const inactiveClasses =
    "border-transparent text-text-secondary hover:bg-sidebar-active/50 hover:text-text-primary";
  const title = shortcut ? `${label} (${shortcut})` : label;

  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={title}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className={`${base} ${active ? activeClasses : inactiveClasses}`}
    >
      <Icon size={20} />
    </button>
  );
}
