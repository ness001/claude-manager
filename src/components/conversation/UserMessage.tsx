// User message bubble — see spec §5.8.
//
// Blue-gray bubble (`bg-user-bubble`), "You" label, plain text content.
// `content` may be a `string` (most first user messages) or a `JsonlContent[]`
// — we already normalize this in the parser, so the entry passed in carries
// `text` only. Kept tiny and presentational.

interface UserMessageProps {
  text: string;
}

export function UserMessage({ text }: UserMessageProps) {
  return (
    <div
      data-testid="user-message"
      className="flex flex-col gap-1 rounded-lg bg-user-bubble px-3 py-2"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        You
      </span>
      <div className="whitespace-pre-wrap text-sm text-text-primary">
        {text}
      </div>
    </div>
  );
}
