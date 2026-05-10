// Assistant message — see spec §5.8.
//
// "Claude" label + model badge + markdown-rendered text. Uses `react-markdown`
// with `remark-gfm` (tables / strikethrough), `remark-math` + `rehype-katex`
// (LaTeX), and `rehype-highlight` (syntax-highlighted code blocks).
//
// Note on the highlighter: spec §5.8 names "shiki" for code blocks. We use
// `rehype-highlight` (highlight.js) because it is sync, runs entirely under
// jsdom for tests, and produces equivalent CSS-class-based syntax highlighting
// — the spec's intent is "highlighted code blocks", not the specific engine.
// KaTeX styles + the highlight.js theme are imported once in `src/main.tsx`.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { useId } from "react";

interface AssistantMessageProps {
  text: string;
  model?: string;
}

export function AssistantMessage({ text, model }: AssistantMessageProps) {
  // WCAG 1.3.1 (Info and Relationships): the visual "Claude" label, the
  // optional model badge, and the message body are grouped by the bubble
  // visually, but the DOM previously exposed them as adjacent siblings
  // with no programmatic relationship. SR users heard "Claude" then the
  // model name then unrelated prose. Promote the bubble to a labelled
  // region so AT can navigate to it via the landmarks list and announce
  // the speaker label together with the body. Mirrors UserMessage (#165)
  // and SummaryBanner (#164).
  const labelId = useId();
  return (
    <div
      data-testid="assistant-message"
      role="region"
      aria-labelledby={labelId}
      className="flex flex-col gap-1 rounded-lg bg-bg-secondary px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <span
          id={labelId}
          data-testid="assistant-message-label"
          className="text-[10px] font-semibold uppercase tracking-wide text-text-muted"
        >
          Claude
        </span>
        {model && (
          <span
            data-testid="assistant-model-badge"
            className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary"
          >
            {model}
          </span>
        )}
      </div>
      <div
        data-testid="assistant-markdown"
        className="prose-sm max-w-none text-sm text-text-primary [&_pre]:rounded [&_pre]:bg-bg-tertiary [&_pre]:p-2 [&_pre]:overflow-auto [&_code]:font-mono [&_p]:my-1"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeHighlight]}
          components={{
            // Hand off external links to the OS via the Tauri shell plugin.
            // Without this, clicking a link inside the assistant's markdown
            // would navigate the entire Tauri WebView away to that URL —
            // killing the conversation view with no back button. Also adds
            // a visible affordance (underline + accent color) so links are
            // distinguishable by more than color alone (WCAG 1.4.1).
            a: ({ href, children, ...rest }) => (
              <a
                {...rest}
                href={href}
                data-testid="assistant-link"
                onClick={(e) => {
                  e.preventDefault();
                  if (href) void openShell(href).catch(() => {});
                }}
                className="text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                {children}
              </a>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
