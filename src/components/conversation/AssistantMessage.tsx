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
import { useId, useState } from "react";

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
  // Surface link-open failures inline. `openShell` rejects when the OS
  // has no handler for the URI scheme (e.g. `mailto:` with no mail
  // client), the Tauri shell allowlist forbids the target, or the
  // target is otherwise unreachable. The prior `.catch(() => {})`
  // discarded these errors entirely — sighted users clicked an
  // assistant-rendered link and got *nothing*, with no clue whether the
  // app was broken or the link was bad. SR users got the same
  // opaque silent failure. Mirrors SkillCard's open-error surfacing
  // (lines 21-29) and the broader silent-failure family (PR #91).
  const [openError, setOpenError] = useState<string | null>(null);
  return (
    <div
      data-testid="assistant-message"
      role="region"
      aria-labelledby={labelId}
      className="flex flex-col gap-1 rounded-lg bg-bg-secondary px-4 py-3 mr-8"
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
            // WCAG 4.1.2 (Name, Role, Value): the visible text is a bare
            // model identifier ("claude-opus-4.6") — SR users hear it as
            // an opaque string with no semantic context. Sighted users
            // infer "model" from the visual badge layout next to the
            // "Claude" label; mirror that into the accessible name with
            // a "Model: …" prefix. Same pattern as PR #246-era fix on
            // SessionInfoBar's model-badge.
            aria-label={`Model: ${model}`}
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
            // WCAG 2.1.1 (Keyboard): the markdown <pre> blocks have
            // overflow-auto (long shell lines / JSON dumps clip horizontally),
            // so mouse users can scroll the overflow but keyboard-only users
            // cannot — <pre> is not focusable by default and `tabIndex` is a
            // DOM property, not something Tailwind's `[&_pre]:` arbitrary
            // selector can set. Pass an explicit override that adds
            // tabIndex=0 + an accessible name + a focus-visible ring so
            // keyboard users can Tab into the block and arrow-scroll. Mirrors
            // the same fix on `conversation-scroller` (PR #149-ish family).
            pre: ({ children, ...rest }) => (
              <pre
                {...rest}
                tabIndex={0}
                role="region"
                aria-label="Code block"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {children}
              </pre>
            ),
            // Hand off external links to the OS via the Tauri shell plugin.
            // Without this, clicking a link inside the assistant's markdown
            // would navigate the entire Tauri WebView away to that URL —
            // killing the conversation view with no back button. Also adds
            // a visible affordance (underline + accent color) so links are
            // distinguishable by more than color alone (WCAG 1.4.1).
            //
            // onClick covers left-click. Middle-click (mouse button 1) and
            // Ctrl/Cmd+click do NOT fire onClick — they fire onAuxClick (or
            // bypass it entirely depending on browser). In a single-window
            // Tauri WebView there is no "open in new tab" affordance, so
            // any middle-click on an assistant-rendered link in the prior
            // implementation either silently no-op'd OR navigated the whole
            // WebView away (depending on WebView2 build) — the same death-
            // by-navigation the onClick handler exists to prevent. Mirror
            // the same shell hand-off on auxClick + treat Ctrl/Cmd+click
            // on the primary button as the same intent.
            //
            // onKeyDown covers keyboard activation. The browser's default
            // Enter-on-focused-link behavior navigates the host element to
            // `href` — inside Tauri's WebView that means losing the entire
            // app view, the same death-by-navigation onClick exists to
            // prevent. Mirror the shell hand-off so keyboard users get the
            // same OS-shell open as mouse users. Space is not a browser
            // default on <a>, but APG suggests honoring it for parity with
            // button-like activation.
            a: ({ href, children, ...rest }) => {
              const handleOpen = (
                e:
                  | React.MouseEvent<HTMLAnchorElement>
                  | React.KeyboardEvent<HTMLAnchorElement>,
              ) => {
                e.preventDefault();
                setOpenError(null);
                if (href) {
                  void openShell(href).catch((err) => {
                    setOpenError(
                      err instanceof Error ? err.message : String(err),
                    );
                  });
                }
              };
              return (
                <a
                  {...rest}
                  href={href}
                  data-testid="assistant-link"
                  onClick={handleOpen}
                  onAuxClick={(e) => {
                    // Only the middle mouse button (button 1) — let the
                    // browser's right-click context menu (button 2, fired as
                    // contextmenu, not auxClick) keep its default behavior
                    // so users can still "Copy Link Address".
                    if (e.button === 1) handleOpen(e);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleOpen(e);
                    }
                  }}
                  className="text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
      {openError !== null && (
        <p
          data-testid="assistant-link-error"
          role="alert"
          className="text-[11px] text-status-red"
        >
          Couldn&apos;t open link: {openError}
        </p>
      )}
    </div>
  );
}
