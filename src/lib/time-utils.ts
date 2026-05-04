// Shared "X time ago" formatter — used by SessionCard (T2.9) and
// RecentSessions (T2.12). Single source of truth so the two views stay in
// sync.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Convert an epoch-millisecond timestamp into a short relative string.
 *   < 60s         → "just now"
 *   < 60 min      → "Nm ago"
 *   same day      → "Nh ago"
 *   prev. day     → "Yesterday"
 *   < 7 days      → "Nd ago"
 *   ≥ 7 days      → "Mon DD"
 *
 * Falsy/NaN input → "". Future timestamps are clamped to "just now".
 */
export function timeAgo(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return "";

  const now = Date.now();
  const deltaMs = now - timestamp;

  // Future → clamp.
  if (deltaMs < 0) return "just now";

  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  // Beyond an hour, switch to calendar-day arithmetic so that crossing
  // midnight reads as "Yesterday" instead of "23h ago".
  const nowDate = new Date(now);
  const tsDate = new Date(timestamp);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDelta = Math.floor(
    (startOfDay(nowDate) - startOfDay(tsDate)) / (24 * 3600_000),
  );

  if (dayDelta === 0) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
  if (dayDelta === 1) return "Yesterday";
  if (dayDelta < 7) return `${dayDelta}d ago`;
  return `${MONTHS[tsDate.getMonth()]} ${tsDate.getDate()}`;
}
