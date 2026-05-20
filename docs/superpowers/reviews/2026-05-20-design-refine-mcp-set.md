# MCP + Settings design refinement — 2026-05-20

## Summary

- §8 spec says project-scope writes go to `<root>/.mcp.json`, but **no Rust command exists** for that path — `write_mcp_server` actively rejects `scope="project"` (`src-tauri/src/mcp/commands.rs:120-124`). The §17.10 form makes this invisible (only User/Local radios). Result: a project-scope entry surfaced in §8.1 row 3 cannot be created or edited at all.
- `write_mcp_server` corrupts schema for non-stdio types: it stores `{type, env}` only (`mcp-loader.ts:206-221` builds `cfg` but **never copies `url`/`headers` when type=sse|http on the existing entry** because `saveMcpServer` only includes them when defined on the new server — fine for new, but the form lets you save an SSE server with empty URL via Save-after-error retry edge cases — see §8 functional gap #3).
- `refreshStatus` parses `claude mcp list` output with a regex (`^([\w.-]+)\s*:\s*(.*)$`) that **doesn't match the real CLI output format** (`mcp-store.ts:110-113`). Spec §8.3 specifies state mapping but never pins the actual parser contract. Status will silently stay `disconnected` forever for many users.
- §9 Settings is a stub: `SettingsSection.tsx` renders only a heading + tagline (29 lines). Spec lists 7 sections; **zero are implemented**. No store, no IPC commands, no SQLite columns — and no orphan-placeholder TODOs (R2 violation across the entire section).
- §9.2 table claims Permissions edits `settings.json + settings.local.json` but never specifies **merge precedence** or **which file a new entry writes to** — silent data-loss risk.
- §17.10 form spec contradicts code reality: spec says Save writes to `~/.claude.json` for all scopes (line 673), but Rust correctly refuses project scope. Spec needs to align: split into "user/local → `~/.claude.json`" and "project → `<root>/.mcp.json`".

## §8 MCP Servers — functional gaps

| # | Spec says | Code does | Broken / missing |
|---|---|---|---|
| 1 | §8.1 line 322: project scope lives in `<project-root>/.mcp.json` | No `read_project_mcp_write` / `write_project_mcp` command exists. `write_mcp_server` returns Err for `scope="project"` (`commands.rs:120-124`). `read_mcp_json` reads only (`commands.rs:45-52`). | Cannot create/edit/remove project-scope servers from UI. McpServerCard correctly disables Edit (`McpServerCard.tsx:275-283`) but Add never offers project radio (`McpServerForm.tsx:219`), and Remove for project scope hits the Err path silently (`commands.rs:171-175`). |
| 2 | §8.2 line 341: `tools[]` runtime-only, no static list | `mcp-types.ts:48` declares `tools?: string[]`, `McpServerDetail.tsx:57-76` renders them, but **nothing ever populates `tools`** — `loadMcpServers` doesn't, `refreshStatus` doesn't. | Tools row is dead code. Either remove from spec/code or define an enrichment pipeline (probably out of v1 scope). |
| 3 | §8.3 line 340: status "Computed via `claude mcp list`" | `refreshStatus` parses lines with `/^([\w.-]+)\s*:\s*(.*)$/` (`mcp-store.ts:111-114`). Actual `claude mcp list` output uses indented multi-line format with " ✓ Connected" / " ✗ Failed" patterns — none of those match the regex. | Status stays `disconnected` for all servers in practice. Spec §8.3 must pin the parser contract OR mandate `claude mcp get <name>` per-server. |
| 4 | §8.3 line 352 warns `claude mcp list` SPAWNS servers — "Only invoke in trusted directories" | `check_mcp_status` (`commands.rs:187-189`) shells out to `claude` in **the app's CWD**, not the project root. The McpSection runs it on mount + every 15s (`McpSection.tsx:34-67`). | No "trusted directory" gate exists. The auto-poll on mount violates the spec's own warning — should be user-initiated only, OR scoped per-project. |
| 5 | §8.1 line 326: trust tracking via `enabledMcpjsonServers` / `disabledMcpjsonServers` | `mcp-loader.ts:165-173` reads these into `isTrusted`, but **no UI surfaces or toggles trust**. McpServerCard doesn't render `isTrusted`; no Enable/Disable action. | Trust is a load-only ghost. Spec says nothing about how the user toggles trust — gap to fill OR remove from data model. |
| 6 | §10 line 302 (refresh strategy): "15s visible / 60s background / 2s after action" | Implementation matches cadence (`McpSection.tsx:18-77`). | OK — but no error backoff. A failing `check_mcp_status` keeps hammering every 15s. |
| 7 | §8.4 line 360: "[Refresh Status] button" | Implemented. | But spec doesn't define what happens on Refresh failure — Refresh Status that errors leaves stale status with a red banner (`McpPanel.tsx:148-156`). Spec must define the staleness policy. |
| 8 | §17.10 line 673: "Save action writes to `~/.claude.json` at the appropriate JSON path based on scope" | Rust correctly rejects `scope="project"` for `~/.claude.json` (`commands.rs:120-124`). | Spec sentence is wrong for project scope; refactor needed (see §8 proposed changes). |
| 9 | Spec is silent on **OAuth** servers (DESIGN-CONTEXT.md §16 mentions MCP verifier caught OAuth support) | No OAuth UI, no token storage. | Either explicitly defer to v2 in the spec, OR add §8.5 OAuth support. Currently floating. |
| 10 | Spec is silent on `cwd` source for local-scope writes | `mcp-store.ts:8,57,126` exposes a `cwd` field but **nothing sets it** in production — `useMcpStore` ships with `cwd: ""`. `write_mcp_server` Err-s with "local scope requires cwd" (`commands.rs:100-102`) for any local-scope save. | Local-scope add is broken end-to-end. McpSection.tsx never calls `setCwd`. The comment at `mcp-store.ts:7` admits "T3.12 will wire this from the session store" — that's an R2 orphan: no TODO marker in code, no T3.12 visible. |

## §8 MCP Servers — UI problems

| # | Area | Issue | Evidence |
|---|---|---|---|
| U1 | Form scope radios | Only "user / local" offered (`McpServerForm.tsx:219`). Per spec §17.10 line 666 — and that matches Rust constraints — but the visible scope is one-way: there is no path to add a project-scope server from UI at all. Spec must explicitly call out the project-scope flow. | McpServerForm.tsx:218-231 |
| U2 | Form cwd | `cwd` prop is taken from store (`McpSection.tsx:28`) which is `""` (see gap #10). Selecting "local" + Save fails with "local scope requires cwd". No UI surfaces this until submit. | mcp-store.ts:57, McpServerForm.tsx:150 |
| U3 | Env mask reveal | `MaskedValue` masks **every env var** including non-secret ones like `NODE_ENV` (`McpServerDetail.tsx:48-55`). No allow/deny heuristic. Spec doesn't define mask policy. | McpServerDetail.tsx:141-186 |
| U4 | Env var name leakage when masked | The **key name** is rendered unmasked next to the masked value (`McpServerDetail.tsx:127`). For shoulder-surfing scenarios this is usually fine, but the spec is silent on whether the key name itself is sensitive (e.g., `ANTHROPIC_API_KEY`). | McpServerDetail.tsx:122-138 |
| U5 | Args input UX | `args` tag input commits on Enter only (`McpServerForm.tsx:288-293`). Typing `--flag value` and tabbing away **loses the draft**. Spec §17.10 line 668 says "Tag-style multi-input" — needs to specify commit triggers (Enter, blur, comma). | McpServerForm.tsx:283-298 |
| U6 | Empty state / loading | Spec §17.6 line 621 says "2 skeleton cards per scope group" — implemented (`McpPanel.tsx:177-185`). OK. |  |
| U7 | Error state for failed server | Spec §8.3 line 349 says "Edit, Remove, Retry, View Logs (prominent)" for error state. View Logs is hardcoded `disabled` with `title="Coming soon"` (`McpServerCard.tsx:233-242`). **R2 violation** — no `TODO(T<phase>.<num>)` marker on the disabled stub. Same for Retry, Cancel, View Tools (`McpServerCard.tsx:196-263`). | McpServerCard.tsx:196-262 |
| U8 | Overridden badge | Renders correctly but spec §8.1 line 324 says "dimmed with `Overridden by [scope]` badge" — no spec on whether dimmed servers are still actionable. Code allows Edit/Remove on them (`McpServerCard.tsx:264-293`). Probably wrong: removing the shadowed entry has no visible effect because the winner still shows. | McpServerCard.tsx:86-94, 264-293 |
| U9 | Empty `env: {}` vs missing | Spec §8.2 line 337 says `env` is always `{}`. `loadMcpServers` enforces (`mcp-loader.ts:86`). `MaskedValue` then renders "—" for empty — sighted users see a dash where they expect env. Empty-state copy missing. | McpServerDetail.tsx:115-118 |
| U10 | Scope group rendering when empty | `McpPanel.tsx:231` skips empty scope groups. Spec §8.4 line 357 implies always showing all 3 scope headers ("Scope headers: 'User Scope', 'Local Scope', 'Project Scope'"). Decide: always-show vs. hide-when-empty. | McpPanel.tsx:230-231 |
| U11 | Refresh error a11y | `role="alert"` on a static `<p>` (`McpPanel.tsx:148-156`) means SR users hear the error every render. Should fire only on transition into error. |  |
| U12 | "Starting" state has no source | Spec §8.3 line 351 defines a `starting` state with "Cancel (if >10s)" action. `mapStatusLine` (`mcp-loader.ts:104-112`) can produce it from `claude mcp list` output, but no UI ever sets a timer to enable Cancel. Action is permanently disabled. | McpServerCard.tsx:246-253 |
| U13 | No "View Logs" data source | Spec §8.3 mentions View Logs across all states. No log file location is defined anywhere in the spec. R2 orphan. | spec §8.3 |
| U14 | Add Server button focus return | `McpServerForm` correctly returns focus on close (`McpServerForm.tsx:82-94`). OK. |  |
| U15 | `cwd` prop & per-row local-scope | The store has a single `cwd`. But `~/.claude.json` `$.projects` keys are **many** project paths. A local-scope server may belong to any one of them. Currently the card just labels them "local" with no path. Need to display the owning project path. | mcp-loader.ts:134-139, McpServerCard.tsx |

## §8 MCP Servers — proposed spec changes

**Replace §8.1 lines 312-326 with:**

```
## 8. MCP Servers

### 8.1 Config Locations

MCP server configurations live in two files (NOT `settings.json`):

| Scope | File | JSON Path | Writable from UI? |
|---|---|---|---|
| User | `~/.claude.json` | `$.mcpServers.<name>` | Yes |
| Local | `~/.claude.json` | `$.projects["<path>"].mcpServers.<name>` | Yes — requires explicit project path selector |
| Project | `<project-root>/.mcp.json` | `$.mcpServers.<name>` (or top-level legacy) | Yes — via separate `write_project_mcp_json` IPC command |

**Precedence:** project > local > user. Same name at multiple scopes: most specific wins. Shadowed server card is dimmed with "Overridden by [scope]" badge and offers no Edit/Remove (use the winning entry).

**Local-scope project key:** Each local-scope entry is keyed by an absolute project path. The UI MUST display this path on the card (e.g., `local · C:\projects\demo`). The Add/Edit form for local scope MUST present a project selector populated from `$.projects` keys plus a "Browse…" affordance for new paths.

**Trust tracking:** `enabledMcpjsonServers` / `disabledMcpjsonServers` arrays per `$.projects["<path>"]` entry in `~/.claude.json` control whether a project-scope server is trusted by Claude CLI. The MCP card for a project-scope entry MUST surface trust state as a toggle ("Trust this server"); flipping it edits the relevant array.
```

**Replace §8.3 lines 343-353 with:**

```
### 8.3 Server States

| State | Dot Color | Actions | Source |
|---|---|---|---|
| Connected | Green | Edit, Remove, Restart, View Tools, View Logs | `claude mcp list` line "✓ Connected" or `claude mcp get` returns status=connected |
| Disconnected | Gray (hollow) | Edit, Remove, Connect, View Logs | Default; absence from `claude mcp list` output |
| Error | Red | Edit, Remove, Retry, View Logs (prominent) | `claude mcp list` line "✗ Failed" / "✗ Error" |
| Starting | Amber (pulsing) | Cancel (if >10s) | Locally tracked between user-initiated Connect/Retry and next status refresh; NOT inferred from CLI output |

**Status parser contract:** `claude mcp list` output is normalized by `mapStatusLine`. The parser MUST handle the actual CLI output format (indented multi-line, prefixed with `✓`/`✗` glyphs). Unit tests pin the contract against captured real CLI output fixtures (`tests/fixtures/mcp-list-output/*.txt`).

**Spawn warning:** `claude mcp list` and `claude mcp get` actually SPAWN servers for health checks. The auto-refresh poll MUST be gated to (a) the MCP panel being visible AND (b) the user having opted into auto-refresh (default: off after first launch). User-initiated [Refresh Status] is always allowed. Per-server logs view, when implemented, lives at `~/.claude/mcp-logs/<server-name>.log` (define alongside the View Logs task in the plan).

**Refresh failure policy:** A failed `check_mcp_status` call freezes all server statuses at their last-known value (not reset to disconnected) and surfaces a non-dismissable inline error with manual Retry. Auto-refresh suspends after 3 consecutive failures until the user dismisses or retries.
```

**Insert after §8.4 (after line 362):**

```
### 8.5 Out of Scope for v1

- MCP server tool discovery (`tools[]` / `toolCount`). The CLI offers no static introspection; live tool listing requires an active session connection. Defer to v2 with a "View Tools" action that opens an ephemeral connection.
- OAuth-authenticated MCP servers (referenced in DESIGN-CONTEXT.md §16 research findings). The Add/Edit form's `headers` Bearer-token field is the v1 workaround.
- MCP server logs UI. Surface "View Logs" only after a log file location is committed to spec.
```

**Replace §17.10 lines 658-673 with:**

```
## 17.10 MCP Add/Edit Form Fields

The "Add Server" and "Edit" dialogs share the same form:

| Field | Control | Validation |
|---|---|---|
| Name | Text input | Required, unique within scope, alphanumeric + hyphens |
| Scope | Radio: User / Local / Project | Required. Project shows the Project Path selector (next row). |
| Project Path | Required when scope=Local or scope=Project | Combobox populated from `$.projects` keys (Local) or open-folder dialog (Project). Hidden when scope=User. |
| Type | Radio: stdio / sse / http | Required, changes form fields below |
| Command (stdio) | Text input | Required for stdio |
| Args (stdio) | Tag-style multi-input | Optional. Commit triggers: Enter, comma, blur. Draft preserved on blur. |
| URL (sse/http) | Text input | Required for sse/http, must be valid URL |
| Headers (sse/http) | Key-value pair editor | Optional, supports `${ENV_VAR}` syntax |
| Env | Key-value pair editor | Optional. Values marked secret (auto-detected: name matches `/key|token|secret|password/i`, or user-tagged) render masked in the detail view. |

**Save routing:**
- `scope=user`: writes `~/.claude.json` `$.mcpServers.<name>` via `write_mcp_server`.
- `scope=local`: writes `~/.claude.json` `$.projects["<path>"].mcpServers.<name>` via `write_mcp_server`.
- `scope=project`: writes `<path>/.mcp.json` `$.mcpServers.<name>` via the new `write_project_mcp_json` IPC command.

All writes are atomic (temp + rename, already implemented in `atomic_write`). Edit MUST NOT change scope: scope is read-only when editing — to move scopes, Remove then Add.
```

## §9 Settings — functional gaps

| # | Spec says | Code does | Broken / missing |
|---|---|---|---|
| S1 | §9 lines 366-389 specify 7 tabs across 4 files | `SettingsSection.tsx:1-29` renders only `<h1>Settings</h1>` + a `<p>` tagline. No store, no IPC commands, no components. | Entire section is a placeholder. No `TODO(T4.<n>)` marker — R2 violation. Phase 4 plan lists tasks T4.6-T4.8 for it (verified via `grep` in plan) but the placeholder doesn't reference them. |
| S2 | §9.2 table conflates `settings.json` and `settings.local.json` for Permissions | No spec on merge semantics or write-target. | Underspecified: which file does a new `permissions.allow` entry land in? Spec must answer this (recommendation: local for machine-specific, user for shared). |
| S3 | §9.2 General/API: "API base URL, auth token (masked with reveal toggle), default model dropdown, small/fast model, primary API key" with sources `settings.json (env), config.json` | Not implemented. | Spec doesn't pin **which key goes to which file**. `ANTHROPIC_API_KEY` env var lives in `settings.json.env`; `primaryApiKey` lives in `config.json`. Need an explicit per-field mapping table. |
| S4 | §9.2 Plugins: "Toggle list linking to Plugins panel" | Not implemented. | Plugin enablement already lives in `settings.json.enabledPlugins` per DESIGN-CONTEXT.md §4. Spec must specify: is this tab read-only (link to /plugins) or does it duplicate the toggle? Two writers on one key = drift. |
| S5 | §9.2 Appearance: "App SQLite only" | App SQLite schema lives in `src/lib/db.ts` (per CLAUDE.md). No `appearance_settings` table or migration. | New SQLite columns + migration required. Currently `useThemeStore` is in-memory only. |
| S6 | §9.2 Usage & Stats: "read-only" | Not implemented. But `stats-cache.json` is read elsewhere (per DESIGN-CONTEXT.md §18). | Just a reuse task. Spec needs to clarify Settings is a window onto the same Dashboard data, not a second source. |
| S7 | §9.2 Advanced: "Raw JSON editor (Monaco)" | Not implemented. Monaco isn't in tech stack (DESIGN-CONTEXT.md §1 lists `shiki`, no Monaco). | Tech-stack mismatch. Either add Monaco as a dependency in spec or use CodeMirror / shiki-readonly + textarea. |
| S8 | §9.2 Advanced: "reset app data" | Not implemented. | Destructive action. Spec must specify: confirms-with-typed-name? Removes SQLite only or also dismissible-prompts state? Must define danger-zone scope. |
| S9 | §9.2 Permissions: `skipDangerousModePermissionPrompt` "(red warning if true)" | Not implemented. | Underspecified: where does it write? `settings.json` or `settings.local.json`? DESIGN-CONTEXT.md doesn't say. |
| S10 | Spec is silent on **migration** of existing user settings | n/a | If user already has `~/.claude/settings.json` with custom keys, do we round-trip unknown keys? (Yes for MCP — `commands.rs:264-282` test proves it preserves unrelated keys.) Spec must commit to round-trip preservation for all settings IPC. |
| S11 | Spec is silent on **`config.json` location** | n/a | DESIGN-CONTEXT.md §13 says `~/.claude/config.json`. Spec §9 table just says `config.json`. Pin the full path. |
| S12 | Sources of truth | Per DESIGN-CONTEXT.md §13 line 357 `history.jsonl` is at `~/.claude/history.jsonl`. Spec §9 doesn't mention it but it's referenced for "recent CWDs" in §10. Settings doesn't manage it but Advanced "config file paths" list should include it. |  |

## §9 Settings — UI problems

| # | Area | Issue | Evidence |
|---|---|---|---|
| V1 | Two-column layout | §9.1 says "Left sidebar (200px): 7 section links with active indicator". Not implemented. No layout component. | SettingsSection.tsx:13-27 |
| V2 | Tab a11y | Spec doesn't specify whether tabs are `role="tablist"` + `role="tab"` (APG Tabs pattern) or `<nav>` of links. Without a contract, implementers will guess. | spec §9.1 |
| V3 | Write-back semantics | Per-tab the spec lists "Source File(s)" but never says **when** the write happens (on blur? on Save button? autosave?). | spec §9.2 |
| V4 | Reveal-mask for secrets | §9.2 General mentions "auth token (masked with reveal toggle)" — good. But Env tab `KeyValueEditor` is generic (`McpServerForm.tsx:393-453`); should be shared. Spec says nothing about whether reveal state persists across tab switches. | spec §9.2 |
| V5 | Danger zone | `skipDangerousModePermissionPrompt` + "reset app data" need explicit Danger Zone UI grouping with confirmation flow. Spec says only "red warning if true" — insufficient. | spec §9.2 lines 379, 384 |
| V6 | Loading state | §17.6 line 622: "Skeleton form fields" / "n/a (forms always have defaults)". Contradicts itself; loading a config file is async — there IS a loading state. Pick one. | spec §17.6 |
| V7 | Error state | What if `~/.claude/settings.json` is malformed? Spec §17.5 line 605 covers JSONL but not settings.json. Must add. | spec §17.5 |
| V8 | Empty state | §17.6 says n/a. But Permissions allow-list could be empty; needs a "no patterns yet" affordance. | spec §17.6 |
| V9 | Dirty-state guard | Spec never mentions unsaved-changes warning on tab switch / window close. Must specify. | spec §9 |
| V10 | Permissions allow-list (100+ patterns) | §9.2 line 379 says "100+ patterns" — UI must virtualize. Spec doesn't say so. Performance bound §17.8 doesn't cover Settings. | spec §9.2, §17.8 |
| V11 | Plugins toggle dual-write | If both this tab AND the Plugins section can toggle `enabledPlugins`, must define single source of truth + reactivity (Zustand subscribe). | spec §9.2 line 380 |
| V12 | Appearance lacks Sidebar Position semantics | §9.2 line 382 mentions "sidebar position". App is single-window with icon rail (DESIGN-CONTEXT.md §1). Where else would it go? Either define values (left/right/bottom) or drop. | spec §9.2 |
| V13 | Theme=system + .dark class race | CLAUDE.md ("State management") says App.tsx owns the `<html>.dark` toggle and the `prefers-color-scheme` listener. Settings Appearance tab MUST go through `useThemeStore` only — never touch `<html>` directly. Spec should call this out. | CLAUDE.md, src/stores/theme-store.ts |

## §9 Settings — proposed spec changes

**Replace §9.1-§9.2 lines 368-389 with:**

```
### 9.1 Layout

Two-column layout in `SettingsLayout.tsx`:
- Left sidebar (200px): 7 section links as a `<nav aria-label="Settings sections">` with `aria-current="page"` on the active link
- Right content: Section-specific form, lazy-mounted on selection
- Unsaved-changes guard: switching tabs with `isDirty=true` opens a confirm dialog (Discard / Cancel)

### 9.2 Sections

Each section MUST declare its file-of-truth and per-field write target. Round-trip preservation is mandatory: unknown keys in the source file are read, retained in memory, and re-emitted on write.

| Section | File of Truth | Per-Field Map | Write Trigger |
|---|---|---|---|
| General / API | `~/.claude/settings.json` (`env.ANTHROPIC_BASE_URL`, `env.ANTHROPIC_AUTH_TOKEN`, `env.ANTHROPIC_MODEL`, `env.ANTHROPIC_SMALL_FAST_MODEL`), `~/.claude/config.json` (`primaryApiKey`) | See §9.3 | Explicit [Save] button per tab; disabled until dirty |
| Permissions | `~/.claude/settings.json` (`permissions.allow`, default target), `~/.claude/settings.local.json` (machine-specific overrides), `~/.claude/settings.json` (`skipDangerousModePermissionPrompt`) | Each rule row has a scope toggle (Shared / This machine). Merge order at read time: local overrides user. | Explicit Save |
| Plugins | `~/.claude/settings.json` (`enabledPlugins`) | Read-only mirror — toggles deep-link to the Plugins section, which owns writes. | n/a (delegated) |
| Environment | `~/.claude/settings.json` (`env`) | Key-value editor. Excludes the four `ANTHROPIC_*` keys owned by General. | Explicit Save |
| Appearance | App SQLite (`app_settings` table, see §17.9 + new migration) | `theme`, `terminalFontSize`, `terminalFontFamily`, `compactMode`. Writes go through `useThemeStore` only; never touches `<html>` directly. | Live (autosave) — these are local UI prefs, not config |
| Usage & Stats | `~/.claude/stats-cache.json` (READ-ONLY — see DESIGN-CONTEXT.md §18) | Render-only. Export CSV/JSON via Tauri save-file dialog. | n/a (no writes) |
| Advanced | All config files | Read-only viewer (shiki) + "Open in File Browser" + reset-app-data Danger Zone | Reset triggers typed-confirm modal ("type DELETE to confirm"); removes SQLite only; preserves Claude Code config |

### 9.3 General / API per-field map

| Field | File | Path | Notes |
|---|---|---|---|
| API base URL | `settings.json` | `$.env.ANTHROPIC_BASE_URL` | string |
| Auth token | `settings.json` | `$.env.ANTHROPIC_AUTH_TOKEN` | masked, reveal toggle |
| Default model | `settings.json` | `$.env.ANTHROPIC_MODEL` | dropdown of CLI-known aliases |
| Small/fast model | `settings.json` | `$.env.ANTHROPIC_SMALL_FAST_MODEL` | dropdown |
| Primary API key | `config.json` | `$.primaryApiKey` | masked, reveal toggle |

### 9.4 Danger Zone

A visually-grouped section at the bottom of the Permissions and Advanced tabs:
- Red border, "Danger Zone" header
- `skipDangerousModePermissionPrompt` toggle requires checkbox-confirm ("I understand this disables permission prompts for risky tools")
- Reset App Data requires typed confirm ("type DELETE to confirm"); destroys app SQLite only; preserves all Claude Code config

### 9.5 Loading & Error States

- Loading: skeleton form fields per tab (overrides the conflicting §17.6 "n/a" entry — see §17.6 update below)
- Malformed config file: render an inline error banner with the parser error + path + [Open in File Browser]; disable Save until resolved
- Missing file: treat as empty config (`{}`); show informational note "Using defaults (no `<path>` found)"
- Write failure (e.g., permission denied): error toast + leave dirty state intact so user can retry
```

**Replace §17.6 line 622 with:**

```
| Settings | Skeleton form fields per tab while config files load | Permissions tab only: "No allow patterns yet. Add the first rule." with [+ Add Rule] |
```

## Out of scope / flagged for cross-section attention

- **Dashboard (§6):** Spec §10 says "MCP status" feeds Dashboard system health. With current parser bug (status always `disconnected`), Dashboard MCP indicator will be permanently wrong. Cross-flag to the Dashboard reviewer to confirm the contract.
- **Plugins (§4 / DESIGN-CONTEXT.md):** `enabledPlugins` is touched by both Plugins section and §9.2 Settings → Plugins. Single-writer rule must be enforced cross-section; flag to Plugins reviewer.
- **Sessions (§3):** `mcp-store.cwd` is supposed to come from "the session store" (`mcp-store.ts:7` comment). The session store ownership of "current project root" needs to be defined cross-section before MCP local-scope add can work end-to-end.
- **Theme / global (CLAUDE.md):** Appearance tab in Settings must funnel through `useThemeStore` only. Cross-flag to whoever owns the global theme/state spec to confirm the store API supports `terminalFontSize`/`terminalFontFamily`/`compactMode` (currently `mode` only).
- **Tech stack (DESIGN-CONTEXT.md §1):** Spec §9.2 Advanced says "Monaco" — not in the stack. Pick CodeMirror, shiki-readonly, or add Monaco. Cross-flag to the Tech-stack/global reviewer.
- **R2 sweep:** Every disabled stub in `McpServerCard.tsx` (View Tools, View Logs, Retry, Cancel — lines 196-262) lacks the `TODO(T<phase>.<num>)` marker. Cross-flag to a codebase-wide R2 audit.
- **R3 / Smoke:** Phase 4 plan does end with Smoke DoD (T4.x). Confirm Settings is exercised — currently the section is a 29-line stub so the smoke test cannot embed widget-level real-data values for any of the 7 tabs.
