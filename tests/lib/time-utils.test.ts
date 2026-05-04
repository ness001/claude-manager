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
  it('case 6: older than 7 days → "Mon DD" date string', () => {
    const t = new Date(2026, 0, 15, 10, 0, 0).getTime(); // 2026-01-15
    const result = timeAgo(t);
    // Allow either localised format, but require it contain "Jan" + "15".
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/15/);
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
