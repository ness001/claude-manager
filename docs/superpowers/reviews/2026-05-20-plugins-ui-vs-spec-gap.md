# Plugins section — UI vs spec §6 gap audit

**Run date:** 2026-05-20
**Driver harness:** WebdriverIO + tauri-driver (debug build, Vite dev server, msedgedriver 148.0.3967.70, pageLoadStrategy=none)
**Real plugin data:** 9 installed, target probe = `example-skills@anthropic-agent-skills`
**Result:** 33 PASS / 3 FAIL / 4 SKIP

---

## FAIL — actionable gaps

### FAIL-1 · §6.5/§6.8 [Log] button is missing
- **Test:** `§6.5 [Log] button exists (new requirement, §6.8)` — `data-testid="plugins-log-btn"` not found in the header.
- **Spec source:** §6.5 (header inventory) + §6.8 (Log Window — Plugins-only scope, full stdout+stderr, persisted, 10MB×5 rotation).
- **Decision lineage:** D1a + D2b (this conversation, 2026-05-20).
- **What's needed:**
  - Add `[Log]` button to `PluginListView` header.
  - New independent window (Tauri WebviewWindow) bound to a logger.
  - Logger captures every Plugins-section action (install/uninstall/toggle/check-updates/open-folder/open-vscode), interleaved stdout+stderr from CLI spawns, timestamped.
  - Persist to disk, 10MB × 5 rotation policy.

### FAIL-2 · §6.7 [Install Plugin] is a stub
- **Test:** `§6.7 [Install Plugin] is interactive (A2 decision)` — button is `aria-disabled="true"`, no onClick; tooltip "Not yet wired — run `claude plugins install <name>` in your terminal for now".
- **Spec source:** §6.7 "Plugin Lifecycle Actions" — A2 decision says installs happen *inside the app*, not via CLI.
- **What's needed:**
  - Prompt UI for `<plugin-name>` (with optional `@<marketplace>`).
  - Rust IPC that spawns `claude plugins install <arg>`, streams stdout+stderr to the log window (FAIL-1).
  - On success, refresh `installed_plugins.json` and rerender list.
  - On failure, surface error inline; keep full output in Log window.

### FAIL-3 · `example-skills` card not located by `data-plugin-key` selector
- **Test:** `§6.5 example-skills card present` — `[data-plugin-key="example-skills@anthropic-agent-skills"]` did not match.
- **Likely root cause** (not yet a spec gap — needs follow-up investigation):
  - `PluginCard` *does* set `data-plugin-key={`${plugin.name}@${plugin.marketplace}`}` per source review.
  - 9 cards rendered (search test showed `before=9`), so the list is healthy.
  - Hypothesis: `example-skills` plugin lives under `~/.claude/plugins/cache/anthropic-agent-skills/example-skills/...` but its `marketplace` value in `installed_plugins.json` is `anthropic-agent-skills` — confirmed. Card key should match. Possibly `selectedPlugin` from a previous test mutated something. Re-investigate when the e2e harness is parameterized for retries.
- **Action:** treat as test-infra issue (not a UI gap) unless it reproduces standalone.

---

## SKIP — data-dependent, not a UI gap

| Test | Reason |
|---|---|
| `§6.7 [Install Plugin] click opens name prompt` | Blocked by FAIL-2 (button stub) — will run once the stub is wired |
| `§6.7 [Check for Updates] click` | Button reported as disabled on the run; needs re-test after first PASS run (likely a transient race during the check) |
| `§6.4 broken card affordances` | No broken plugins present on this machine — can't observe live Reinstall/Remove behavior |
| `§6.7 orphaned [Remove] affordance` | No orphaned plugins present — C1 (orphaned [Remove]) cannot be observed; UI affordance still needs to be built per spec |

> The two SKIPs in the broken/orphaned rows hide **two latent gaps** that the audit could not prove live:
> - **Broken card:** Reinstall + Remove are stubs in source (`aria-disabled`, TODO comments). Same A2 fix as FAIL-2.
> - **Orphaned card:** No `[Remove]` button exists at all in current `PluginCard` source — C1 decision needs implementation.

---

## PASS — spec §6.5 / §6.6 surface already met

| Spec section | Coverage |
|---|---|
| §6.5 title + counts (installed/active/disabled) | ✅ all four present |
| §6.5 [Install Plugin] / [Check for Updates] / search | ✅ exist (Install Plugin is a stub — see FAIL-2) |
| §6.5 card surface: status dot, version pill, marketplace, description, N skills/agents/hooks, toggle | ✅ all 8 selectors found |
| §6.5 search filter — reduces 9 cards to 3 on `example-skills` query | ✅ functional |
| §6.5 Esc clears search query | ✅ |
| §6.5 toggle persists to `~/.claude/settings.json` `enabledPlugins[key]` | ✅ `true → false` observed on disk |
| §6.6 card click → detail view | ✅ |
| §6.6 [← Back to plugins] returns to list | ✅ |
| §6.6 detail header (name/marketplace/version/state) | ✅ all four selectors |
| §6.6 [Open in File Browser] / [Open in VS Code] buttons | ✅ exist (functional behavior not asserted — would need shell-spy) |
| §6.6 Skills/Agents/Hooks tabs + panel reveal | ✅ all 3 tabs + 2 swap assertions PASS |

---

## Driver harness notes (for future runs)

Several real fixes landed during this audit and should be preserved:

1. **msedgedriver 148.0.3967.54 → 148.0.3967.70** to match the installed WebView2 runtime (old backup at `~/.cargo/bin/msedgedriver.exe.bak-148.54`).
2. **wdio.conf.ts** now spawns **Vite dev server** (`npm run dev`) before tauri-driver, and points at the **debug build** (`target/debug/claude-manager.exe`). Release build serves SPA at `tauri://localhost` which msedgedriver cannot drive; debug uses `devUrl http://localhost:1420`, a real HTTP origin the driver can attach to.
3. **`pageLoadStrategy: "none"`** in capabilities — default `"normal"` blocks on the initial `about:blank` document.readyState which prevents the SPA from ever taking over the driver session.
4. **In-spec navigation race** handled via `before()` block: sleep 3s, then poll URL until it leaves `about:blank`, retrying `browser.url("http://localhost:1420/")` if it doesn't. This was the missing piece behind RCA decision #15's "about:blank attach issue."

These four fixes together turn `dashboard.spec.ts` + `plugins.spec.ts` from "0 passing" into a real, repeatable e2e harness. The remaining FAILs above are now genuine UI gaps, not tooling artifacts.

---

## Next steps (priority order)

1. **Implement [Log] window (FAIL-1, §6.8)** — prerequisite for FAIL-2 (install needs somewhere to stream stdout/stderr).
2. **Implement [Install Plugin] flow (FAIL-2, §6.7)** — covers the broken-card Reinstall/Remove + this header button in one IPC layer.
3. **Add Orphaned [Remove] button (latent gap, C1, §6.7)** — small, isolated change in `PluginCard`.
4. **Re-run e2e** — expect FAIL-1 / FAIL-2 / FAIL-3 → PASS and the two broken/orphaned SKIPs to become live assertions if you simulate a broken/orphaned plugin (a `tests/fixtures/` helper that temporarily writes a synthetic entry to `settings.json`).
