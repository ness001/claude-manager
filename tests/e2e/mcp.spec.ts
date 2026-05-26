// E2E spec: MCP section UI vs spec §8 surface audit.
//
// Real data lives in ~/.claude.json (NOT settings.json — see DESIGN-CONTEXT.md).
// User-scope servers: $.mcpServers.<name>. Local-scope: $.projects[<path>].mcpServers.<name>.
//
// Each assertion prints `PASS: <spec-ref>` or `FAIL: <spec-ref> — <reason>` so
// the run output doubles as a spec-compliance report.
//
// Mirrors tests/e2e/plugins.spec.ts attach pattern (about:blank → dev URL,
// Ctrl+5 with sidebar-click fallback). MCP shortcut is Ctrl+5 per App.tsx.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@wdio/globals";

const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");

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

function readClaudeJson(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf8")) as Record<string, unknown>;
}
function userMcpServerNames(): string[] {
  const j = readClaudeJson();
  const m = (j["mcpServers"] as Record<string, unknown>) ?? {};
  return Object.keys(m);
}

let originalClaudeJsonRaw: string | null = null;

describe("MCP section — spec §8 surface audit", () => {
  before(async function () {
    this.timeout(120_000);
    try {
      originalClaudeJsonRaw = fs.readFileSync(CLAUDE_JSON, "utf8");
    } catch {
      originalClaudeJsonRaw = null;
    }
    console.log(`[setup] real user MCP servers on disk: ${JSON.stringify(userMcpServerNames())}`);

    // SPA attach — same pattern as plugins.spec.ts.
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
          /* ignore */
        }
        return false;
      },
      { timeout: 30_000, interval: 1_000, timeoutMsg: "SPA never left about:blank" },
    ).then(() => true).catch(() => false);

    if (!ready) {
      const u = await browser.getUrl().catch(() => "n/a");
      throw new Error(`SPA attach failed — url=${u}`);
    }
    console.log(`[diag] SPA attached at url=${await browser.getUrl().catch(() => "n/a")}`);
    await browser.$("#root").waitForExist({ timeout: 30_000 });

    // Navigate to MCP. Ctrl+5 may race the keydown listener; fall back
    // to sidebar nav click by aria-label.
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      await browser.keys(["Control", "5"]);
      opened = await browser
        .$('[data-testid="mcp-panel"]')
        .waitForExist({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      console.log("[diag] Ctrl+5 didn't open MCP; trying sidebar click");
      const navBtn = await browser.$('nav[aria-label="Primary"] button[aria-label="MCP Servers"]');
      if (await navBtn.isExisting()) await navBtn.click();
      await browser.$('[data-testid="mcp-panel"]').waitForExist({ timeout: 10_000 });
    }

    // Wait for first refreshStatus tick to complete — McpSection mounts and
    // calls loadServers() + refreshStatus() in useEffect. Without this wait
    // we might assert against the loading skeleton instead of real cards.
    await browser.waitUntil(
      async () => {
        const skeleton = await browser.$('[data-testid="loading-skeleton"]');
        return !(await skeleton.isExisting());
      },
      { timeout: 30_000, timeoutMsg: "MCP loading skeleton never cleared" },
    );
  });

  after(async () => {
    // Restore ~/.claude.json if any test (e.g. Add Server save) mutated it.
    try {
      if (originalClaudeJsonRaw !== null) {
        const current = fs.readFileSync(CLAUDE_JSON, "utf8");
        if (current !== originalClaudeJsonRaw) {
          fs.writeFileSync(CLAUDE_JSON, originalClaudeJsonRaw);
          console.log("[teardown] restored ~/.claude.json to original contents");
        }
      }
    } catch (e) {
      console.log(`[teardown] restore failed: ${(e as Error).message}`);
    }

    console.log("\n========== GAP REPORT (machine-readable) ==========");
    console.log(JSON.stringify(results, null, 2));
    console.log("========== END GAP REPORT ==========\n");
  });

  // ─── §8.4 Panel header surface ──────────────────────────────────────────

  it("§8.4 header has title, [+ Add Server], [Refresh Status], search bar", async () => {
    const heading = await browser.$('#mcp-panel-heading');
    record(
      "§8.4 panel title 'MCP Servers'",
      (await heading.isExisting()) && (await heading.getText()) === "MCP Servers",
    );

    const addBtn = await browser.$('[data-testid="add-server-btn"]');
    record("§8.4 [Add Server] button exists", await addBtn.isExisting());

    const refreshBtn = await browser.$('[data-testid="refresh-status-btn"]');
    record("§8.4 [Refresh Status] button exists", await refreshBtn.isExisting());

    const search = await browser.$('[data-testid="mcp-search"]');
    record("§8.4 search bar exists", await search.isExisting());
  });

  // ─── §8.4 Real data: cards reflect ~/.claude.json user servers ──────────

  it("§8.4 user-scope cards match ~/.claude.json $.mcpServers keys (real data)", async () => {
    const expectedUsers = userMcpServerNames();
    if (expectedUsers.length === 0) {
      skip("§8.4 user-scope real data", "no user-scope mcp servers in ~/.claude.json");
      return;
    }
    const cards = await browser.$$('[data-testid="mcp-server-card"][data-scope="user"]');
    const renderedNames: string[] = [];
    for (const c of cards) {
      const n = await c.getAttribute("data-server-name");
      if (n) renderedNames.push(n);
    }
    const missing = expectedUsers.filter((n) => !renderedNames.includes(n));
    record(
      "§8.4 every disk user server has a rendered card",
      missing.length === 0,
      `expected=${JSON.stringify(expectedUsers)} rendered=${JSON.stringify(renderedNames)} missing=${JSON.stringify(missing)}`,
    );
    expect(missing.length).toBe(0);
  });

  it("§8.4 user-scope header is rendered when user servers exist", async () => {
    const expectedUsers = userMcpServerNames();
    if (expectedUsers.length === 0) {
      skip("§8.4 user-scope header", "no user-scope mcp servers");
      return;
    }
    const h = await browser.$('[data-testid="scope-header-user"]');
    record(
      "§8.4 user-scope header text",
      (await h.isExisting()) &&
        (await h.getText()) === "User Scope (available in all projects)",
    );
  });

  // ─── §8.3 Card surface (real card) ──────────────────────────────────────

  it("§8.3 first user card shows status dot, name, status/type/scope pills", async () => {
    const expectedUsers = userMcpServerNames();
    if (expectedUsers.length === 0) {
      skip("§8.3 card surface", "no user-scope mcp servers");
      return;
    }
    const target = expectedUsers[0];
    const cardSel = `[data-testid="mcp-server-card"][data-server-name="${target}"]`;
    const card = await browser.$(cardSel);
    record("§8.3 card present for first user server", await card.isExisting(), `name=${target}`);

    const dot = await card.$('[data-testid="status-dot"]');
    record("§8.3 status dot present", await dot.isExisting());
    const dotState = await dot.getAttribute("data-state");
    record(
      "§8.3 status dot data-state ∈ {connected,disconnected,error,starting}",
      ["connected", "disconnected", "error", "starting"].includes(dotState ?? ""),
      `data-state=${dotState}`,
    );

    record("§8.3 status pill", await card.$('[data-testid="status-pill"]').isExisting());
    record("§8.3 type pill", await card.$('[data-testid="type-pill"]').isExisting());
    record("§8.3 scope pill", await card.$('[data-testid="scope-pill"]').isExisting());
  });

  // ─── §8.4 Expanded card body ────────────────────────────────────────────

  it("§8.4 expand toggle reveals McpServerDetail with command/url + env rows", async () => {
    const expectedUsers = userMcpServerNames();
    if (expectedUsers.length === 0) {
      skip("§8.4 expand", "no user-scope mcp servers");
      return;
    }
    const target = expectedUsers[0];
    const cardSel = `[data-testid="mcp-server-card"][data-server-name="${target}"]`;
    const toggle = await browser.$(`${cardSel} [data-testid="expand-toggle"]`);
    record("§8.4 expand toggle exists", await toggle.isExisting());

    await toggle.click();
    const detail = await browser.$(`${cardSel} [data-testid="mcp-server-detail"]`);
    await detail.waitForExist({ timeout: 5_000 });
    record("§8.4 expanded body present", await detail.isExisting());

    // Either command (stdio) or url (sse/http) row must be present — at
    // least one of these testids resolves.
    const cmd = await browser.$(`${cardSel} [data-testid="detail-command"]`);
    const url = await browser.$(`${cardSel} [data-testid="detail-url"]`);
    record(
      "§8.4 detail shows transport-specific row (command or url)",
      (await cmd.isExisting()) || (await url.isExisting()),
    );

    // Collapse for subsequent tests.
    await toggle.click();
  });

  // ─── §8.4 Search (functional) ───────────────────────────────────────────

  it("§8.4 search filters by name (typing reduces visible cards; Esc clears)", async () => {
    const expectedUsers = userMcpServerNames();
    if (expectedUsers.length === 0) {
      skip("§8.4 search filter", "no servers to filter");
      return;
    }
    const target = expectedUsers[0];
    const search = await browser.$('[data-testid="mcp-search"]');
    const beforeCards = await browser.$$('[data-testid="mcp-server-card"]');
    const countBefore = beforeCards.length;

    await search.setValue(target);
    await browser.pause(300);
    const afterCards = await browser.$$('[data-testid="mcp-server-card"]');
    const countAfter = afterCards.length;
    record(
      "§8.4 search by exact server name reduces visible cards to ≥1",
      countAfter >= 1 && countAfter <= countBefore,
      `before=${countBefore} after=${countAfter} query="${target}"`,
    );

    // Esc clears
    await search.click();
    await browser.keys(["Escape"]);
    await browser.pause(200);
    const cleared = await search.getValue();
    record("§8.4 Esc clears search query", cleared === "", `value after Esc = "${cleared}"`);
  });

  it("§8.4 search with no-match query shows the 'No results' status region", async () => {
    const search = await browser.$('[data-testid="mcp-search"]');
    const sentinel = "no-such-mcp-server-xyz-9999";
    await search.setValue(sentinel);
    await browser.pause(300);
    const noMatch = await browser.$('[data-testid="no-matches"]');
    record(
      "§8.4 no-matches region appears for unmatched query",
      await noMatch.isExisting(),
    );

    // Restore
    await search.click();
    await browser.keys(["Escape"]);
    await browser.pause(200);
  });

  // ─── §8.4 Refresh Status (functional) ───────────────────────────────────

  it("§8.4 [Refresh Status] click flips the button to aria-busy=true (UI wiring)", async function () {
    // We only assert the UI wiring: clicking the button triggers the
    // refresh state. The IPC backing it (`claude mcp list`) actually
    // SPAWNS every configured server for health checks (spec §8.3
    // warning) and can run for minutes on machines with slow-spawning
    // servers — testing IPC completion here would conflate UI wiring
    // with backend wall-time and produce flakes that are not UI bugs.
    this.timeout(30_000);
    const btn = await browser.$('[data-testid="refresh-status-btn"]');
    const busyBefore = await btn.getAttribute("aria-busy");
    record(
      "§8.4 [Refresh Status] starts non-busy",
      busyBefore !== "true",
      `aria-busy=${busyBefore}`,
    );
    await btn.click();
    // Poll up to 3s for the busy flip. The refresh-status onClick wraps
    // the IPC call in setIsRefreshing(true) BEFORE awaiting, so the DOM
    // update should land within React's next render tick.
    const wentBusy = await browser
      .waitUntil(
        async () => (await btn.getAttribute("aria-busy")) === "true",
        { timeout: 3_000, interval: 100 },
      )
      .then(() => true)
      .catch(() => false);
    record(
      "§8.4 [Refresh Status] click flips aria-busy to true",
      wentBusy,
      wentBusy ? undefined : "button never became busy within 3s after click",
    );
  });

  // ─── §8.4 / §17.10 Add Server form ──────────────────────────────────────

  it("§17.10 [Add Server] click opens form modal with Name/Scope/Type/Cancel/Save", async () => {
    const addBtn = await browser.$('[data-testid="add-server-btn"]');
    await addBtn.click();

    const form = await browser.$('[data-testid="mcp-form"]');
    await form.waitForExist({ timeout: 5_000 });
    record("§17.10 Add Server opens form modal", await form.isExisting());

    record("§17.10 form has Name input", await browser.$('[data-testid="form-name"]').isExisting());
    record("§17.10 form has Scope=user radio", await browser.$('[data-testid="form-scope-user"]').isExisting());
    record("§17.10 form has Scope=local radio", await browser.$('[data-testid="form-scope-local"]').isExisting());
    record("§17.10 form has Type=stdio radio", await browser.$('[data-testid="form-type-stdio"]').isExisting());
    record("§17.10 form has Type=sse radio", await browser.$('[data-testid="form-type-sse"]').isExisting());
    record("§17.10 form has Type=http radio", await browser.$('[data-testid="form-type-http"]').isExisting());

    // stdio is default → command field should be visible.
    record(
      "§17.10 stdio default shows Command field",
      await browser.$('[data-testid="form-command"]').isExisting(),
    );

    record("§17.10 form has Cancel button", await browser.$('[data-testid="form-cancel"]').isExisting());
    record("§17.10 form has Save button", await browser.$('[data-testid="form-save"]').isExisting());

    // Save should be disabled before the user fills required fields.
    const save = await browser.$('[data-testid="form-save"]');
    const disabledAttr = await save.getAttribute("disabled");
    record(
      "§17.10 Save is disabled when required fields empty",
      disabledAttr !== null,
      `disabled=${disabledAttr}`,
    );

    // Switching Type=sse should swap Command→URL field
    await (await browser.$('[data-testid="form-type-sse"]')).click();
    await browser.pause(100);
    record(
      "§17.10 Type=sse reveals URL field",
      await browser.$('[data-testid="form-url"]').isExisting(),
    );

    // Cancel closes the modal without writing.
    const cancel = await browser.$('[data-testid="form-cancel"]');
    await cancel.click();
    await browser.pause(200);
    const stillOpen = await browser.$('[data-testid="mcp-form"]').isExisting();
    record("§17.10 Cancel closes form modal", !stillOpen);
  });

  // ─── §8.3 Action toolbar (depends on first user card state) ─────────────

  it("§8.3 action toolbar exposes Edit + Remove for non-project servers", async () => {
    const expectedUsers = userMcpServerNames();
    if (expectedUsers.length === 0) {
      skip("§8.3 action toolbar", "no user-scope mcp servers");
      return;
    }
    const target = expectedUsers[0];
    const cardSel = `[data-testid="mcp-server-card"][data-server-name="${target}"]`;
    const card = await browser.$(cardSel);
    // Action toolbar only renders for connected/disconnected/error states
    // (not 'starting'). Real-world disk servers are typically disconnected
    // until refreshStatus marks them otherwise.
    const dotState = await card.$('[data-testid="status-dot"]').getAttribute("data-state");
    if (dotState === "starting") {
      skip("§8.3 toolbar Edit/Remove", `card state is 'starting' — no toolbar actions per §8.3`);
      return;
    }
    const toolbar = await card.$('[data-testid="mcp-actions-toolbar"]');
    record("§8.3 actions toolbar present", await toolbar.isExisting());
    record(
      "§8.3 Edit action present (user scope is editable)",
      await card.$('[data-testid="action-edit"]').isExisting(),
    );
    record(
      "§8.3 Remove action present",
      await card.$('[data-testid="action-remove"]').isExisting(),
    );
  });

  // ─── §8.3 Remove confirmation dialog ────────────────────────────────────

  it("§8.3 Remove → confirm dialog appears; Cancel dismisses without IPC write", async () => {
    const expectedUsers = userMcpServerNames();
    if (expectedUsers.length === 0) {
      skip("§8.3 remove confirm", "no user-scope mcp servers");
      return;
    }
    const target = expectedUsers[0];
    const cardSel = `[data-testid="mcp-server-card"][data-server-name="${target}"]`;
    const removeBtn = await browser.$(`${cardSel} [data-testid="action-remove"]`);
    if (!(await removeBtn.isExisting())) {
      skip("§8.3 remove confirm", "remove action not rendered (status=starting?)");
      return;
    }

    const before = userMcpServerNames();
    await removeBtn.click();
    const dialog = await browser.$(`${cardSel} [data-testid="remove-confirm-dialog"]`);
    await dialog.waitForExist({ timeout: 3_000 });
    record("§8.3 remove confirmation alertdialog appears", await dialog.isExisting());

    const cancel = await browser.$(`${cardSel} [data-testid="remove-cancel"]`);
    await cancel.click();
    await browser.pause(300);
    const after = userMcpServerNames();
    record(
      "§8.3 Cancel keeps server on disk (no destructive IPC fired)",
      after.includes(target) && after.length === before.length,
      `before=${before.length} after=${after.length}`,
    );
  });
});
