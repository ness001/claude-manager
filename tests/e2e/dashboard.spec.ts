// E2E spec: prove that the harness can detect the bugs documented in
// docs/research/2026-05-09-dashboard-bugs-rca.md. This is the "red" half
// of red-green: these tests are designed to FAIL against the current
// shipped code, then PASS after Bug 1 / Bug 2 / orphan-activation fixes
// land.
//
// Each test maps to a specific bug:
//   Bug 1 → "Active Since shows a real date"
//   Bug 2 → "ActivityChart's latest day is recent"
//   Bug 3 → "Quick Actions buttons are enabled and clickable"
//   Bug 4 → "System Health shows non-warn states for at least one indicator"
//
// Selectors prefer data-testid where available; fall back to role + name.

import { expect } from "@wdio/globals";

describe("Dashboard — real-data assertions (RCA bugs)", () => {
  before(async () => {
    // Diagnostics: print URL + body HTML head so we can see what context
    // tauri-driver actually attached to.
    const url = await browser.getUrl();
    console.log("[diag] browser.getUrl() =", url);
    const handles = await browser.getWindowHandles();
    console.log("[diag] window handles =", handles);
    const title = await browser.getTitle().catch((e) => `err: ${e.message}`);
    console.log("[diag] title =", title);
    const bodyHtml = await browser
      .execute(() => document.documentElement.outerHTML.slice(0, 500))
      .catch((e) => `err: ${e.message}`);
    console.log("[diag] html(0..500) =", bodyHtml);

    // Wait for app shell to mount.
    await browser.$("#root").waitForExist({ timeout: 15_000 });
  });

  it("Bug 1: Active Since stat shows a date, not '—'", async () => {
    // The StatCard for "Active Since" is the 4th card in DashboardSection,
    // accent color "mauve". We look up by visible label text.
    const card = await browser.$('//*[contains(text(), "Active Since")]/..');
    const value = await card.$("*=").getText().catch(() => "");
    // The stat-card value sibling — implementation puts it adjacent. We
    // assert against the entire card text containing a date pattern.
    const allText = await card.getText();
    expect(allText).not.toContain("—");
    expect(allText).toMatch(/\d{4}/); // some 4-digit year
  });

  it("Bug 2: ActivityChart's most recent X-axis label is within 7 days of today", async () => {
    const ticks = await browser.$$("svg .recharts-xAxis text");
    const labels: string[] = [];
    for (const t of ticks) labels.push(await t.getText());
    expect(labels.length).toBeGreaterThan(0);

    const last = labels[labels.length - 1] ?? "";
    const parsed = Date.parse(last);
    expect(Number.isFinite(parsed)).toBe(true);

    const ageDays = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
    expect(ageDays).toBeLessThan(8);
  });

  it("Bug 3: All Quick Actions buttons are enabled (not disabled placeholders)", async () => {
    const labels = ["New Session", "Resume Latest", "Open CWD", "Rebuild Stats"];
    for (const label of labels) {
      const btn = await browser.$(`button=${label}`);
      const exists = await btn.isExisting();
      expect(exists).toBe(true);
      const disabled = await btn.getAttribute("disabled");
      const ariaDisabled = await btn.getAttribute("aria-disabled");
      const isEnabled = disabled === null && ariaDisabled !== "true";
      expect(isEnabled).toBe(true);
    }
  });

  it("Bug 4: System Health shows at least one non-warn indicator (real data wired)", async () => {
    const dots = await browser.$$('[role="img"][aria-label*="status"]');
    const labels: (string | null)[] = [];
    for (const d of dots) labels.push(await d.getAttribute("aria-label"));
    expect(labels.length).toBeGreaterThanOrEqual(3);
    const allWarn = labels.every((l) => typeof l === "string" && l.toLowerCase().includes("warn"));
    expect(allWarn).toBe(false);
  });
});
