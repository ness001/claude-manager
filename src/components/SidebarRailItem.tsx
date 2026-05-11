import type { ComponentType, KeyboardEvent, Ref } from "react";

export interface SidebarRailItemProps {
  /** Display label (used for aria-label and tooltip). */
  label: string;
  /** Lucide icon component. Includes `aria-hidden` so the decorative SVG
   *  doesn't double-announce alongside the button's `aria-label`. */
  Icon: ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Whether this item represents the currently active section. */
  active: boolean;
  /** Click handler — typically dispatches navigation. */
  onClick: () => void;
  /** Optional keyboard shortcut shown in the tooltip (e.g. "Ctrl+1"). */
  shortcut?: string;
  /** Forwarded keydown handler — SidebarRail uses this to wire arrow-key roving. */
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  /** Forwarded button ref — SidebarRail uses this to programmatically focus
   *  the next item on Arrow/Home/End. */
  buttonRef?: Ref<HTMLButtonElement>;
  /** Tab index — SidebarRail uses this to implement WAI-ARIA roving tabindex
   *  (only the active item is in the Tab order; arrow keys move focus among
   *  the rest). */
  tabIndex?: number;
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
  onKeyDown,
  buttonRef,
  tabIndex,
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
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      // WAI-ARIA `aria-keyshortcuts`: the section keyboard shortcut (e.g.
      // "Ctrl+1") is currently exposed only via the visible `title` tooltip.
      // SR users have no way to discover the shortcut — `title` is sighted-
      // hover-only, and the bare aria-label ("Dashboard") doesn't carry it.
      // `aria-keyshortcuts` is the purpose-built ARIA attribute for this:
      // NVDA / JAWS / VoiceOver announce the shortcut on focus without
      // polluting the accessible name. The value is space-separated key
      // tokens per the ARIA spec — "Ctrl+1" is the canonical form. Mirrors
      // the title-into-AT-channel pattern used for disabled stubs (#181 /
      // #183 / #184 / #272), but routed through the correct attribute for
      // the keyboard-shortcut case rather than rewriting aria-label.
      aria-keyshortcuts={shortcut}
      title={title}
      data-active={active ? "true" : "false"}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`${base} ${active ? activeClasses : inactiveClasses}`}
    >
      {/* The button's accessible name comes from `aria-label={label}`. The
          icon is purely decorative — without aria-hidden, lucide's SVG can
          contribute its own computed name (e.g. "Settings") and screen
          readers may announce the label twice. WCAG 4.1.2. Mirrors the
          icon-hidden pattern used across QuickActions / SystemHealth. */}
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}
