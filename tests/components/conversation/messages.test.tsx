// Tests for conversation message components — T2.11.
//
// All five presentational components share the same shape: they accept
// already-parsed entry data (no IPC, no parsing) and render. We verify each
// one renders without console errors and surfaces the spec-required visual
// markers (testids + key text).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Mock @tauri-apps/plugin-shell so AssistantMessage's link click handler
// can call openShell() under jsdom without firing a real IPC.
const openShellMock = vi.fn();
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => openShellMock(...args),
}));

import { UserMessage } from "../../../src/components/conversation/UserMessage";
import { AssistantMessage } from "../../../src/components/conversation/AssistantMessage";
import { ToolCallBlock } from "../../../src/components/conversation/ToolCallBlock";
import { SystemDivider } from "../../../src/components/conversation/SystemDivider";
import { SummaryBanner } from "../../../src/components/conversation/SummaryBanner";

afterEach(() => cleanup());

function withConsoleErrors(fn: () => void): unknown[] {
  const errs: unknown[] = [];
  const orig = console.error;
  console.error = (...a) => {
    errs.push(a);
    orig(...a);
  };
  try {
    fn();
  } finally {
    console.error = orig;
  }
  return errs;
}

describe("UserMessage", () => {
  it("mounts without console errors", () => {
    expect(withConsoleErrors(() => render(<UserMessage text="hi" />))).toEqual(
      [],
    );
  });

  it("renders string content as-is (spec §11)", () => {
    render(<UserMessage text="hello world" />);
    expect(screen.getByTestId("user-message")).toHaveTextContent("hello world");
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("preserves whitespace from a multi-line string", () => {
    render(<UserMessage text={"line one\nline two"} />);
    expect(screen.getByTestId("user-message").textContent).toContain(
      "line one",
    );
    expect(screen.getByTestId("user-message").textContent).toContain(
      "line two",
    );
  });

  // WCAG 1.3.1 (Info and Relationships): the visible "You" label and the
  // message body were two adjacent siblings with no programmatic
  // relationship — AT users heard "You" as a free-floating uppercase
  // fragment, then unrelated prose. Promote to role="region" +
  // aria-labelledby pointing at the label span. Mirrors SummaryBanner.
  it("exposes role='region' labelled by the 'You' span (a11y)", () => {
    render(<UserMessage text="hi" />);
    const bubble = screen.getByTestId("user-message");
    expect(bubble.getAttribute("role")).toBe("region");
    const labelId = bubble.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const label = screen.getByTestId("user-message-label");
    expect(label.id).toBe(labelId);
    expect(label.textContent).toBe("You");
  });
});

describe("AssistantMessage", () => {
  it("mounts without console errors", () => {
    expect(
      withConsoleErrors(() => render(<AssistantMessage text="hello" />)),
    ).toEqual([]);
  });

  it("renders markdown via react-markdown", () => {
    render(<AssistantMessage text={"# Heading\n\nParagraph"} />);
    const md = screen.getByTestId("assistant-markdown");
    expect(md.querySelector("h1")?.textContent).toBe("Heading");
    expect(md.querySelector("p")?.textContent).toBe("Paragraph");
  });

  it("syntax-highlights a fenced code block", () => {
    render(
      <AssistantMessage text={"```js\nconst x = 1;\n```"} />,
    );
    // rehype-highlight emits hljs class names on the <code> element.
    const code = screen
      .getByTestId("assistant-markdown")
      .querySelector("pre code");
    expect(code).toBeTruthy();
    expect(code?.className).toMatch(/hljs/);
  });

  it("renders LaTeX math via KaTeX", () => {
    render(<AssistantMessage text={"Inline: $x^2$"} />);
    // KaTeX inserts elements with className containing "katex".
    const md = screen.getByTestId("assistant-markdown");
    expect(md.querySelector(".katex")).toBeTruthy();
  });

  it("shows the model badge when given", () => {
    render(<AssistantMessage text="x" model="claude-opus-4.6" />);
    expect(screen.getByTestId("assistant-model-badge")).toHaveTextContent(
      "claude-opus-4.6",
    );
  });

  it("hides the model badge when missing", () => {
    render(<AssistantMessage text="x" />);
    expect(screen.queryByTestId("assistant-model-badge")).not.toBeInTheDocument();
  });

  // Functional bug: ReactMarkdown without a custom <a> renderer turns markdown
  // links into a plain <a href>, which inside Tauri's WebView navigates the
  // ENTIRE app to that URL — there's no back button so the user loses their
  // session view. Hand the URL off to the OS via plugin-shell instead.
  it("clicking a link in assistant markdown opens via plugin-shell, not WebView nav", () => {
    openShellMock.mockReset().mockResolvedValue(undefined);
    render(
      <AssistantMessage
        text="See [Anthropic](https://www.anthropic.com) for details."
      />,
    );
    const link = screen.getByTestId("assistant-link");
    expect(link.getAttribute("href")).toBe("https://www.anthropic.com");
    const evt = fireEvent.click(link);
    // Default must be prevented so the WebView does not actually navigate.
    expect(evt).toBe(false);
    expect(openShellMock).toHaveBeenCalledWith("https://www.anthropic.com");
  });

  // WCAG 1.4.1 (Use of Color): links must be distinguishable from prose by
  // more than color. Underline + accent color is the standard affordance.
  it("assistant-message links are visibly underlined and accent-colored (WCAG 1.4.1)", () => {
    render(<AssistantMessage text="[a](https://example.com)" />);
    const link = screen.getByTestId("assistant-link");
    expect(link.className).toContain("underline");
    expect(link.className).toContain("text-accent");
  });
});

describe("ToolCallBlock", () => {
  it("mounts without console errors", () => {
    expect(
      withConsoleErrors(() =>
        render(<ToolCallBlock toolName="Bash" toolInput={{ cmd: "ls" }} />),
      ),
    ).toEqual([]);
  });

  it("shows the tool name and is collapsed by default", () => {
    render(<ToolCallBlock toolName="Bash" toolInput={{ cmd: "ls" }} />);
    expect(screen.getByTestId("tool-call-block")).toHaveTextContent("Bash");
    expect(screen.queryByTestId("tool-call-body")).not.toBeInTheDocument();
  });

  it("expands input + output on toggle", () => {
    render(
      <ToolCallBlock
        toolName="Bash"
        toolInput={{ cmd: "ls" }}
        toolOutput="file1\nfile2"
      />,
    );
    fireEvent.click(screen.getByTestId("tool-call-toggle"));
    const body = screen.getByTestId("tool-call-body");
    expect(body.textContent).toContain("cmd");
    expect(body.textContent).toContain("file1");
  });

  it("uses the error border + shows Error label when isError is true", () => {
    render(
      <ToolCallBlock
        toolName="Read"
        toolInput={{}}
        toolOutput="permission denied"
        isError
      />,
    );
    const block = screen.getByTestId("tool-call-block");
    expect(block.dataset.error).toBe("true");
    expect(block.className).toMatch(/border-l-status-red/);
    expect(block).toHaveTextContent("Error");
  });

  // WCAG 1.4.1 (Use of Color) + 4.1.2 (Name, Role, Value): when isError is
  // true, the only error signals were a red left border, a red badge, and
  // the bare word "Error" inline in the toggle button's accessible name —
  // so SR users hear "Read Error, button, collapsed", with "Error" reading
  // like an arbitrary part of the tool name. Color-only differentiation
  // also fails for color-blind users on light backgrounds. Promote the
  // badge to an explicit status icon: role="img" + a descriptive
  // aria-label override ("Tool call failed") so SR users get a discrete,
  // unambiguous error announcement instead of a stray "Error" word.
  // Visual rendering ("Error" pill in red) is unchanged.
  it("error badge exposes role=img + aria-label so SR users hear a discrete error indicator", () => {
    render(
      <ToolCallBlock
        toolName="Read"
        toolInput={{}}
        toolOutput="permission denied"
        isError
      />,
    );
    const badge = screen.getByTestId("tool-call-error-badge");
    expect(badge.getAttribute("role")).toBe("img");
    expect(badge.getAttribute("aria-label")).toBe("Tool call failed");
    // Visible text is preserved for sighted users.
    expect(badge.textContent).toBe("Error");
  });

  // Negative case: when isError is false (or undefined), no badge renders.
  // Guards against the bug where a stray badge with a "Tool call failed"
  // label could leak into successful tool calls.
  it("no error badge renders when isError is false/undefined", () => {
    render(<ToolCallBlock toolName="Bash" toolInput={{ cmd: "ls" }} />);
    expect(screen.queryByTestId("tool-call-error-badge")).toBeNull();
  });

  // Regression (WCAG 4.1.2): the chevron is decorative — the toolName <span>
  // already provides the toggle's accessible name. Without aria-hidden, some
  // screen readers announce the icon's computed name redundantly.
  it("hides the decorative chevron from assistive tech (aria-hidden)", () => {
    render(<ToolCallBlock toolName="Bash" toolInput={{ cmd: "ls" }} />);
    const toggle = screen.getByTestId("tool-call-toggle");
    const svg = toggle.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  // WAI-ARIA disclosure pattern (WCAG 1.3.1, 4.1.2): the toggle button declares
  // aria-expanded but previously had no aria-controls, so screen readers
  // couldn't tell the user *which* region was being expanded. The id must
  // (a) match the body's id when open and (b) be unique per instance so two
  // tool calls on the same page don't collide.
  it("toggle button has aria-controls pointing to the body id", () => {
    render(
      <ToolCallBlock
        toolName="Bash"
        toolInput={{ cmd: "ls" }}
        toolOutput="ok"
      />,
    );
    const toggle = screen.getByTestId("tool-call-toggle");
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    fireEvent.click(toggle);
    const body = screen.getByTestId("tool-call-body");
    expect(body.id).toBe(controls);
  });

  it("two ToolCallBlocks on the same page have distinct aria-controls ids", () => {
    render(
      <>
        <ToolCallBlock toolName="A" toolInput={{}} />
        <ToolCallBlock toolName="B" toolInput={{}} />
      </>,
    );
    const toggles = screen.getAllByTestId("tool-call-toggle");
    expect(toggles).toHaveLength(2);
    const a = toggles[0].getAttribute("aria-controls");
    const b = toggles[1].getAttribute("aria-controls");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  // WCAG 2.4.7 Focus Visible — keyboard users tabbing into a tool-call entry
  // need a visible focus indicator on the disclosure toggle (the only
  // interactive element in the block). Without focus-visible:ring, Tab
  // landed silently and users couldn't tell the toggle was focused before
  // pressing Enter/Space. Mirrors PRs #17/#45/#48/#49/#56/#57/#67/#111/#112/#113.
  it("toggle button has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<ToolCallBlock toolName="Bash" toolInput={{ cmd: "ls" }} />);
    const toggle = screen.getByTestId("tool-call-toggle");
    expect(toggle.className).toContain("focus-visible:ring-2");
    expect(toggle.className).toContain("focus-visible:ring-accent");
  });
});

describe("SystemDivider", () => {
  it("mounts without console errors", () => {
    expect(
      withConsoleErrors(() => render(<SystemDivider text="— Turn —" />)),
    ).toEqual([]);
  });

  it("renders a turn divider with the turn number injected", () => {
    render(<SystemDivider text="— Turn — 1500ms —" turnNumber={3} />);
    const d = screen.getByTestId("system-divider");
    expect(d.dataset.variant).toBe("turn");
    expect(d).toHaveTextContent(/Turn 3/);
    expect(d).toHaveTextContent(/1500ms/);
  });

  it("renders the compact-boundary variant with dashed style", () => {
    render(<SystemDivider text="--- Context compacted ---" />);
    const d = screen.getByTestId("system-divider");
    expect(d.dataset.variant).toBe("compact");
    expect(d).toHaveTextContent("Context compacted");
  });

  // WCAG 1.3.1 Info & Relationships — the divider is a thematic break in
  // the conversation stream. Without role="separator" + aria-label, screen
  // readers walk past the visual rule with no indication of structure
  // (turn boundary or compaction) and the decorative <div> borders are
  // pure presentation. Pair the role with aria-hidden on the visual rules
  // so the label is the single accessible announcement.
  it("turn variant exposes role=separator with the label as its accessible name (WCAG 1.3.1)", () => {
    render(<SystemDivider text="— Turn — 1500ms —" turnNumber={3} />);
    const d = screen.getByTestId("system-divider");
    expect(d.getAttribute("role")).toBe("separator");
    expect(d.getAttribute("aria-label")).toBe("— Turn 3 — 1500ms —");
  });

  // Regression for a pre-existing label-injection bug uncovered by the
  // aria-label assertion above: the previous chained-`replace` approach
  // matched "— Turn " a second time after the first pass had already
  // produced "— Turn N —", yielding "— Turn N N —" for both shapes.
  it("injects the turn number exactly once, even for the no-timing shape", () => {
    render(<SystemDivider text="— Turn —" turnNumber={3} />);
    const d = screen.getByTestId("system-divider");
    expect(d).toHaveTextContent("— Turn 3 —");
    expect(d).not.toHaveTextContent("Turn 3 3");
    expect(d.getAttribute("aria-label")).toBe("— Turn 3 —");
  });

  it("compact variant exposes role=separator with the label as its accessible name (WCAG 1.3.1)", () => {
    render(<SystemDivider text="--- Context compacted ---" />);
    const d = screen.getByTestId("system-divider");
    expect(d.getAttribute("role")).toBe("separator");
    expect(d.getAttribute("aria-label")).toBe("--- Context compacted ---");
  });

  it("decorative rule lines flanking the label are aria-hidden", () => {
    render(<SystemDivider text="— Turn —" turnNumber={1} />);
    const d = screen.getByTestId("system-divider");
    const rules = d.querySelectorAll("div[aria-hidden='true']");
    expect(rules).toHaveLength(2);
  });
});

describe("SummaryBanner", () => {
  it("mounts without console errors", () => {
    expect(
      withConsoleErrors(() => render(<SummaryBanner text="ok" />)),
    ).toEqual([]);
  });

  it("renders the summary text inside the highlighted banner", () => {
    render(<SummaryBanner text="we discussed X" />);
    const b = screen.getByTestId("summary-banner");
    expect(b).toHaveTextContent("Session summary");
    expect(b).toHaveTextContent("we discussed X");
  });
});
