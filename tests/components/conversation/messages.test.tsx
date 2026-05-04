// Tests for conversation message components — T2.11.
//
// All five presentational components share the same shape: they accept
// already-parsed entry data (no IPC, no parsing) and render. We verify each
// one renders without console errors and surfaces the spec-required visual
// markers (testids + key text).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
