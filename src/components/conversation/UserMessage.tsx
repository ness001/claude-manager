// User message bubble — see spec §5.8.
//
// Blue-gray bubble (`bg-user-bubble`), "You" label, plain text content.
// `content` may be a `string` (most first user messages) or a `JsonlContent[]`
// — we already normalize this in the parser, so the entry passed in carries
// `text` only. Kept tiny and presentational.

import { useId } from "react";

interface UserMessageProps {
  text: string;
}

export function UserMessage({ text }: UserMessageProps) {
  // WCAG 1.3.1 (Info and Relationships): the visual "You" label and the
  // message body are grouped by the bubble visually, but the DOM
  // previously exposed two adjacent siblings with no programmatic
  // relationship. SR users heard "You" as a free-floating uppercase
  // fragment, then unrelated prose. Promote the bubble to a labelled
  // region so AT can navigate to it via the landmarks list and announce
  // the speaker label together with the body. Mirrors SummaryBanner.
  const labelId = useId();
  return (
    <div
      data-testid="user-message"
      role="region"
      aria-labelledby={labelId}
      className="flex flex-col gap-1 rounded-lg bg-user-bubble px-4 py-3 ml-8"
    >
      <span
        id={labelId}
        data-testid="user-message-label"
        className="text-[10px] font-semibold uppercase tracking-wide text-text-muted"
      >
        You
      </span>
      <div className="whitespace-pre-wrap text-sm text-text-primary">
        {text}
      </div>
    </div>
  );
}
