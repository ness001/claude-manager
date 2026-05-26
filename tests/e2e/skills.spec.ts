// E2E spec: Skills section UI vs spec §7.1.
//
// Real-data assertions (R1): the spec drives off the user's actual
// `~/.claude/skills/` directory. The spec asserts:
//   - the on-disk skill count matches the rendered card count
//   - at least one known skill directory shows up as a card
//   - each card's path resolves to a real file on disk
//
// Each assertion prints `PASS: <spec-ref>` or `FAIL: <spec-ref> — <reason>`
// so the run output doubles as a spec-compliance report.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@wdio/globals";

const SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");

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

/** Enumerate every direct subdirectory of `~/.claude/skills/` that contains a SKILL.md. */
function listOnDiskSkills(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) =>
      fs.existsSync(path.join(SKILLS_DIR, d.name, "SKILL.md")) ||
      fs.existsSync(path.join(SKILLS_DIR, d.name, "skill.md")),
    )
    .map((d) => d.name)
    .sort();
}

describe("Skills section — UI vs spec §7.1", () => {
  before(async function () {
    this.timeout(120_000);

    // Same SPA-attach pattern as plugins.spec.ts — pageLoadStrategy="none"
    // means we have to poll the driver until the dev URL is live.
    await new Promise((r) => setTimeout(r, 3_000));

    const ready = await browser.waitUntil(
      async () => {
        try {
          const u = await browser.getUrl();
          if (u && u !== "about:blank" && !u.endsWith("/about:blank")) return true;
          try {
            await browser.url("http://localhost:1420/");
          } catch {
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

    // Navigate to Skills. Ctrl+4 per App.tsx; fall back to sidebar click.
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      await browser.keys(["Control", "4"]);
      opened = await browser
        .$('[data-testid="skill-list-view"]')
        .waitForExist({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      console.log(`[diag] Ctrl+4 didn't open skills; trying sidebar click`);
      const navBtn = await browser.$('nav[aria-label="Primary"] button[aria-label="Skills"]');
      if (await navBtn.isExisting()) {
        await navBtn.click();
      } else {
        const fullHtml = await browser
          .execute(() => document.body.innerHTML.replace(/\s+/g, " ").slice(0, 2000))
          .catch(() => "n/a");
        console.log(`[diag] body HTML (one line): ${JSON.stringify(fullHtml)}`);
      }
      await browser.$('[data-testid="skill-list-view"]').waitForExist({ timeout: 10_000 });
    }

    // Wait for the store's initial load to settle. The component renders
    // one of three post-load branches: skill-grid (has skills), empty-state
    // (none on disk), or no-matches (filter mismatch). The skeleton only
    // shows during the in-flight window — by the time we attach it's often
    // gone. Wait for ANY terminal state rather than skeleton absence.
    await browser.waitUntil(
      async () => {
        const grid = await browser.$('[data-testid="skill-grid"]');
        const empty = await browser.$('[data-testid="empty-state"]');
        const none = await browser.$('[data-testid="no-matches"]');
        return (
          (await grid.isExisting()) ||
          (await empty.isExisting()) ||
          (await none.isExisting())
        );
      },
      { timeout: 15_000, timeoutMsg: "skills load never reached a terminal state" },
    );
  });

  after(() => {
    console.log("\n========== GAP REPORT (machine-readable) ==========");
    console.log(JSON.stringify(results, null, 2));
    console.log("========== END GAP REPORT ==========\n");
  });

  // ─── §7.1 Header surface ───────────────────────────────────────────────

  it("§7.1 header has title, count, path, [+ Create Skill], search", async () => {
    const heading = await browser.$('[data-testid="skill-list-view"] h1');
    record(
      "§7.1 title is \"Custom Skills\"",
      (await heading.isExisting()) && (await heading.getText()) === "Custom Skills",
    );

    const statCount = await browser.$('[data-testid="stat-skill-count"]');
    const statPath = await browser.$('[data-testid="stat-skills-path"]');
    record("§7.1 skill count stat exists", await statCount.isExisting());
    record(
      "§7.1 skills path stat shows ~/.claude/skills/",
      (await statPath.isExisting()) && (await statPath.getText()) === "~/.claude/skills/",
    );

    const createBtn = await browser.$('[data-testid="create-skill-btn"]');
    record("§7.1 [+ Create Skill] button exists", await createBtn.isExisting());

    const search = await browser.$('[data-testid="skill-search"]');
    record("§7.1 search box exists", await search.isExisting());
  });

  // ─── R1 real-data: card count matches disk ─────────────────────────────

  it("R1 rendered skill cards match on-disk skills (count + names)", async () => {
    const onDisk = listOnDiskSkills();
    if (onDisk.length === 0) {
      skip("R1 skill cards match disk", "no skills on disk to compare");
      return;
    }
    const statCount = await browser.$('[data-testid="stat-skill-count"]');
    const statText = await statCount.getText();
    const renderedCount = Number(statText.match(/^(\d+)/)?.[1] ?? "-1");
    record(
      "R1 stat count matches on-disk skill directory count",
      renderedCount === onDisk.length,
      `stat="${statText}" → ${renderedCount}, disk=${onDisk.length}`,
    );

    const cards = await browser.$$('[data-testid="skill-card"]');
    record(
      "R1 card count matches on-disk skill directory count",
      cards.length === onDisk.length,
      `cards=${cards.length}, disk=${onDisk.length}`,
    );

    // At least one known directory name appears as a card. We compare via
    // data-skill-name (set from frontmatter name, which falls back to dir
    // name) AND visible <span> text — passing either is enough since custom
    // skills may override their display name in frontmatter.
    // `browser.$$()` returns a ChainablePromiseArray, not a plain Array —
    // Promise.all() over `.map()` on it throws "object is not iterable".
    // Drain into a real array via for-await before mapping.
    const renderedNames: (string | null)[] = [];
    for (const c of cards) {
      renderedNames.push(await c.getAttribute("data-skill-name"));
    }
    const knownPresent = onDisk.find((d) =>
      renderedNames.some((n) => (n ?? "").toLowerCase() === d.toLowerCase()),
    );
    record(
      "R1 at least one on-disk skill is rendered as a card",
      knownPresent !== undefined,
      `disk[0..3]=${onDisk.slice(0, 3).join(",")}, rendered[0..3]=${renderedNames.slice(0, 3).join(",")}`,
    );
  });

  // ─── §7.1 Card surface ─────────────────────────────────────────────────

  it("§7.1 each card has name, description (when present), path, VS Code + File Browser actions", async () => {
    const cards = await browser.$$('[data-testid="skill-card"]');
    if (cards.length === 0) {
      skip("§7.1 card surface", "no skill cards rendered");
      return;
    }
    const card = cards[0];

    // Description is conditional in the component (only renders when set).
    // We don't fail if absent — but the path + actions are unconditional.
    const pathEl = await card.$('[data-testid="skill-path"]');
    record("§7.1 card shows skill path", await pathEl.isExisting());

    // R1: the rendered path must point to a real file on disk.
    if (await pathEl.isExisting()) {
      const pathText = await pathEl.getText();
      record(
        "R1 card path resolves to an existing file on disk",
        fs.existsSync(pathText),
        `path="${pathText}"`,
      );
    }

    const toolbar = await card.$('[data-testid="skill-actions-toolbar"]');
    record("§7.1 actions toolbar exists", await toolbar.isExisting());

    const vscode = await card.$('[data-testid="open-vscode-btn"]');
    const folder = await card.$('[data-testid="open-folder-btn"]');
    record("§7.1 [Open in VS Code] button exists", await vscode.isExisting());
    record("§7.1 [Open in File Browser] button exists", await folder.isExisting());
  });

  // ─── §7.1 / §17.7 Search filter ────────────────────────────────────────

  it("§17.7 search filters by name (typing reduces visible cards)", async () => {
    const cards = await browser.$$('[data-testid="skill-card"]');
    if (cards.length < 2) {
      skip("§17.7 search filter", `need ≥2 skills to observe filtering, have ${cards.length}`);
      return;
    }
    // Use the first card's data-skill-name as a query that should narrow
    // the list. A 4-char prefix of one skill's name MUST shrink the visible
    // set — anything else (no change, growth) means the filter is broken.
    // Originally this was `after <= before` but per Ness's triangulation
    // heads-up (spec/code/user) that lets a no-op filter silently pass.
    const firstName = (await cards[0].getAttribute("data-skill-name")) ?? "";
    if (firstName.length < 3) {
      skip("§17.7 search filter", `first skill name too short to use as query: "${firstName}"`);
      return;
    }
    // Pick a 4-char prefix; with ≥2 cards present, a real filter MUST drop
    // at least one card unless every name shares that prefix (vanishingly
    // unlikely; surface as a real failure if it happens so we can pick a
    // better discriminator).
    const query = firstName.slice(0, 4);
    const before = cards.length;

    const search = await browser.$('[data-testid="skill-search"]');
    await search.setValue(query);
    await browser.pause(300);
    const after = await browser.$$('[data-testid="skill-card"]');
    record(
      "§17.7 search strictly reduces visible cards when query is a 4-char prefix of one name",
      after.length < before && after.length >= 1,
      `before=${before}, after=${after.length}, query="${query}"`,
    );

    // §7.1 (PR #153 parity): Escape clears the query and stays focused.
    await search.click();
    await browser.keys(["Escape"]);
    await browser.pause(200);
    const cleared = await search.getValue();
    record("§7.1 Esc clears search query", cleared === "", `value after Esc = "${cleared}"`);

    // No-matches branch: type something nobody can match, expect the empty
    // node — only meaningful when we actually have skills to filter.
    await search.setValue("zzz-no-such-skill-xyzzy");
    await browser.pause(300);
    const noMatch = await browser.$('[data-testid="no-matches"]');
    record("§7.1 no-matches state renders for an unmatchable query", await noMatch.isExisting());

    // Clear so subsequent tests see all cards again.
    await search.click();
    await browser.keys(["Escape"]);
    await browser.pause(200);
  });

  // ─── §7.1 Plugins panel link ───────────────────────────────────────────

  it("§7.1 info box link navigates to Plugins panel and back", async () => {
    const aside = await browser.$('[data-testid="plugins-info-box"]');
    record("§7.1 plugin-bundled-skills info box exists", await aside.isExisting());

    const link = await browser.$('[data-testid="plugins-panel-link"]');
    record("§7.1 Plugins-panel link exists", await link.isExisting());

    if (await link.isExisting()) {
      await link.click();
      const pluginView = await browser.$('[data-testid="plugin-list-view"]');
      const went = await pluginView
        .waitForExist({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      record("§7.1 link navigates to Plugins panel", went);

      // Restore Skills view so any later spec ordering stays predictable.
      await browser.keys(["Control", "4"]);
      await browser.$('[data-testid="skill-list-view"]').waitForExist({ timeout: 10_000 });
    }
  });
});
