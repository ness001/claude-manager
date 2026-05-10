import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeAgo } from "../../src/lib/time-utils";

// Anchor "now" to a fixed local time so calendar-boundary cases are
// deterministic. Pick mid-afternoon to avoid the day rolling underneath us.
const NOW = new Date(2026, 4, 4, 14, 0, 0); // 2026-05-04 14:00:00 local

describe("time-utils.timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // case 1: 30 seconds ago → "just now"
  it('case 1: 30s ago → "just now"', () => {
    expect(timeAgo(NOW.getTime() - 30_000)).toBe("just now");
  });

  // case 2: 5 minutes ago → "5m ago"
  it('case 2: 5min ago → "5m ago"', () => {
    expect(timeAgo(NOW.getTime() - 5 * 60_000)).toBe("5m ago");
  });

  // case 3: 2 hours ago → "2h ago"
  it('case 3: 2h ago → "2h ago"', () => {
    expect(timeAgo(NOW.getTime() - 2 * 3600_000)).toBe("2h ago");
  });

  // case 4: yesterday (calendar boundary) → "Yesterday"
  it('case 4: calendar-yesterday → "Yesterday"', () => {
    // 2026-05-03 23:00:00 local — 15h before NOW but on the previous day.
    const yesterday = new Date(2026, 4, 3, 23, 0, 0);
    expect(timeAgo(yesterday.getTime())).toBe("Yesterday");
  });

  // case 5: 3 days ago → "3d ago"
  it('case 5: 3 days ago → "3d ago"', () => {
    const t = new Date(2026, 4, 1, 14, 0, 0).getTime(); // 2026-05-01
    expect(timeAgo(t)).toBe("3d ago");
  });

  // case 6: older than 7 days → date string (e.g. "Jan 15")
  it('case 6: older than 7 days, current year → "Mon DD" (no year)', () => {
    const t = new Date(2026, 0, 15, 10, 0, 0).getTime(); // 2026-01-15
    const result = timeAgo(t);
    // Allow either localised format, but require it contain "Jan" + "15".
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/15/);
    // Regression guard: must NOT include the current year.
    expect(result).not.toMatch(/2026/);
  });

  // case 6b: prior calendar year → year suffix is appended so the user
  // can distinguish e.g. Dec 2024 from Dec 2025 from Dec 2026 (spec-9).
  it('case 6b: prior calendar year → "Mon DD, YYYY"', () => {
    const t = new Date(2024, 11, 15, 10, 0, 0).getTime(); // 2024-12-15
    expect(timeAgo(t)).toBe("Dec 15, 2024");
  });

  // case 6c: Dec 31 of the previous year (one day across the boundary
  // beyond the 7-day window) — must include the year.
  it('case 6c: Dec 31 of prior year → "Dec 31, YYYY"', () => {
    const t = new Date(2025, 11, 31, 10, 0, 0).getTime(); // 2025-12-31
    expect(timeAgo(t)).toBe("Dec 31, 2025");
  });

  // case 6d: far-past year is not collapsed — explicit year keeps
  // the user honest about how stale a record is.
  it('case 6d: far-past year keeps explicit year', () => {
    const t = new Date(2019, 5, 4, 10, 0, 0).getTime(); // 2019-06-04
    expect(timeAgo(t)).toBe("Jun 4, 2019");
  });

  // case 7: falsy / NaN inputs → ""
  it('case 7: falsy/NaN inputs → ""', () => {
    expect(timeAgo(0)).toBe("");
    expect(timeAgo(Number.NaN)).toBe("");
    expect(timeAgo(undefined as unknown as number)).toBe("");
  });

  // case 8: future timestamp clamped to "just now"
  it('case 8: future timestamp clamped to "just now"', () => {
    expect(timeAgo(NOW.getTime() + 60_000)).toBe("just now");
  });
});
