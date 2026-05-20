// Summary banner — see spec §5.8.
//
// Highlighted full-width banner showing the session summary text.

import { useId } from "react";

interface SummaryBannerProps {
  text: string;
}

export function SummaryBanner({ text }: SummaryBannerProps) {
  // WCAG 1.3.1 (Info and Relationships): the visual "Session summary" label
  // and the body text are grouped visually by the bordered/tinted banner,
  // but the DOM previously exposed two adjacent <span>s with no
  // programmatic relationship between label and content. Promote the
  // banner to a labeled region (role="region" + aria-labelledby) so
  // assistive tech can navigate to it via the landmarks list and announce
  // both the label and the content together.
  const labelId = useId();
  return (
    <div
      data-testid="summary-banner"
      role="region"
      aria-labelledby={labelId}
      className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-text-primary"
    >
      <span
        id={labelId}
        data-testid="summary-banner-label"
        className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-accent"
      >
        Session summary
      </span>
      {/* Session summaries originate from the JSONL `summary` field written
          by the Claude Code CLI's compaction step, which routinely contains
          multi-line text — paragraph breaks separating "what was done",
          "why", and "next steps", or markdown-bullet lists. A bare <span>
          inherits `white-space: normal`, collapsing every run of whitespace
          (newlines included) into a single space, so a 6-line summary
          renders as one wrapped paragraph with no structural cues. Mirrors
          UserMessage line 37 which uses the same `whitespace-pre-wrap`
          discipline for raw user text. */}
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}
