// Summary banner — see spec §5.8.
//
// Highlighted full-width banner showing the session summary text.

interface SummaryBannerProps {
  text: string;
}

export function SummaryBanner({ text }: SummaryBannerProps) {
  return (
    <div
      data-testid="summary-banner"
      className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-text-primary"
    >
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
        Session summary
      </span>
      <span>{text}</span>
    </div>
  );
}
