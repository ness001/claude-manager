// E2E spec: Plugins section UI vs spec §6 gap audit.
//
// Scope is intentionally restricted to the `example-skills@anthropic-agent-skills`
// plugin so any test that mutates `~/.claude/settings.json` (e.g. toggle) only
// touches one entry, which we snapshot + restore in before/after hooks.
//
// Each assertion prints `PASS: <spec-ref>` or `FAIL: <spec-ref> — <reason>` so
// the run output doubles as a spec-compliance report.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@wdio/globals";

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const INSTALLED_PLUGINS_PATH = path.join(
  os.homedir(),
  ".claude",
  "plugins",
  "installed_plugins.json",
);
const TARGET_KEY = "example-skills@anthropic-agent-skills";

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

function readSettings(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as Record<string, unknown>;
}
function readEnabledForTarget(): boolean | undefined {
  const s = readSettings();
  const map = s["enabledPlugins"] as Record<string, boolean> | undefined;
  return map?.[TARGET_KEY];
}

let originalEnabled: boolean | undefined;

describe("Plugins section — UI vs spec §6 gap audit", () => {
  before(async function () {
    this.timeout(120_000);
    originalEnabled = readEnabledForTarget();
    console.log(`[setup] original ${TARGET_KEY} enabled = ${originalEnabled}`);

    // Driver attaches to the WebView2 instance racing against SPA load.
    // pageLoadStrategy="none" means wdio doesn't wait for any onload.
    // Give the SPA a beat, then poll URL until it's the dev URL; if it
    // stays on about:blank, explicitly navigate.
    await new Promise((r) => setTimeout(r, 3_000));

    const ready = await browser.waitUntil(
      async () => {
        try {
          const u = await browser.getUrl();
          if (u && u !== "about:blank" && !u.endsWith("/about:blank")) return true;
          // Still on about:blank — try to push it.
          try {
            await browser.url("http://localhost:1420/");
          } catch {
            /* tauri:// scheme may reject — try refresh */
            try { await browser.refresh(); } catch { /* ignore */ }
          }
        } catch {
          /* session may briefly be disconnected during navigation */
        }
        return false;
      },
      { timeout: 30_000, interval: 1_000, timeoutMsg: "SPA never left about:blank" },
    ).then(() => true).catch(() => false);

    if (!ready) {
      const u = await browser.getUrl().catch(() => "n/a");
      const h = await browser.getWindowHandles().catch(() => []);
      console.log(`[diag] FAILED to attach SPA url=${u} handles=${JSON.stringify(h)}`);
      throw new Error("SPA attach failed");
    }

    const urlFinal = await browser.getUrl().catch(() => "n/a");
    console.log(`[diag] SPA attached at url=${urlFinal}`);

    await browser.$("#root").waitForExist({ timeout: 30_000 });

    // Navigate to Plugins section. Ctrl+3 (per App.tsx) sometimes loses
    // the race against React's useEffect mounting the keydown listener,
    // so try a few times and fall back to clicking the sidebar nav button
    // by its visible aria-label.
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      await browser.keys(["Control", "3"]);
      opened = await browser
        .$('[data-testid="plugin-list-view"]')
        .waitForExist({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      console.log(`[diag] Ctrl+3 didn't open plugins; trying sidebar click`);
      const navBtn = await browser.$('nav[aria-label="Primary"] button[aria-label="Plugins"]');
      if (await navBtn.isExisting()) {
        await navBtn.click();
      } else {
        const fullHtml = await browser
          .execute(() => document.body.innerHTML.replace(/\s+/g, " ").slice(0, 2000))
          .catch(() => "n/a");
        console.log(`[diag] body HTML (one line): ${JSON.stringify(fullHtml)}`);
      }
      await browser.$('[data-testid="plugin-list-view"]').waitForExist({ timeout: 10_000 });
    }
  });

  after(async () => {
    // Restore enabledPlugins[TARGET_KEY] to its original value if any test
    // flipped it. Best-effort — never throw out of after().
    try {
      if (originalEnabled === undefined) return;
      const s = readSettings();
      const map = (s["enabledPlugins"] as Record<string, boolean>) ?? {};
      if (map[TARGET_KEY] !== originalEnabled) {
        map[TARGET_KEY] = originalEnabled;
        s["enabledPlugins"] = map;
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2) + "\n");
        console.log(`[teardown] restored ${TARGET_KEY} enabled = ${originalEnabled}`);
      }
    } catch (e) {
      console.log(`[teardown] restore failed: ${(e as Error).message}`);
    }

    console.log("\n========== GAP REPORT (machine-readable) ==========");
    console.log(JSON.stringify(results, null, 2));
    console.log("========== END GAP REPORT ==========\n");
  });

  // ─── §6.5 List view header ──────────────────────────────────────────────

  it("§6.5 header has title, three counts, Install/Check-Updates/Log buttons, search", async () => {
    const heading = await browser.$('[data-testid="plugin-list-view"] h1');
    record("§6.5 title", await heading.isExisting() && (await heading.getText()) === "Plugins");

    const installed = await browser.$('[data-testid="stat-installed"]');
    const active = await browser.$('[data-testid="stat-active"]');
    const disabled = await browser.$('[data-testid="stat-disabled"]');
    record("§6.5 installed count", await installed.isExisting());
    record("§6.5 active count", await active.isExisting());
    record("§6.5 disabled count", await disabled.isExisting());

    const install = await browser.$('[data-testid="install-plugin-btn"]');
    record("§6.5 [Install Plugin] button exists", await install.isExisting());

    const checkUpdates = await browser.$('[data-testid="check-updates-btn"]');
    record("§6.5 [Check for Updates] button exists", await checkUpdates.isExisting());

    const log = await browser.$('[data-testid="plugins-log-btn"]');
    record(
      "§6.5 [Log] button exists (new requirement, §6.8)",
      await log.isExisting(),
      "If FAIL: Log button per §6.8 is not implemented yet",
    );

    const search = await browser.$('[data-testid="plugin-search"]');
    record("§6.5 search box exists", await search.isExisting());
  });

  // ─── §6.7 [Install Plugin] functional behavior (A2) ─────────────────────

  it("§6.7 [Install Plugin] click opens a name prompt and is NOT a CLI-only stub", async () => {
    const install = await browser.$('[data-testid="install-plugin-btn"]');
    const ariaDisabled = await install.getAttribute("aria-disabled");
    const nativeDisabled = await install.getAttribute("disabled");
    const isStub = ariaDisabled === "true" || nativeDisabled !== null;
    record(
      "§6.7 [Install Plugin] is interactive (A2 decision)",
      !isStub,
      isStub ? "currently disabled stub: tooltip points users to CLI" : undefined,
    );

    if (isStub) {
      skip("§6.7 [Install Plugin] click opens name prompt", "button is disabled stub");
    } else {
      await install.click();
      const prompt = await browser.$('[data-testid="install-plugin-prompt"]');
      record("§6.7 [Install Plugin] click opens name prompt", await prompt.isExisting());
      // Try to close it so subsequent tests aren't blocked by a modal.
      const cancel = await browser.$('[data-testid="install-plugin-cancel"]');
      if (await cancel.isExisting()) await cancel.click();
    }
  });

  // ─── §6.7 [Check for Updates] functional behavior ───────────────────────

  it("§6.7 [Check for Updates] click triggers a check (spinner + finishes)", async () => {
    const btn = await browser.$('[data-testid="check-updates-btn"]');
    const disabledBefore = await btn.getAttribute("disabled");
    if (disabledBefore !== null) {
      skip("§6.7 [Check for Updates] click", "button is disabled (no plugins?)");
      return;
    }
    await btn.click();
    // Either the button shows aria-busy="true" briefly OR the network call
    // resolves before we sample — either way assert it returns to an
    // interactive state within 30s.
    let busy = false;
    try {
      busy = (await btn.getAttribute("aria-busy")) === "true";
    } catch {
      /* ignore */
    }
    await browser.waitUntil(
      async () => (await btn.getAttribute("aria-busy")) !== "true",
      { timeout: 30_000, timeoutMsg: "check-for-updates never finished" },
    );
    record(
      "§6.7 [Check for Updates] click runs and completes (cache forced)",
      true,
      busy ? "observed aria-busy during run" : "finished within sampling window",
    );

    const err = await browser.$('[data-testid="check-updates-error"]');
    if (await err.isExisting()) {
      const msg = await err.getText();
      console.log(`[diag] check-updates surfaced error: ${msg}`);
    }
  });

  // ─── §6.5 PluginCard surface ────────────────────────────────────────────

  it("§6.5 example-skills card shows status dot, name, marketplace, version, counts, toggle", async () => {
    const cardSel = `[data-testid="plugin-card"][data-plugin-key="${TARGET_KEY}"]`;
    const card = await browser.$(cardSel);
    record("§6.5 example-skills card present", await card.isExisting());

    record("§6.5 card status dot", await card.$('[data-testid="status-dot"]').isExisting());
    record("§6.5 card version pill", await card.$('[data-testid="version-pill"]').isExisting());
    record(
      "§6.5 card marketplace label",
      await card.$('[data-testid="marketplace-label"]').isExisting(),
    );
    record(
      "§6.5 card description",
      await card.$('[data-testid="plugin-description"]').isExisting(),
    );
    record("§6.5 card skill count", await card.$('[data-testid="skill-count"]').isExisting());
    record("§6.5 card agent count", await card.$('[data-testid="agent-count"]').isExisting());
    record("§6.5 card hook count", await card.$('[data-testid="hook-count"]').isExisting());
    record("§6.5 card enable toggle", await card.$('[data-testid="enable-toggle"]').isExisting());
  });

  // ─── §6.5 Search filter (functional) ────────────────────────────────────

  it("§6.5 search filters by name (functional: typing reduces visible cards)", async () => {
    const search = await browser.$('[data-testid="plugin-search"]');
    const before = await browser.$$('[data-testid="plugin-card"]');
    const countBefore = before.length;
    await search.setValue("example-skills");
    await browser.pause(300);
    const after = await browser.$$('[data-testid="plugin-card"]');
    const countAfter = after.length;
    record(
      "§6.5 search reduces visible cards when query matches one plugin",
      countAfter < countBefore && countAfter >= 1,
      `before=${countBefore}, after=${countAfter}`,
    );

    // Esc clears (per updated §6.5)
    await search.click();
    await browser.keys(["Escape"]);
    await browser.pause(200);
    const cleared = await search.getValue();
    record("§6.5 Esc clears search query", cleared === "", `value after Esc = "${cleared}"`);
  });

  // ─── §6.5 Toggle (functional: writes settings.json) ─────────────────────

  it("§6.5 toggle flips enabledPlugins[TARGET_KEY] on disk", async () => {
    const before = readEnabledForTarget();
    if (before === undefined) {
      skip("§6.5 toggle writes disk", "TARGET_KEY not in enabledPlugins map");
      return;
    }
    const cardSel = `[data-testid="plugin-card"][data-plugin-key="${TARGET_KEY}"]`;
    const toggle = await browser.$(`${cardSel} [data-testid="enable-toggle"]`);
    await toggle.click();
    let after: boolean | undefined;
    try {
      await browser.waitUntil(
        () => {
          after = readEnabledForTarget();
          return after === !before;
        },
        { timeout: 5_000, timeoutMsg: "settings.json never flipped" },
      );
      record(
        "§6.5 toggle persists to settings.json",
        true,
        `${before} → ${after}`,
      );
    } catch (e) {
      record(
        "§6.5 toggle persists to settings.json",
        false,
        (e as Error).message,
      );
    }
    // Flip back so test order doesn't matter.
    await toggle.click();
    await browser.pause(500);
  });

  // ─── §6.6 Card click → Detail view + Back arrow ─────────────────────────

  it("§6.6 click card → detail view; Back arrow returns to list", async () => {
    const cardSel = `[data-testid="plugin-card"][data-plugin-key="${TARGET_KEY}"]`;
    const body = await browser.$(`${cardSel} [data-testid="plugin-card-body"]`);
    await body.click();
    const detail = await browser.$('[data-testid="plugin-detail-view"]');
    await detail.waitForExist({ timeout: 10_000 });
    record("§6.6 card click opens detail view", await detail.isExisting());

    const back = await browser.$('[data-testid="plugin-back-btn"]');
    record("§6.6 Back to plugins button exists", await back.isExisting());

    if (await back.isExisting()) {
      await back.click();
      const list = await browser.$('[data-testid="plugin-list-view"]');
      await list.waitForExist({ timeout: 5_000 });
      record("§6.6 Back returns to list view", await list.isExisting());
    }
  });

  // ─── §6.6 Detail view surface ───────────────────────────────────────────

  it("§6.6 detail view has name, marketplace, version, state, Open-folder, Open-vscode, 3 tabs", async () => {
    const cardSel = `[data-testid="plugin-card"][data-plugin-key="${TARGET_KEY}"]`;
    await (await browser.$(`${cardSel} [data-testid="plugin-card-body"]`)).click();
    await browser.$('[data-testid="plugin-detail-view"]').waitForExist({ timeout: 10_000 });

    record(
      "§6.6 detail header — name",
      await browser.$('[data-testid="plugin-detail-name"]').isExisting(),
    );
    record(
      "§6.6 detail header — marketplace",
      await browser.$('[data-testid="plugin-detail-marketplace"]').isExisting(),
    );
    record(
      "§6.6 detail header — version",
      await browser.$('[data-testid="plugin-detail-version"]').isExisting(),
    );
    record(
      "§6.6 detail header — state",
      await browser.$('[data-testid="plugin-detail-state"]').isExisting(),
    );
    record(
      "§6.6 [Open in File Browser] button exists",
      await browser.$('[data-testid="open-folder-btn"]').isExisting(),
    );
    record(
      "§6.6 [Open in VS Code] button exists",
      await browser.$('[data-testid="open-vscode-btn"]').isExisting(),
    );

    const tabSkills = await browser.$('[data-testid="tab-skills"]');
    const tabAgents = await browser.$('[data-testid="tab-agents"]');
    const tabHooks = await browser.$('[data-testid="tab-hooks"]');
    record("§6.6 Skills tab exists", await tabSkills.isExisting());
    record("§6.6 Agents tab exists", await tabAgents.isExisting());
    record("§6.6 Hooks tab exists", await tabHooks.isExisting());

    // Functional: clicking each tab swaps the visible tabpanel.
    await tabAgents.click();
    const agentsPanel = await browser.$('[data-testid="tabpanel-agents"]');
    const agentsHidden = await agentsPanel.getAttribute("hidden");
    record("§6.6 clicking Agents tab reveals its panel", agentsHidden === null);

    await tabHooks.click();
    const hooksPanel = await browser.$('[data-testid="tabpanel-hooks"]');
    const hooksHidden = await hooksPanel.getAttribute("hidden");
    record("§6.6 clicking Hooks tab reveals its panel", hooksHidden === null);

    // Return to list for any later tests.
    const back = await browser.$('[data-testid="plugin-back-btn"]');
    if (await back.isExisting()) await back.click();
  });

  // ─── §6.4/§6.7 broken card affordances (data-dependent) ─────────────────

  it("§6.4 broken card affordances — Reinstall/Remove are wired (A2)", async () => {
    const brokenCards = await browser.$$('[data-testid="plugin-card"][data-state="broken"]');
    if (brokenCards.length === 0) {
      skip(
        "§6.4 broken card affordances",
        "no broken plugins present on this machine — can't observe live",
      );
      return;
    }
    const card = brokenCards[0];
    const reinstall = await card.$('[data-testid="reinstall-btn"]');
    const remove = await card.$('[data-testid="remove-btn"]');
    const reinstallStub = (await reinstall.getAttribute("aria-disabled")) === "true";
    const removeStub = (await remove.getAttribute("aria-disabled")) === "true";
    record(
      "§6.7 broken [Reinstall] is wired (A2 decision)",
      !reinstallStub,
      reinstallStub ? "currently aria-disabled stub" : undefined,
    );
    record(
      "§6.7 broken [Remove] is wired (A2 decision)",
      !removeStub,
      removeStub ? "currently aria-disabled stub" : undefined,
    );
  });

  // ─── §6.7 orphaned card has Remove (C1) ─────────────────────────────────

  it("§6.7 orphaned cards expose a Remove button (C1)", async () => {
    const orphans = await browser.$$('[data-testid="plugin-card"][data-state="orphaned"]');
    if (orphans.length === 0) {
      skip(
        "§6.7 orphaned [Remove] affordance",
        "no orphaned plugins present on this machine — can't observe live",
      );
      return;
    }
    const remove = await orphans[0].$('[data-testid="orphaned-remove-btn"]');
    record(
      "§6.7 orphaned card exposes [Remove] (C1 decision)",
      await remove.isExisting(),
      "If FAIL: orphaned-Remove per §6.7 is not implemented yet",
    );
  });

  // ─── §6.7 install / uninstall round-trip (A2 — happy path CLI coverage) ─
  //
  // Until now no e2e actually drove `claude plugins install` / `uninstall`
  // end-to-end; we only verified the modal opens and the buttons are
  // interactive. This block closes that gap by round-tripping the
  // `example-skills` plugin: uninstall via the detail-view button, verify
  // the installed_plugins.json key disappears + card vanishes, then install
  // it back via the header modal and verify both reappear. The finally
  // block re-installs as a safety net so the host machine returns to its
  // starting state even when an assertion fails mid-round-trip.
  it("§6.7 round-trip: detail-uninstall removes example-skills; header Install brings it back", async function () {
    // CLI install/uninstall can take a while on first run (git clone +
    // marketplace fetch). Give Mocha plenty of headroom; the assertions
    // themselves still time out independently inside waitUntil.
    this.timeout(180_000);

    const readInstalledKeys = (): string[] => {
      try {
        const raw = fs.readFileSync(INSTALLED_PLUGINS_PATH, "utf8");
        const parsed = JSON.parse(raw) as { plugins?: Record<string, unknown> };
        return Object.keys(parsed.plugins ?? {});
      } catch {
        return [];
      }
    };

    const keys0 = readInstalledKeys();
    if (!keys0.includes(TARGET_KEY)) {
      skip(
        "§6.7 install/uninstall round-trip",
        `${TARGET_KEY} not installed on this machine — fixture precondition not met`,
      );
      return;
    }

    // `window.confirm` opens a native WebView2 dialog the harness can't
    // click; stub it to auto-accept for the duration of this test, restore
    // after.
    await browser.execute(() => {
      (window as unknown as { __origConfirm: typeof window.confirm }).__origConfirm =
        window.confirm;
      window.confirm = () => true;
    });

    let uninstalled = false;
    try {
      // ── Step 1: open detail view for example-skills, click Uninstall ──
      const cardSel = `[data-testid="plugin-card"][data-plugin-key="${TARGET_KEY}"]`;
      const card = await browser.$(cardSel);
      await card.waitForExist({ timeout: 5_000 });
      await (await browser.$(`${cardSel} [data-testid="plugin-card-body"]`)).click();
      const detail = await browser.$('[data-testid="plugin-detail-view"]');
      await detail.waitForExist({ timeout: 10_000 });

      const uninstallBtn = await browser.$('[data-testid="detail-uninstall-btn"]');
      record(
        "§6.7 detail view exposes [Uninstall] for active plugins",
        await uninstallBtn.isExisting(),
        "If FAIL: PluginDetailView is missing the Uninstall button",
      );
      if (!(await uninstallBtn.isExisting())) return;

      await uninstallBtn.click();

      // CLI must finish + store must reload + card must vanish from the
      // list. waitUntil is the truth — the disk state changes when CLI
      // exits.
      await browser.waitUntil(
        () => !readInstalledKeys().includes(TARGET_KEY),
        { timeout: 120_000, interval: 1_000, timeoutMsg: "installed_plugins.json still has key after uninstall" },
      );
      uninstalled = true;
      record(
        "§6.7 uninstall removes example-skills from installed_plugins.json",
        true,
        `keys=${readInstalledKeys().length}`,
      );

      // The Plugins UI typically auto-returns to the list (selection drops
      // when the plugin disappears from the store), but we don't depend on
      // that — go back explicitly if we're still on the detail view.
      const backBtn = await browser.$('[data-testid="plugin-back-btn"]');
      if (await backBtn.isExisting()) await backBtn.click();
      await browser.$('[data-testid="plugin-list-view"]').waitForExist({ timeout: 10_000 });

      // ── Step 2: header Install modal → submit → card reappears ────────
      const installBtn = await browser.$('[data-testid="install-plugin-btn"]');
      await installBtn.click();
      const input = await browser.$('[data-testid="install-plugin-input"]');
      await input.waitForExist({ timeout: 5_000 });
      await input.setValue(TARGET_KEY);
      const submit = await browser.$('[data-testid="install-plugin-submit"]');
      await submit.click();

      await browser.waitUntil(
        () => readInstalledKeys().includes(TARGET_KEY),
        { timeout: 120_000, interval: 1_000, timeoutMsg: "installed_plugins.json never re-added key after install" },
      );
      uninstalled = false;
      record(
        "§6.7 install re-adds example-skills to installed_plugins.json",
        true,
        `keys=${readInstalledKeys().length}`,
      );

      // Card surface returns.
      await browser.$(cardSel).waitForExist({ timeout: 10_000 });
      record(
        "§6.7 example-skills card re-renders after reinstall",
        await browser.$(cardSel).isExisting(),
      );
    } finally {
      // Restore confirm even if the test threw.
      await browser.execute(() => {
        const w = window as unknown as { __origConfirm?: typeof window.confirm };
        if (w.__origConfirm) {
          window.confirm = w.__origConfirm;
          delete w.__origConfirm;
        }
      });

      // Safety net: if we successfully uninstalled but then failed before
      // re-installing, attempt to put it back from the test process so the
      // host machine doesn't keep a half-mutated state. Best-effort —
      // never throw out of finally.
      if (uninstalled) {
        try {
          const { spawnSync } = await import("node:child_process");
          const cmd = process.platform === "win32" ? "claude.cmd" : "claude";
          spawnSync(cmd, ["plugins", "install", TARGET_KEY], {
            stdio: "ignore",
            timeout: 120_000,
          });
        } catch {
          /* leave the machine in its current state — operator will see */
        }
      }
    }
  });
});
