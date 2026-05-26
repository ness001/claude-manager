// E2E spec: Settings section UI vs spec §9 gap audit.
//
// Status quo: SettingsSection.tsx is a Phase-1 placeholder. Spec §9 calls for a
// two-column layout with 7 subsections (General/API, Permissions, Plugins,
// Environment, Appearance, Usage & Stats, Advanced) — all Phase-4 scope per
// docs/superpowers/plans/2026-05-03-phase4-dialogs-polish.md.
//
// What this spec actually asserts:
//   1. The settings region mounts (testid + accessible heading) — real coverage.
//   2. Both nav paths land on Settings:
//        - Ctrl+, (the conventional shortcut)
//        - Ctrl+6 (positional, per App.tsx SHORTCUTS map)
//   3. One SKIP per §9 subsection, so the GAP REPORT surfaces the Phase-4
//      backlog instead of letting it fall off the radar.
//
// Mirrors plugins.spec.ts: same record/skip helpers, same before() pattern,
// machine-readable GAP REPORT in after().

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

async function navigateToSettings(via: "ctrl-comma" | "ctrl-6"): Promise<boolean> {
  const keys = via === "ctrl-comma" ? ["Control", ","] : ["Control", "6"];
  for (let attempt = 0; attempt < 3; attempt++) {
    await browser.keys(keys);
    const opened = await browser
      .$('[data-testid="settings-section"]')
      .waitForExist({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return true;
  }
  return false;
}

async function navigateAway() {
  // Park on Dashboard between nav tests so each Ctrl+key press is observable
  // as an actual transition rather than a no-op on the already-active section.
  await browser.keys(["Control", "1"]);
  await browser
    .$('[data-testid="dashboard-section"]')
    .waitForExist({ timeout: 5_000 })
    .catch(() => {
      /* Dashboard testid may differ; fall back to URL/root presence */
    });
}

describe("Settings section — UI vs spec §9 gap audit", () => {
  before(async function () {
    this.timeout(120_000);

    // Same SPA-attach dance as plugins.spec.ts: tauri-driver attaches with
    // pageLoadStrategy="none", so the URL can briefly be about:blank.
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
  });

  after(async () => {
    console.log("\n========== GAP REPORT (machine-readable) ==========");
    console.log(JSON.stringify(results, null, 2));
    console.log("========== END GAP REPORT ==========\n");
  });

  // ─── Navigation: Ctrl+, opens Settings ──────────────────────────────────

  it("Ctrl+, navigates to Settings", async () => {
    await navigateAway();
    const opened = await navigateToSettings("ctrl-comma");
    record("nav Ctrl+, → settings region mounts", opened);
    expect(opened).toBe(true);
  });

  // ─── Navigation: Ctrl+6 opens Settings ──────────────────────────────────

  it("Ctrl+6 navigates to Settings", async () => {
    await navigateAway();
    const opened = await navigateToSettings("ctrl-6");
    record("nav Ctrl+6 → settings region mounts", opened);
    expect(opened).toBe(true);
  });

  // ─── Region landmark + accessible heading ───────────────────────────────

  it("Settings region has accessible name bound to the visible heading", async () => {
    const section = await browser.$('[data-testid="settings-section"]');
    record("region testid present", await section.isExisting());

    const labelledby = await section.getAttribute("aria-labelledby");
    record(
      "region aria-labelledby points at the heading id",
      labelledby === "settings-heading",
      `aria-labelledby="${labelledby}"`,
    );

    const heading = await browser.$("#settings-heading");
    const headingExists = await heading.isExisting();
    record("heading element with id=settings-heading exists", headingExists);

    if (headingExists) {
      const tag = await heading.getTagName();
      const text = (await heading.getText()).trim();
      record("heading is an <h1>", tag.toLowerCase() === "h1", `tag=${tag}`);
      record("heading text is 'Settings'", text === "Settings", `text="${text}"`);
    }

    // <main> landmark above the section should also be labelled "Settings"
    // (ContentArea.tsx SECTION_LABEL). Asserting this here keeps the spec
    // honest about the *actually-shipped* surface area, which is otherwise
    // very small.
    const main = await browser.$('main[aria-label="Settings"]');
    record("<main> landmark labelled 'Settings'", await main.isExisting());
  });

  // ─── §9 subsection gap report (Phase-4 scope) ───────────────────────────
  //
  // SettingsSection is intentionally a placeholder in Phase 1 (see
  // docs/superpowers/plans/2026-05-03-phase1-foundation.md). The 7 subsections
  // below ship in Phase 4 (docs/superpowers/plans/2026-05-03-phase4-dialogs-polish.md).
  // Emit one SKIP each so the gap is visible in the GAP REPORT and not
  // silently absent from coverage.

  it("§9.1 two-column layout (sidebar + content) — Phase 4", async () => {
    skip(
      "§9.1 two-column layout (200px sidebar + content)",
      "Phase 4 scope — SettingsSection is currently a placeholder",
    );
  });

  it("§9.2 General/API subsection — Phase 4", async () => {
    skip(
      "§9.2 General/API (base URL, masked auth token, default/small/fast models, API key)",
      "Phase 4 scope — reads settings.json env + config.json",
    );
  });

  it("§9.2 Permissions subsection — Phase 4", async () => {
    skip(
      "§9.2 Permissions (permissions.allow list, skipDangerousModePermissionPrompt warning)",
      "Phase 4 scope — reads settings.json + settings.local.json",
    );
  });

  it("§9.2 Plugins subsection — Phase 4", async () => {
    skip(
      "§9.2 Plugins (enabledPlugins toggle list linking to Plugins panel)",
      "Phase 4 scope — reads settings.json enabledPlugins map",
    );
  });

  it("§9.2 Environment subsection — Phase 4", async () => {
    skip(
      "§9.2 Environment (key-value editor for env vars)",
      "Phase 4 scope — reads settings.json env block",
    );
  });

  it("§9.2 Appearance subsection — Phase 4", async () => {
    skip(
      "§9.2 Appearance (theme, terminal font size/family, sidebar position, compact mode)",
      "Phase 4 scope — app-local, persists to SQLite app_settings",
    );
  });

  it("§9.2 Usage & Stats subsection — Phase 4", async () => {
    skip(
      "§9.2 Usage & Stats (model token table, activity heatmap, export CSV/JSON)",
      "Phase 4 scope — reads stats-cache.json (read-only)",
    );
  });

  it("§9.2 Advanced subsection — Phase 4", async () => {
    skip(
      "§9.2 Advanced (Monaco raw JSON editor, config file paths, debug info, reset app data)",
      "Phase 4 scope — touches all config files",
    );
  });
});
