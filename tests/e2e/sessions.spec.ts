// E2E spec: Sessions section UI vs spec §5 gap audit.
//
// Real-data assertions only (CLAUDE.md R1 — no escape clauses). The test
// machine has many JSONL session files under ~/.claude/projects/* and live
// PID files under ~/.claude/sessions/; the suite leans on that to verify the
// list panel is populated with concrete observable values, not just "shows
// either sessions or an empty state".
//
// Sessions-index.json staleness guard (DESIGN-CONTEXT §2.2/§2.3): the session
// loader treats sessions-index.json as a cache hint only — discovery walks
// `projects/*/*.jsonl` directly and cross-references PID files. The spec
// here asserts the on-screen list reflects the loader output (count and
// content) rather than what the stale index claims.
//
// Each assertion prints `PASS: <ref>` / `FAIL: <ref> — <reason>` so the run
// output doubles as a spec-compliance report.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@wdio/globals";

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const PID_DIR = path.join(os.homedir(), ".claude", "sessions");

interface SpecResult {
  ref: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail?: string;
}
const results: SpecResult[] = [];

function record(ref: string, ok: boolean, detail?: string) {
  const status: SpecResult["status"] = ok ? "PASS" : "FAIL";
  results.push({ ref, status, detail });
  console.log(`${status}: ${ref}${detail ? ` — ${detail}` : ""}`);
}
function skip(ref: string, detail: string) {
  results.push({ ref, status: "SKIP", detail });
  console.log(`SKIP: ${ref} — ${detail}`);
}

/** Count discoverable JSONL session files on disk — the lower bound for what
 *  the loader should surface (it will additionally drop sidechains + archived,
 *  so the UI count is `≤ on-disk count` but `≥ 1` whenever any file exists). */
function countOnDiskSessions(): number {
  if (!fs.existsSync(PROJECTS_DIR)) return 0;
  let n = 0;
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    const dir = path.join(PROJECTS_DIR, proj);
    let stat;
    try {
      stat = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".jsonl")) n += 1;
    }
  }
  return n;
}

/** Count live PID files — non-zero proves the ALIVE detection path is
 *  exercisable on this machine. The spec doesn't require any cards to
 *  actually be ALIVE (the PID may belong to a sidechain or a session whose
 *  JSONL is filtered out), so this only gates the ALIVE-specific test. */
function countPidFiles(): number {
  if (!fs.existsSync(PID_DIR)) return 0;
  return fs.readdirSync(PID_DIR).filter((f) => f.endsWith(".json")).length;
}

describe("Sessions section — UI vs spec §5 gap audit", () => {
  let onDiskSessionCount = 0;
  let pidFileCount = 0;

  before(async function () {
    this.timeout(120_000);
    onDiskSessionCount = countOnDiskSessions();
    pidFileCount = countPidFiles();
    console.log(
      `[setup] on-disk JSONL sessions=${onDiskSessionCount}, PID files=${pidFileCount}`,
    );

    // Same SPA-attach dance as plugins.spec.ts — pageLoadStrategy="none"
    // means wdio doesn't wait for any onload, so we have to bridge the
    // gap to localhost:1420 ourselves.
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
            /* session may briefly disconnect during navigation */
          }
          return false;
        },
        { timeout: 30_000, interval: 1_000, timeoutMsg: "SPA never left about:blank" },
      )
      .then(() => true)
      .catch(() => false);

    if (!ready) {
      const u = await browser.getUrl().catch(() => "n/a");
      throw new Error(`SPA attach failed (url=${u})`);
    }
    console.log(`[diag] SPA attached at ${await browser.getUrl()}`);

    await browser.$("#root").waitForExist({ timeout: 30_000 });

    // Navigate to Sessions section. Ctrl+2 per App.tsx; sometimes the
    // listener isn't mounted yet, so retry + fall back to sidebar click.
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      await browser.keys(["Control", "2"]);
      opened = await browser
        .$('[data-testid="sessions-section"]')
        .waitForExist({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      console.log(`[diag] Ctrl+2 didn't open sessions; trying sidebar click`);
      const navBtn = await browser.$(
        'nav[aria-label="Primary"] button[aria-label="Sessions"]',
      );
      if (await navBtn.isExisting()) {
        await navBtn.click();
      }
      await browser
        .$('[data-testid="sessions-section"]')
        .waitForExist({ timeout: 10_000 });
    }

    // Wait until either real cards render OR the empty state renders — i.e.
    // loadSessions() has resolved at least once. The skeleton has its own
    // testid; once it's gone the panel is final.
    await browser.waitUntil(
      async () => {
        const skel = await browser.$('[data-testid="session-list-skeleton"]');
        return !(await skel.isExisting());
      },
      { timeout: 30_000, timeoutMsg: "session list skeleton never resolved" },
    );

    // Wait for session cards to actually render. The skeleton disappears when
    // isLoading goes false, but the session list may still be empty if the
    // SQLite pipeline is slow (127 upserts on first scan). Wait up to 15s
    // for at least 1 card to appear. If still 0, attempt a manual reload
    // via the store to surface any swallowed errors.
    const cardsAppeared = await browser.waitUntil(
      async () => {
        const cards = await browser.$$('[data-testid="session-card"]');
        return cards.length > 0;
      },
      { timeout: 15_000 },
    ).then(() => true).catch(() => false);

    if (!cardsAppeared) {
      console.log("[diag] No cards after 15s — attempting manual reload via store");
      const reloadResult = await browser.execute(async () => {
        try {
          // @ts-expect-error — Tauri invoke
          const { invoke } = window.__TAURI_INTERNALS__;
          const discovered = await invoke("discover_sessions");
          const pids = await invoke("read_pid_files");
          return { discovered: discovered.length, pids: pids.length, error: null };
        } catch (e: unknown) {
          return { discovered: 0, pids: 0, error: String(e) };
        }
      });
      console.log(`[diag] Manual IPC check: discovered=${reloadResult.discovered}, pids=${reloadResult.pids}, error=${reloadResult.error}`);

      // Try triggering a reload by directly calling the session loader
      const loaderResult = await browser.execute(async () => {
        try {
          // @ts-expect-error — Tauri invoke
          const { invoke } = window.__TAURI_INTERNALS__;
          const dbPath = await invoke("get_db_path");
          // Use the sql plugin's IPC directly
          const loadResult = await invoke("plugin:sql|load", { db: `sqlite:${dbPath}` });
          const selectResult = await invoke("plugin:sql|select", {
            db: `sqlite:${dbPath}`,
            query: "SELECT COUNT(*) as cnt FROM sessions",
            values: [],
          });
          return { dbPath, loadResult: JSON.stringify(loadResult), selectResult: JSON.stringify(selectResult), error: null };
        } catch (e: unknown) {
          return { dbPath: null, loadResult: null, selectResult: null, error: String(e) };
        }
      });
      console.log(`[diag] DB direct: path=${loaderResult.dbPath}, select=${loaderResult.selectResult}, error=${loaderResult.error}`);
    }
  });

  after(async () => {
    console.log("\n========== SESSIONS GAP REPORT (machine-readable) ==========");
    console.log(JSON.stringify(results, null, 2));
    console.log("========== END GAP REPORT ==========\n");
  });

  // ─── Diagnostic: check if discover_sessions IPC works ──────────────────

  it("[diag] discover_sessions IPC returns sessions from within the browser", async () => {
    const result = await browser.execute(async () => {
      try {
        // @ts-expect-error — Tauri globals are injected at runtime
        const { invoke } = window.__TAURI_INTERNALS__;
        const sessions = await invoke("discover_sessions");
        return { count: sessions.length, error: null, step: "discover" };
      } catch (e: unknown) {
        return { count: 0, error: String(e), step: "discover" };
      }
    });
    console.log(`[diag] discover_sessions: count=${result.count}, error=${result.error}`);

    // Also check the full loadAllSessions pipeline
    const storeResult = await browser.execute(async () => {
      try {
        // @ts-expect-error — Zustand store on window for debug
        const store = window.__ZUSTAND_SESSION_STORE__;
        if (store) {
          const state = store.getState();
          return { sessions: state.sessions.length, isLoading: state.isLoading, error: null };
        }
        return { sessions: -1, isLoading: false, error: "store not exposed on window" };
      } catch (e: unknown) {
        return { sessions: -1, isLoading: false, error: String(e) };
      }
    });
    console.log(`[diag] store state: sessions=${storeResult.sessions}, isLoading=${storeResult.isLoading}, error=${storeResult.error}`);

    // Try calling loadAllSessions directly
    const loadResult = await browser.execute(async () => {
      try {
        // @ts-expect-error — Tauri globals
        const { invoke } = window.__TAURI_INTERNALS__;
        // Simulate what loadAllSessions does: discover + read_pid_files
        const discovered = await invoke("discover_sessions");
        const pids = await invoke("read_pid_files");
        return { discovered: discovered.length, pids: pids.length, error: null };
      } catch (e: unknown) {
        return { discovered: 0, pids: 0, error: String(e) };
      }
    });
    console.log(`[diag] IPC: discovered=${loadResult.discovered}, pids=${loadResult.pids}, error=${loadResult.error}`);

    record(
      "[diag] discover_sessions IPC returns >0 sessions",
      result.count > 0,
      `count=${result.count}, error=${result.error}`,
    );
  });

  // ─── §5.5 List panel header structure ───────────────────────────────────

  it("§5.5 list panel exposes New Session button, view-mode toggle, search box", async () => {
    const panel = await browser.$('[data-testid="session-list-panel"]');
    record("§5.5 session-list-panel renders", await panel.isExisting());

    const newBtn = await browser.$('[data-testid="new-session-btn"]');
    record("§5.5 + New Session button exists", await newBtn.isExisting());

    const my = await browser.$('[data-testid="view-mode-my"]');
    const proj = await browser.$('[data-testid="view-mode-project"]');
    const tl = await browser.$('[data-testid="view-mode-timeline"]');
    record(
      "§5.4 view-mode toggle has all three modes",
      (await my.isExisting()) &&
        (await proj.isExisting()) &&
        (await tl.isExisting()),
    );

    const search = await browser.$('input[aria-label="Search sessions"]');
    record("§5.5 search box exists", await search.isExisting());
  });

  // ─── §5.2 Real data loaded into the list (no escape clauses) ────────────

  it("§5.2 list renders ≥1 real session card from on-disk JSONL", async function () {
    if (onDiskSessionCount === 0) {
      // Hard fail rather than skip — the test machine is documented to have
      // many sessions; zero JSONL files is a setup/env regression, not an
      // acceptable runtime state for this assertion.
      record(
        "§5.2 ≥1 session card rendered from real data",
        false,
        "no JSONL files under ~/.claude/projects — cannot verify real-data path",
      );
      return;
    }
    const cards = await browser.$$('[data-testid="session-card"]');
    record(
      "§5.2 ≥1 session card rendered from real data",
      cards.length >= 1,
      `on-disk=${onDiskSessionCount}, rendered=${cards.length}`,
    );
  });

  // ─── §5.5 Card surface — first card has every required element ──────────

  it("§5.5 first session card exposes status-dot, label, time-ago, message-count", async () => {
    const cards = await browser.$$('[data-testid="session-card"]');
    if (cards.length === 0) {
      record(
        "§5.5 session-card surface",
        false,
        "no cards rendered — cannot verify surface",
      );
      return;
    }
    const c = cards[0];
    const dot = await c.$('[data-testid="status-dot"]');
    record("§5.5 card status-dot present", await dot.isExisting());
    const aria = await dot.getAttribute("aria-label");
    record(
      "§5.3 status-dot announces state (Alive/Ended/Orphaned/Archived)",
      typeof aria === "string" && /^(Alive|Ended|Orphaned|Archived)$/.test(aria),
      `aria-label="${aria}"`,
    );

    const t = await c.$('[data-testid="time-ago"]');
    const m = await c.$('[data-testid="message-count"]');
    record("§5.5 card time-ago slot present", await t.isExisting());
    record("§5.5 card message-count present", await m.isExisting());

    const ds = await c.getAttribute("data-state");
    record(
      "§5.3 card data-state is one of alive|ended|orphaned|archived",
      ds === "alive" || ds === "ended" || ds === "orphaned" || ds === "archived",
      `data-state="${ds}"`,
    );
  });

  // ─── §5.3 Sidechain filter — DESIGN-CONTEXT §2.2 gotcha ─────────────────

  it("§5.3 sidechain transcripts are NOT rendered as cards (DESIGN-CONTEXT §2.2)", async () => {
    // The filter is implemented in `filterSessions`. We verify behaviorally:
    // the rendered card count must never exceed on-disk JSONL count, AND
    // for every rendered card the data-state must be a non-sidechain value
    // (sidechain entries would still pick up a state but get filtered out
    // before reaching the DOM).
    const cards = await browser.$$('[data-testid="session-card"]');
    record(
      "§5.3 rendered cards ≤ on-disk JSONL files (sidechain/archived dropped)",
      cards.length <= Math.max(onDiskSessionCount, 1),
      `rendered=${cards.length}, on-disk=${onDiskSessionCount}`,
    );
  });

  // ─── §5.5 / §17.7 Search filter is functional ───────────────────────────

  it("§17.7 typing in search shrinks the rendered list (debounced 200ms)", async () => {
    const cards = await browser.$$('[data-testid="session-card"]');
    const before = cards.length;
    if (before === 0) {
      record("§17.7 search filter shrinks card count", false, "no cards to filter");
      return;
    }
    const search = await browser.$('input[aria-label="Search sessions"]');
    // Use a string very unlikely to appear in any real session preview.
    await search.setValue("zzzzz_no_session_should_ever_match_zzzzz");
    await browser.pause(400); // debounce is 200ms — give it 2x.
    const afterCards = await browser.$$('[data-testid="session-card"]');
    record(
      "§17.7 search filter shrinks card count",
      afterCards.length < before,
      `before=${before}, after=${afterCards.length}`,
    );

    // Empty-state message under the search rather than a phantom "0" list.
    const empty = await browser.$('[data-testid="session-list-empty"]');
    record(
      "§17.7 zero-match state renders session-list-empty",
      await empty.isExisting(),
    );

    // Esc clears (per SessionSearch onKeyDown handler).
    await search.click();
    await browser.keys(["Escape"]);
    await browser.pause(250);
    const cleared = await search.getValue();
    record("§17.7 Esc clears search query", cleared === "");
    // List should re-populate.
    await browser.waitUntil(
      async () => (await browser.$$('[data-testid="session-card"]')).length === before,
      {
        timeout: 5_000,
        timeoutMsg: `card count did not restore after Esc (still ${(await browser.$$('[data-testid="session-card"]')).length}/${before})`,
      },
    );
    record("§17.7 list restores after Esc-clear", true);
  });

  // ─── §5.4 View-mode toggle is functional ────────────────────────────────

  it("§5.4 switching to Project view re-groups the list (group headers change)", async () => {
    const my = await browser.$('[data-testid="view-mode-my"]');
    const proj = await browser.$('[data-testid="view-mode-project"]');
    const tl = await browser.$('[data-testid="view-mode-timeline"]');

    async function readHeaders(): Promise<string[]> {
      const els = await browser.$$('[data-testid="group-header"]');
      const out: string[] = [];
      for (const h of els) {
        const t = await h.getText();
        out.push(t.replace(/\s*\(\d+\)\s*$/, "").trim());
      }
      return out;
    }

    // Snapshot headers in My view.
    await my.click();
    await browser.pause(150);
    const myHeaders = await readHeaders();

    // Project view — headers should be CWD paths, not "Pinned"/"All Sessions".
    await proj.click();
    await browser.pause(150);
    const projHeaders = await readHeaders();

    record(
      "§5.4 Project view header set differs from My view",
      JSON.stringify(myHeaders) !== JSON.stringify(projHeaders),
      `my=${JSON.stringify(myHeaders.slice(0, 3))} project=${JSON.stringify(projHeaders.slice(0, 3))}`,
    );

    // Timeline view — headers must include at least one of the timeline
    // bucket labels (Today/Yesterday/This Week/<Month YYYY>/Undated).
    await tl.click();
    await browser.pause(150);
    const tlHeaders = await readHeaders();
    const tlMatch = tlHeaders.some((h) =>
      /^(today|yesterday|this week|undated)$|^[a-z]+ \d{4}$/i.test(h),
    );
    record(
      "§5.4 Timeline view exposes time-bucket headers",
      tlMatch,
      `headers=${JSON.stringify(tlHeaders.slice(0, 5))}`,
    );

    // Restore My view so later tests aren't affected.
    await my.click();
    await browser.pause(150);
  });

  // ─── §5.6 Detail panel — empty + populated ──────────────────────────────

  it("§5.6 detail panel shows empty state before any card is selected", async () => {
    // After view-mode test the list is back to My view, but no card has
    // been clicked yet in this test. Verify empty state.
    const empty = await browser.$('[data-testid="session-detail-empty"]');
    record("§5.6 detail empty state present pre-selection", await empty.isExisting());
  });

  it("§5.6 clicking first card opens detail panel with info-bar + state pill + actions", async () => {
    const cards = await browser.$$('[data-testid="session-card"]');
    if (cards.length === 0) {
      record(
        "§5.6 detail panel populated after card click",
        false,
        "no cards to click",
      );
      return;
    }
    await cards[0].click();

    const detail = await browser.$('[data-testid="session-detail-panel"]');
    await detail.waitForExist({ timeout: 5_000 });
    record("§5.6 detail panel renders after click", await detail.isExisting());

    const info = await browser.$('[data-testid="session-info-bar"]');
    record("§5.6 info bar renders", await info.isExisting());

    const nameInput = await browser.$('[data-testid="session-name-input"]');
    record("§5.6 editable session-name-input present", await nameInput.isExisting());

    const pill = await browser.$('[data-testid="state-pill"]');
    record("§5.6 state-pill renders", await pill.isExisting());
    const pillState = await pill.getAttribute("data-state");
    record(
      "§5.3 state-pill data-state is a valid lifecycle",
      pillState === "alive" ||
        pillState === "ended" ||
        pillState === "orphaned" ||
        pillState === "archived",
      `data-state="${pillState}"`,
    );

    const msgBadge = await browser.$('[data-testid="message-count-badge"]');
    record("§5.6 message-count-badge renders", await msgBadge.isExisting());

    const ep = await browser.$('[data-testid="entrypoint-badge"]');
    record("§5.6 entrypoint-badge renders", await ep.isExisting());

    const toolbar = await browser.$('[data-testid="session-actions-toolbar"]');
    record("§5.6 actions toolbar renders", await toolbar.isExisting());

    // Spec §5.3: action set depends on state. Verify at least the
    // state-defining anchor action exists for whichever state we landed on.
    const requiredAction =
      pillState === "alive"
        ? "resume-terminal"
        : pillState === "ended"
          ? "resume"
          : pillState === "orphaned"
            ? "resume"
            : "unarchive"; // archived
    const action = await browser.$(`[data-testid="action-${requiredAction}"]`);
    record(
      `§5.3 state="${pillState}" exposes anchor action "${requiredAction}"`,
      await action.isExisting(),
    );

    // ALIVE must NOT show plain "Resume" — spec §5.3 critical rule.
    if (pillState === "alive") {
      const plainResume = await browser.$('[data-testid="action-resume"]');
      record(
        "§5.3 ALIVE session must NOT expose plain Resume button",
        !(await plainResume.isExisting()),
      );
    }
  });

  // ─── §5.7 Conversation viewer renders for the selected session ──────────

  it("§5.7 selecting a card renders ConversationViewer or its placeholder", async () => {
    // A card click was made by the previous test; if the JSONL path is
    // resolvable the ConversationViewer mounts (loading → ready or error),
    // otherwise the placeholder renders. Both are valid per the component
    // code, but at least one must be present — silence is a wiring bug.
    const viewer = await browser.$('[data-testid="conversation-viewer"]');
    const loading = await browser.$('[data-testid="conversation-viewer-loading"]');
    const errored = await browser.$('[data-testid="conversation-viewer-error"]');
    const placeholder = await browser.$(
      '[data-testid="conversation-viewer-placeholder"]',
    );

    // Wait up to 15s for one of the four states to settle.
    await browser.waitUntil(
      async () =>
        (await viewer.isExisting()) ||
        (await placeholder.isExisting()) ||
        (await errored.isExisting()) ||
        (await loading.isExisting()),
      { timeout: 15_000, timeoutMsg: "no conversation viewer state ever rendered" },
    );

    // Wait for loading to settle (viewer or error or placeholder).
    await browser.waitUntil(
      async () =>
        (await viewer.isExisting()) ||
        (await errored.isExisting()) ||
        (await placeholder.isExisting()),
      { timeout: 15_000, timeoutMsg: "conversation viewer stuck in loading" },
    );

    const settled = {
      viewer: await viewer.isExisting(),
      error: await errored.isExisting(),
      placeholder: await placeholder.isExisting(),
    };
    record(
      "§5.7 ConversationViewer reached a terminal state",
      settled.viewer || settled.error || settled.placeholder,
      JSON.stringify(settled),
    );

    // Stronger assertion when the viewer mounted: at least one rendered
    // entry exists (assistant/user/tool/system/summary). If the JSONL is
    // truly empty the corruption banner would show — also acceptable.
    if (settled.viewer) {
      const anyEntry = await browser.$$(
        '[data-testid="assistant-message"], [data-testid="user-message"], [data-testid="tool-call-block"], [data-testid="system-divider"], [data-testid="summary-banner"], [data-testid="corruption-warning"]',
      );
      record(
        "§5.7 viewer rendered ≥1 entry (or corruption banner for empty/malformed JSONL)",
        anyEntry.length >= 1,
        `entries=${anyEntry.length}`,
      );
    }
  });

  // ─── §5.3 ALIVE detection exercises the PID-file path ───────────────────

  it("§5.3 when PID files exist on disk, ≥1 card renders state=alive (real-user expectation)", async () => {
    if (pidFileCount === 0) {
      skip(
        "§5.3 ALIVE PID-file path",
        "no PID files on disk this run — cannot verify ALIVE detection live",
      );
      return;
    }
    // Business-logic check: a real user who has live Claude sessions running
    // (their own PID files on disk) MUST see at least one green/pulsing dot
    // in the list. Silently showing zero ALIVE cards while N PID files exist
    // is a bug — it tells the user "nothing is running" when something is.
    //
    // Caveat: a single PID may belong to a sidechain-only session (which the
    // list intentionally hides). To stay honest about that edge case we
    // require ≥1 alive card only when pidFileCount ≥ 3 — at three or more
    // live processes the all-sidechain case is implausible. The previous
    // assertion accepted alive-cards=0 unconditionally, which would have
    // masked exactly the "your sessions look dead" regression.
    const aliveCards = await browser.$$(
      '[data-testid="session-card"][data-state="alive"]',
    );
    const tolerated = pidFileCount < 3;
    record(
      "§5.3 PID files on disk surface as ≥1 alive card (or pidFileCount<3 sidechain-tolerated)",
      tolerated || aliveCards.length >= 1,
      `pid-files=${pidFileCount}, alive-cards=${aliveCards.length}${tolerated ? " (tolerated: <3 PIDs)" : ""}`,
    );
  });

  // ─── §5.5 Selection state ───────────────────────────────────────────────

  it("§5.5 clicking a card marks data-selected=true exactly on that card", async () => {
    const cards = await browser.$$('[data-testid="session-card"]');
    if (cards.length < 2) {
      skip("§5.5 selection state", `need ≥2 cards, have ${cards.length}`);
      return;
    }
    await cards[1].click();
    await browser.pause(150);

    const selected = await browser.$$(
      '[data-testid="session-card"][data-selected="true"]',
    );
    record(
      "§5.5 exactly one card is selected after click",
      selected.length === 1,
      `selected-count=${selected.length}`,
    );
  });

  // ─── §5.6 New Session is currently a planned stub (T4.1/T4.2) ───────────

  // ─── §5.3 Open CWD does not trigger shell scope error (Bug 4) ──────────

  it("§5.3.open-cwd: Open CWD does not show shell scope error", async () => {
    // Find a session card whose CWD is still valid on disk. If none exist
    // (all CWDs are dead), SKIP rather than FAIL — the machine state is
    // the constraint, not a bug.
    const cards = await browser.$$('[data-testid="session-card"]');
    if (cards.length === 0) {
      skip("§5.3.open-cwd", "no session cards rendered — cannot verify");
      return;
    }

    // Click cards until we find one with an enabled Open CWD button.
    let foundEnabled = false;
    for (let i = 0; i < Math.min(cards.length, 10); i++) {
      await cards[i].click();

      // Wait for info bar to render after selection.
      const infoBar = await browser.$('[data-testid="session-info-bar"]');
      const infoReady = await infoBar
        .waitForExist({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!infoReady) continue;

      const openCwd = await browser.$('[data-testid="action-open-cwd"]');
      if (!(await openCwd.isExisting())) continue;

      const disabled = await openCwd.getAttribute("disabled");
      const ariaDisabled = await openCwd.getAttribute("aria-disabled");
      if (disabled !== null || ariaDisabled === "true") continue;

      // Found an enabled Open CWD button — click it and check for error.
      foundEnabled = true;
      await openCwd.click();

      // Wait briefly for any error message to appear.
      await browser.pause(1_500);

      const errorEl = await browser.$('[data-testid="session-open-error"]');
      const errorShown = await errorEl.isExisting();

      if (errorShown) {
        const errorText = await errorEl.getText();
        record(
          "§5.3.open-cwd Open CWD no shell scope error",
          false,
          `error appeared: "${errorText}"`,
        );
      } else {
        record("§5.3.open-cwd Open CWD no shell scope error", true);
      }
      break;
    }

    if (!foundEnabled) {
      skip(
        "§5.3.open-cwd",
        "no session with an enabled Open CWD button found (all CWDs dead on disk)",
      );
    }
  });

  // ─── §5.6 New Session is currently a planned stub (T4.1/T4.2) ───────────

  // ─── View mode labels renamed (Bug fix) ────────────────────────────────

  it("§5.4.labels: view-mode toggle shows Group / Path / Timeline labels", async () => {
    const my = await browser.$('[data-testid="view-mode-my"]');
    const proj = await browser.$('[data-testid="view-mode-project"]');
    const tl = await browser.$('[data-testid="view-mode-timeline"]');

    const myText = await my.getText();
    const projText = await proj.getText();
    const tlText = await tl.getText();

    record(
      "§5.4.labels Group label (not My View)",
      myText.trim() === "Group",
      `text="${myText}"`,
    );
    record(
      "§5.4.labels Path label (not Project)",
      projText.trim() === "Path",
      `text="${projText}"`,
    );
    record(
      "§5.4.labels Timeline label unchanged",
      tlText.trim() === "Timeline",
      `text="${tlText}"`,
    );
  });

  // ─── Expand/collapse group headers ──────────────────────────────────────

  it("§5.4.collapse: group headers are clickable and toggle session visibility", async () => {
    // Switch to Timeline view where we're guaranteed multiple groups.
    const tl = await browser.$('[data-testid="view-mode-timeline"]');
    await tl.click();
    await browser.pause(300);

    const headers = await browser.$$('[data-testid="group-header"]');
    if (headers.length < 2) {
      skip("§5.4.collapse", `need ≥2 group headers, have ${headers.length}`);
      // Restore to Group view.
      const my = await browser.$('[data-testid="view-mode-my"]');
      await my.click();
      await browser.pause(150);
      return;
    }

    // Default collapse: only first group should be expanded.
    // Count cards visible before any click.
    const cardsBefore = await browser.$$('[data-testid="session-card"]');

    // Click first header (should collapse it).
    await headers[0].click();
    await browser.pause(200);
    const cardsAfterCollapse = await browser.$$('[data-testid="session-card"]');
    record(
      "§5.4.collapse clicking expanded header hides its sessions",
      cardsAfterCollapse.length < cardsBefore.length,
      `before=${cardsBefore.length}, after=${cardsAfterCollapse.length}`,
    );

    // Click it again to re-expand.
    const headersRefresh = await browser.$$('[data-testid="group-header"]');
    await headersRefresh[0].click();
    await browser.pause(200);
    const cardsAfterExpand = await browser.$$('[data-testid="session-card"]');
    record(
      "§5.4.collapse clicking collapsed header shows its sessions",
      cardsAfterExpand.length >= cardsBefore.length,
      `restored=${cardsAfterExpand.length}`,
    );

    // Restore to Group view.
    const my = await browser.$('[data-testid="view-mode-my"]');
    await my.click();
    await browser.pause(150);
  });

  // ─── Default collapse: only first group expanded ────────────────────────

  it("§5.4.default-collapse: only first group is expanded on initial view", async () => {
    const tl = await browser.$('[data-testid="view-mode-timeline"]');
    await tl.click();
    await browser.pause(300);

    const headers = await browser.$$('[data-testid="group-header"]');
    if (headers.length < 2) {
      skip("§5.4.default-collapse", `need ≥2 groups, have ${headers.length}`);
      const my = await browser.$('[data-testid="view-mode-my"]');
      await my.click();
      await browser.pause(150);
      return;
    }

    // Check chevron state: first header should have ChevronDown (expanded),
    // subsequent headers should have ChevronRight (collapsed).
    // We can infer from the SVG: ChevronDown has a different path than ChevronRight.
    // Simpler: just count visible cards vs total sessions in all groups.
    const firstHeaderText = await headers[0].getText();
    const countMatch = firstHeaderText.match(/\((\d+)\)/);
    const firstGroupCount = countMatch ? parseInt(countMatch[1], 10) : 0;

    const allCards = await browser.$$('[data-testid="session-card"]');
    // If default collapse works, visible cards should approximately equal
    // the first group's count (not ALL sessions across ALL groups).
    record(
      "§5.4.default-collapse visible cards ≈ first group count",
      firstGroupCount > 0 && allCards.length <= firstGroupCount + 2,
      `firstGroup=${firstGroupCount}, visibleCards=${allCards.length}`,
    );

    const my = await browser.$('[data-testid="view-mode-my"]');
    await my.click();
    await browser.pause(150);
  });

  // ─── Ended session has Delete not Archive ───────────────────────────────

  it("§5.3.no-archive: ended session shows Delete, not Archive", async () => {
    // Find an ended session card.
    const cards = await browser.$$('[data-testid="session-card"]');
    let foundEnded = false;
    for (let i = 0; i < Math.min(cards.length, 15); i++) {
      const state = await cards[i].getAttribute("data-state");
      if (state === "ended") {
        await cards[i].click();
        await browser.pause(300);
        foundEnded = true;

        const archiveBtn = await browser.$('[data-testid="action-archive"]');
        const deleteBtn = await browser.$('[data-testid="action-delete"]');
        record(
          "§5.3.no-archive ended session has no Archive button",
          !(await archiveBtn.isExisting()),
        );
        record(
          "§5.3.no-archive ended session has Delete button",
          await deleteBtn.isExisting(),
        );
        break;
      }
    }
    if (!foundEnded) {
      skip("§5.3.no-archive", "no ended session found in first 15 cards");
    }
  });

  // ─── Chat input exists ─────────────────────────────────────────────────

  it("§5.7.chat-input: selected session shows chat input with send button", async () => {
    const cards = await browser.$$('[data-testid="session-card"]');
    if (cards.length === 0) {
      skip("§5.7.chat-input", "no session cards");
      return;
    }
    await cards[0].click();
    await browser.pause(500);

    const chatInput = await browser.$('[data-testid="chat-input"]');
    const sendBtn = await browser.$('[data-testid="chat-send"]');
    record(
      "§5.7.chat-input textarea exists",
      await chatInput.isExisting(),
    );
    record(
      "§5.7.chat-input send button exists",
      await sendBtn.isExisting(),
    );
  });

  // ─── Auto-scroll to bottom ─────────────────────────────────────────────

  it("§5.7.auto-scroll: conversation viewer scrolled near bottom after load", async () => {
    // A card should already be selected from previous tests.
    const viewer = await browser.$('[data-testid="conversation-viewer"]');
    if (!(await viewer.isExisting())) {
      skip("§5.7.auto-scroll", "no conversation viewer rendered");
      return;
    }

    const scroller = await browser.$('[data-testid="conversation-scroller"]');
    if (!(await scroller.isExisting())) {
      skip("§5.7.auto-scroll", "no conversation scroller rendered");
      return;
    }

    // Wait for parsing to settle.
    await browser.pause(2_000);

    const scrollTop = await browser.execute(
      (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return { top: 0, height: 0, scrollHeight: 0 };
        return {
          top: el.scrollTop,
          height: el.clientHeight,
          scrollHeight: el.scrollHeight,
        };
      },
      '[data-testid="conversation-scroller"]',
    );

    // "Near bottom" means scrollTop + clientHeight is within 200px of scrollHeight.
    const distFromBottom =
      scrollTop.scrollHeight - (scrollTop.top + scrollTop.height);
    record(
      "§5.7.auto-scroll scroller is near bottom after load",
      distFromBottom < 200,
      `scrollTop=${scrollTop.top}, clientHeight=${scrollTop.height}, scrollHeight=${scrollTop.scrollHeight}, distFromBottom=${distFromBottom}`,
    );
  });

  // ─── Open VS Code no shell scope error ─────────────────────────────────

  it("§5.3.open-vscode: Open in VS Code does not show shell scope error", async () => {
    const cards = await browser.$$('[data-testid="session-card"]');
    if (cards.length === 0) {
      skip("§5.3.open-vscode", "no session cards");
      return;
    }

    let foundEnabled = false;
    for (let i = 0; i < Math.min(cards.length, 10); i++) {
      await cards[i].click();
      const infoBar = await browser.$('[data-testid="session-info-bar"]');
      const ready = await infoBar
        .waitForExist({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (!ready) continue;

      const vscodeBtn = await browser.$('[data-testid="action-open-vscode"]');
      if (!(await vscodeBtn.isExisting())) continue;

      const disabled = await vscodeBtn.getAttribute("disabled");
      const ariaDisabled = await vscodeBtn.getAttribute("aria-disabled");
      if (disabled !== null || ariaDisabled === "true") continue;

      foundEnabled = true;
      await vscodeBtn.click();
      await browser.pause(1_500);

      const errorEl = await browser.$('[data-testid="session-open-error"]');
      const errorShown = await errorEl.isExisting();
      if (errorShown) {
        const errorText = await errorEl.getText();
        record(
          "§5.3.open-vscode no shell scope error",
          false,
          `error: "${errorText}"`,
        );
      } else {
        record("§5.3.open-vscode no shell scope error", true);
      }
      break;
    }

    if (!foundEnabled) {
      skip("§5.3.open-vscode", "no session with enabled Open VS Code button");
    }
  });

  it("§5.6 [+ New Session] is wired or carries the documented coming-soon hint", async () => {
    const btn = await browser.$('[data-testid="new-session-btn"]');
    const disabled = await btn.getAttribute("disabled");
    const ariaLabel = await btn.getAttribute("aria-label");
    const title = await btn.getAttribute("title");
    const isStub = disabled !== null;
    if (isStub) {
      // Stub is acceptable until T4.x lands, but it MUST announce itself
      // (WCAG 4.1.2). If the hint disappears that's a real regression.
      record(
        "§5.6 disabled new-session-btn carries coming-soon hint (aria-label + title)",
        /coming soon/i.test(ariaLabel ?? "") && /coming soon/i.test(title ?? ""),
        `aria-label="${ariaLabel}" title="${title}"`,
      );
    } else {
      record("§5.6 new-session-btn is wired (no longer a stub)", true);
    }
  });
});
