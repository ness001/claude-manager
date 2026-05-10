// Asserts that src/index.css respects the user's prefers-reduced-motion
// setting by suppressing the two decorative Tailwind animations the app
// actually uses (animate-pulse for status dots / starting state / skeletons,
// animate-spin for the refresh icon).
//
// We don't pull in a CSS parser — a plain text assertion is enough for a
// rule this small, mirrors how the codebase has handled CSS-as-product
// elsewhere (Tailwind classes are checked via className strings in tests),
// and keeps the test from depending on PostCSS/Tailwind tooling at test time.
//
// WCAG 2.3.3 (Animation from Interactions), 2.2.2 (Pause, Stop, Hide).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(
  resolve(__dirname, "../../src/index.css"),
  "utf8",
);

describe("index.css — prefers-reduced-motion", () => {
  it("declares an @media (prefers-reduced-motion: reduce) block", () => {
    // Tolerate either ordering of optional whitespace.
    expect(CSS).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  });

  it("suppresses Tailwind's animate-pulse inside the reduced-motion block", () => {
    // Find the reduced-motion block and assert it contains both selectors
    // and animation: none. Capturing the block content prevents a false
    // positive where the selectors appear elsewhere in the file.
    const match = CSS.match(
      /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([^}]*\{[^}]*\}[^}]*)\}/,
    );
    expect(match, "expected to find a reduced-motion @media block").not.toBeNull();
    const body = match![1];
    expect(body).toMatch(/\.animate-pulse/);
    expect(body).toMatch(/animation:\s*none/);
  });

  it("suppresses Tailwind's animate-spin inside the reduced-motion block", () => {
    const match = CSS.match(
      /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([^}]*\{[^}]*\}[^}]*)\}/,
    );
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toMatch(/\.animate-spin/);
  });
});
