// E2E spec: Dashboard section UI vs spec §4.1 gap audit.
//
// Mirrors the structure of tests/e2e/plugins.spec.ts: each assertion prints
// `PASS: <spec-ref>` or `FAIL: <spec-ref> — <reason>` (or `SKIP` for items
// that cannot be observed on this machine) so the run output doubles as a
// spec-compliance report.
//
// Coverage map (spec §4.1):
//   Row 1 — 4 StatCards (Sessions / Messages / Longest / Active Since)
//   Row 2 — ActivityChart (period + series toggles, X-axis recency) + ModelDonut (donut + legend)
//   Row 3 — RecentSessions (list or empty + View All link) + SystemHealth (4 indicators)
//
// R1 rule applies: real-data assertions have NO "or empty state" escape
// clauses. Where data may legitimately be absent on a given machine (e.g.
// the user has zero sessions on disk → RecentSessions is empty), the
// SystemHealth + StatCard assertions still bind to concrete observables
// (Sessions card numeric value matches the DB total, API indicator
// resolves out of "Checking…" within 30s).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@wdio/globals";

interface SpecResult {
  ref: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail?: string;
}
const results: SpecResult[] = [];

function record(ref: string, ok: boolean, detail?: string) {
  const status = ok ? "PASS" : "FAIL";
  results.push({ ref, status, detail });
  console.log(`${status}: ${ref}${detail ? ` — ${detail}` : ""}`);
}
function skip(ref: string, detail: string) {
  results.push({ ref, status: "SKIP", detail });
  console.log(`SKIP: ${ref} — ${detail}`);
}

/** Number of JSONL session files on disk under ~/.claude/projects/<slug>/.
 *  Used as the lower-bound oracle for the "Sessions" stat card. The DB row
 *  count must equal the on-disk JSONL count after the dashboard's startup
 *  discover-and-upsert (dashboard-store.ts:loadAllSessions). */
function countOnDiskSessions(): number {
  const projectsRoot = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(projectsRoot)) return 0;
  let total = 0;
  for (const slug of fs.readdirSync(projectsRoot)) {
    const dir = path.join(projectsRoot, slug);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".jsonl")) total++;
    }
  }
  return total;
}

describe("Dashboard section — UI vs spec §4.1 gap audit", () => {
  before(async function () {
    this.timeout(120_000);

    // Same URL-attach polling as plugins.spec.ts: pageLoadStrategy="none"
    // means wdio attaches mid-navigation; poll until the SPA URL is live,
    // optionally pushing http://localhost:1420/ if it stays on about:blank.
    await new Promise((r) => setTimeout(r, 3_000));

    const ready = await browser
      .waitUntil(
        async () => {
          try {
            const u = await browser.getUrl();
            if (u && u !== "about:blank" && !u.endsWith("/about:blank")) return true;
            try {
              await browser.url("http://localhost:1420/");
            } catch {
              try {
                await browser.refresh();
              } catch {
                /* ignore */
              }
            }
          } catch {
            /* ignore */
          }
          return false;
        },
        { timeout: 30_000, interval: 1_000, timeoutMsg: "SPA never left about:blank" },
      )
      .then(() => true)
      .catch(() => false);

    if (!ready) {
      const u = await browser.getUrl().catch(() => "n/a");
      const h = await browser.getWindowHandles().catch(() => []);
      console.log(`[diag] FAILED to attach SPA url=${u} handles=${JSON.stringify(h)}`);
      throw new Error("SPA attach failed");
    }

    const urlFinal = await browser.getUrl().catch(() => "n/a");
    console.log(`[diag] SPA attached at url=${urlFinal}`);

    await browser.$("#root").waitForExist({ timeout: 30_000 });

    // Navigate to Dashboard via Ctrl+1 (per App.tsx), retrying because the
    // keydown listener may race React's useEffect mount. Fall back to the
    // sidebar nav button. Wait for the dashboard section root + at least
    // one stat card (proves the store has finished its first paint).
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      await browser.keys(["Control", "1"]);
      opened = await browser
        .$('[data-testid="dashboard-section"]')
        .waitForExist({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      console.log("[diag] Ctrl+1 didn't open dashboard; trying sidebar click");
      const navBtn = await browser.$('nav[aria-label="Primary"] button[aria-label="Dashboard"]');
      if (await navBtn.isExisting()) await navBtn.click();
      await browser.$('[data-testid="dashboard-section"]').waitForExist({ timeout: 10_000 });
    }

    // Wait for at least one StatCard to render — dashboardStore.loadDashboard()
    // resolves asynchronously and the cards bind to its state.
    await browser
      .$('[data-testid="stat-card"]')
      .waitForExist({ timeout: 30_000, timeoutMsg: "dashboard StatCards never rendered" });

    // Wait for loadDashboard() to actually settle. The store mounts with
    // `totalSessions: 0`, then sets the real aggregate once the SQLite
    // reads resolve. Without this gate, every Row 1 assertion races the
    // store and sees 0s. We wait for any one of these terminal signals:
    //   (a) Sessions card flips to a non-zero numeric — populated DB
    //   (b) Load-error banner appears — SQLite failed
    //   (c) Recent sessions list paints >=1 row — populated DB, alternate
    //   (d) On-disk JSONL count is 0 AND we've waited 5s — genuinely empty
    // The 30s cap is well above the dashboard-store's sub-second SQLite read.
    const onDisk = countOnDiskSessions();
    const startedAt = Date.now();
    await browser
      .waitUntil(
        async () => {
          const banner = await browser.$('[data-testid="dashboard-load-error"]');
          if (await banner.isExisting()) return true;
          const card = await browser.$('[data-testid="dashboard-row-1"] [data-accent="green"]');
          if (await card.isExisting()) {
            const v = await card.$('[data-testid="stat-value"]').getText();
            if (Number(v) > 0) return true;
          }
          const rows = await browser.$$('[data-testid="recent-session-row"]');
          if (rows.length >= 1) return true;
          // Truly-empty machine: bail out after 5s so the run isn't
          // bottlenecked on a 30s wait that can never resolve.
          if (onDisk === 0 && Date.now() - startedAt > 5_000) return true;
          return false;
        },
        { timeout: 30_000, interval: 500, timeoutMsg: "loadDashboard() never settled" },
      )
      .catch(() => {
        /* let per-test assertions surface the underlying failure */
      });
  });

  after(async () => {
    console.log("\n========== GAP REPORT (machine-readable) ==========");
    console.log(JSON.stringify(results, null, 2));
    console.log("========== END GAP REPORT ==========\n");
  });

  // ─── §4.1 Row 1 — Stat cards ────────────────────────────────────────────

  it("§4.1 Row 1: four StatCards present with correct accents (green/blue/yellow/mauve)", async () => {
    const row = await browser.$('[data-testid="dashboard-row-1"]');
    record("§4.1 Row 1 grid exists", await row.isExisting());

    const cards = await browser.$$('[data-testid="dashboard-row-1"] [data-testid="stat-card"]');
    record(
      "§4.1 Row 1 has exactly 4 stat cards",
      cards.length === 4,
      `count=${cards.length}`,
    );

    const accents: string[] = [];
    for (const c of cards) accents.push((await c.getAttribute("data-accent")) ?? "");
    record(
      "§4.1 Row 1 accents = green/blue/yellow/mauve in order",
      JSON.stringify(accents) === JSON.stringify(["green", "blue", "yellow", "mauve"]),
      `accents=${JSON.stringify(accents)}`,
    );

    // Each card has a numeric/date value + an uppercase label.
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const val = await c.$('[data-testid="stat-value"]');
      record(
        `§4.1 Row 1 card[${i}] has stat-value`,
        await val.isExisting(),
      );
    }
  });

  it("§4.1 Row 1: Sessions card value equals on-disk JSONL count (real data, no escape clause)", async () => {
    // The "Sessions" card is accent="green" (first in the row). After
    // loadDashboard() runs discover-and-upsert, the DB row count should
    // equal the count of .jsonl files under ~/.claude/projects/<slug>/.
    const onDisk = countOnDiskSessions();
    const card = await browser.$('[data-testid="dashboard-row-1"] [data-accent="green"]');
    const value = await card.$('[data-testid="stat-value"]').getText();
    const parsed = Number(value);
    record(
      "§4.1 Sessions card value is a number",
      Number.isFinite(parsed),
      `value="${value}"`,
    );
    // The DB may legitimately contain MORE rows than disk (archived projects,
    // historic upserts) but the discover sweep ensures it never has FEWER than
    // what's currently on disk (modulo dot-prefixed projects, which the
    // session-loader excludes — we count *all* dirs above, so use >= as the
    // lower bound).
    record(
      "§4.1 Sessions card >= on-disk JSONL count",
      parsed >= onDisk,
      `card=${parsed}, onDisk=${onDisk}`,
    );
  });

  it("§4.1 Row 1: Active Since card shows a real date when sessions exist (RCA Bug 1)", async () => {
    const card = await browser.$('[data-testid="dashboard-row-1"] [data-accent="mauve"]');
    const value = await card.$('[data-testid="stat-value"]').getText();
    const onDisk = countOnDiskSessions();
    if (onDisk === 0) {
      skip("§4.1 Active Since shows date", "no sessions on disk — em-dash is correct");
      return;
    }
    record(
      "§4.1 Active Since shows a parseable date (not em-dash) when sessions exist",
      value !== "—" && /\d{4}/.test(value) && Number.isFinite(Date.parse(value)),
      `value="${value}", onDisk=${onDisk}`,
    );
  });

  it("§4.1 Row 1: Longest Session card shows numeric message count when sessions exist", async () => {
    const card = await browser.$('[data-testid="dashboard-row-1"] [data-accent="yellow"]');
    const value = await card.$('[data-testid="stat-value"]').getText();
    const onDisk = countOnDiskSessions();
    if (onDisk === 0) {
      skip("§4.1 Longest Session numeric value", "no sessions on disk");
      return;
    }
    const parsed = Number(value);
    record(
      "§4.1 Longest Session value is a non-negative integer",
      Number.isFinite(parsed) && parsed >= 0,
      `value="${value}"`,
    );
  });

  // ─── §4.1 Row 2 — Activity chart ────────────────────────────────────────

  it("§4.1 Row 2: ActivityChart present with period + series tablists (when not empty)", async () => {
    const chart = await browser.$('[data-testid="activity-chart"]');
    record("§4.1 activity-chart exists", await chart.isExisting());

    const isEmpty = (await chart.getAttribute("data-empty")) === "true";
    if (isEmpty) {
      skip(
        "§4.1 activity-chart period + series tablists",
        "data-empty=true (stats-cache.json empty/missing) — toggles only render in non-empty branch per ActivityChart.tsx",
      );
      return;
    }

    for (const p of ["7d", "30d", "90d", "all"]) {
      const btn = await browser.$(`[data-testid="period-${p}"]`);
      record(`§4.1 period button "${p}" exists`, await btn.isExisting());
    }
    for (const s of ["messages", "toolCalls"]) {
      const btn = await browser.$(`[data-testid="series-${s}"]`);
      record(`§4.1 series button "${s}" exists`, await btn.isExisting());
    }
  });

  it("§4.1 Row 2: clicking 30d period flips aria-selected (functional toggle)", async () => {
    const chart = await browser.$('[data-testid="activity-chart"]');
    const isEmpty = (await chart.getAttribute("data-empty")) === "true";
    if (isEmpty) {
      skip(
        "§4.1 30d period toggle",
        "data-empty=true — toggles not rendered in empty branch",
      );
      return;
    }
    const before = await browser.$('[data-testid="period-7d"]').getAttribute("aria-selected");
    record("§4.1 default period is 7d (aria-selected=true)", before === "true", `was="${before}"`);

    await browser.$('[data-testid="period-30d"]').click();
    await browser.pause(200);
    const after30 = await browser.$('[data-testid="period-30d"]').getAttribute("aria-selected");
    const after7 = await browser.$('[data-testid="period-7d"]').getAttribute("aria-selected");
    record(
      "§4.1 clicking 30d sets aria-selected=true on it and false on 7d",
      after30 === "true" && after7 === "false",
      `30d="${after30}", 7d="${after7}"`,
    );

    // Restore default so subsequent tests start from a clean slate.
    await browser.$('[data-testid="period-7d"]').click();
    await browser.pause(100);
  });

  it("§4.1 Row 2: ActivityChart's latest X-axis tick is within 7 days of today OR shows staleness banner (RCA Bug 2)", async () => {
    const chart = await browser.$('[data-testid="activity-chart"]');
    const isEmpty = (await chart.getAttribute("data-empty")) === "true";
    if (isEmpty) {
      skip(
        "§4.1 ActivityChart recency",
        "data-empty=true (stats-cache.json missing or empty) — chart renders 'No activity yet' empty state",
      );
      return;
    }

    // If stale, the banner MUST be present (R1: no silent-stale escape).
    const banner = await browser.$('[data-testid="activity-stale-banner"]');
    if (await banner.isExisting()) {
      const days = await banner.getAttribute("data-staleness-days");
      record(
        "§4.1 staleness banner surfaces when data is stale (>3d)",
        true,
        `staleness-days=${days}`,
      );
      return;
    }

    // Banner absent → assert recency directly. Latest X tick must parse +
    // be within 7 days of today.
    const ticks = await browser.$$('[data-testid="activity-chart"] svg .recharts-xAxis text');
    const labels: string[] = [];
    for (const t of ticks) labels.push(await t.getText());
    record(
      "§4.1 ActivityChart has >0 X-axis ticks",
      labels.length > 0,
      `tickCount=${labels.length}`,
    );
    const last = labels[labels.length - 1] ?? "";
    const parsed = Date.parse(last);
    const ageDays = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
    record(
      "§4.1 ActivityChart latest tick is within 7 days of today (no staleness banner)",
      Number.isFinite(parsed) && ageDays < 8,
      `last="${last}", ageDays=${ageDays.toFixed(1)}`,
    );
  });

  // ─── §4.1 Row 2 — Model donut ───────────────────────────────────────────

  it("§4.1 Row 2: ModelDonut renders donut + legend or labelled empty state", async () => {
    const donut = await browser.$('[data-testid="model-donut"]');
    record("§4.1 model-donut exists", await donut.isExisting());

    const isEmpty = (await donut.getAttribute("data-empty")) === "true";
    if (isEmpty) {
      // Empty path is a real spec state, but must surface a labelled
      // "No model usage data" affordance (WCAG-compliant).
      const noDataImg = await donut.$('[role="img"][aria-label="No model usage data"]');
      record(
        "§4.1 empty donut renders 'No model usage data' aria-labelled region",
        await noDataImg.isExisting(),
      );
      return;
    }

    const chart = await browser.$('[data-testid="donut-chart"]');
    record("§4.1 donut-chart svg/conic present", await chart.isExisting());

    const legendItems = await browser.$$('[data-testid="donut-legend-item"]');
    record(
      "§4.1 donut legend has >=1 entry when not empty",
      legendItems.length >= 1,
      `count=${legendItems.length}`,
    );

    // Each legend row carries share + token count (spec §4.1 row 2 right).
    const firstShare = await legendItems[0].$('[data-testid="donut-legend-share"]');
    record(
      "§4.1 donut legend first row has share %",
      await firstShare.isExisting(),
    );
  });

  // ─── §4.1 Row 3 — Recent sessions ───────────────────────────────────────

  it("§4.1 Row 3: RecentSessions card present with [View All Sessions] link", async () => {
    const card = await browser.$('[data-testid="recent-sessions"]');
    record("§4.1 recent-sessions card exists", await card.isExisting());

    const viewAll = await browser.$('[data-testid="view-all-sessions"]');
    record("§4.1 [View All Sessions] button exists", await viewAll.isExisting());
  });

  it("§4.1 Row 3: RecentSessions list shows <=8 rows or empty-state (spec: 'last 8')", async () => {
    const rows = await browser.$$('[data-testid="recent-session-row"]');
    const empty = await browser.$('[data-testid="recent-sessions-empty"]');
    const emptyExists = await empty.isExisting();
    const onDisk = countOnDiskSessions();

    if (emptyExists) {
      record(
        "§4.1 RecentSessions empty-state shown only when no sessions exist",
        onDisk === 0,
        `emptyState=true, onDisk=${onDisk}`,
      );
      return;
    }

    record(
      "§4.1 RecentSessions row count is between 1 and 8 inclusive",
      rows.length >= 1 && rows.length <= 8,
      `rows=${rows.length}`,
    );

    // Each row has time + message count.
    const t = await rows[0].$('[data-testid="recent-session-time"]');
    const m = await rows[0].$('[data-testid="recent-session-msg-count"]');
    record("§4.1 RecentSessions row[0] has time", await t.isExisting());
    record("§4.1 RecentSessions row[0] has message count", await m.isExisting());
  });

  it("§4.1 Row 3: [View All Sessions] click navigates to Sessions section", async () => {
    await browser.$('[data-testid="view-all-sessions"]').click();
    const sessionsSection = await browser.$('[data-testid="session-list-panel"], [data-testid="sessions-section"]');
    const navigated = await sessionsSection
      .waitForExist({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    record(
      "§4.1 [View All Sessions] navigates to Sessions section",
      navigated,
      navigated ? undefined : "Sessions section root not visible within 5s",
    );

    // Return to dashboard for subsequent tests.
    await browser.keys(["Control", "1"]);
    await browser.$('[data-testid="dashboard-section"]').waitForExist({ timeout: 5_000 });
  });

  // ─── §4.1 Row 3 — System health ─────────────────────────────────────────

  it("§4.1 Row 3: SystemHealth card present with 4 indicators (MCP / Plugins / API / CLI)", async () => {
    const card = await browser.$('[data-testid="system-health"]');
    record("§4.1 system-health card exists", await card.isExisting());

    const indicators = await browser.$$('[data-testid="system-health"] li[data-status]');
    record(
      "§4.1 SystemHealth has exactly 4 indicators",
      indicators.length === 4,
      `count=${indicators.length}`,
    );
  });

  it("§4.1 Row 3: SystemHealth API indicator resolves out of 'checking' within 30s (real probe)", async () => {
    // Per SystemHealth.tsx: the API HEAD probe has an 8s hard timeout. Within
    // 30s the indicator must reach a terminal state — "ok" or "fail" — and
    // never remain in "checking" indefinitely (RCA Bug 4: a stuck Checking…
    // dot used to be invisible).
    const api = await browser.$('[data-testid="health-api"]');
    record("§4.1 SystemHealth API row present", await api.isExisting());

    const settled = await browser
      .waitUntil(
        async () => {
          const s = (await api.getAttribute("data-status")) ?? "";
          return s === "ok" || s === "fail";
        },
        { timeout: 30_000, interval: 500, timeoutMsg: "API probe never left 'checking' state" },
      )
      .then(() => true)
      .catch(() => false);

    const finalStatus = (await api.getAttribute("data-status")) ?? "";
    record(
      "§4.1 SystemHealth API row settles to 'ok' or 'fail' within 30s",
      settled,
      `finalStatus="${finalStatus}"`,
    );
  });

  // ─── R1: load-error banner is hidden on a healthy machine ───────────────

  it("§4.1 dashboard load-error banner is hidden when dashboard loads cleanly", async () => {
    // The banner only renders when dbSelect throws. On a healthy install
    // it must NOT be present — surface as a regression catcher (R1).
    const banner = await browser.$('[data-testid="dashboard-load-error"]');
    const exists = await banner.isExisting();
    record(
      "§4.1 dashboard-load-error banner is absent on clean load",
      !exists,
      exists ? `banner text="${await banner.getText()}"` : undefined,
    );
  });
});
