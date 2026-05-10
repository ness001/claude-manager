// System divider — see spec §5.8.
//
// Two visual variants chosen by `text` content already shaped by the parser:
//   • "— Turn N — Xms —" / "— Turn —" : centered turn boundary
//   • "--- Context compacted ---"     : muted dashed compaction boundary

interface SystemDividerProps {
  text: string;
  turnNumber?: number;
}

export function SystemDivider({ text, turnNumber }: SystemDividerProps) {
  const isCompact = text.includes("Context compacted");
  // The parser emits two turn-divider shapes:
  //   "— Turn —"          (no timing)
  //   "— Turn — Xms —"    (with timing)
  // Inject the turn number once. The previous chained-replace approach
  // double-substituted on "— Turn —" because the first replace produced
  // "— Turn N —", which still contains the second pattern "— Turn ".
  const label =
    turnNumber && !isCompact
      ? text.replace(/— Turn(?= )/, `— Turn ${turnNumber}`)
      : text;

  if (isCompact) {
    return (
      <div
        data-testid="system-divider"
        data-variant="compact"
        role="separator"
        aria-label={label}
        className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-text-muted"
      >
        <div aria-hidden="true" className="flex-1 border-t border-dashed border-border-strong" />
        <span>{label}</span>
        <div aria-hidden="true" className="flex-1 border-t border-dashed border-border-strong" />
      </div>
    );
  }
  return (
    <div
      data-testid="system-divider"
      data-variant="turn"
      role="separator"
      aria-label={label}
      className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-text-muted"
    >
      <div aria-hidden="true" className="flex-1 border-t border-border" />
      <span>{label}</span>
      <div aria-hidden="true" className="flex-1 border-t border-border" />
    </div>
  );
}
