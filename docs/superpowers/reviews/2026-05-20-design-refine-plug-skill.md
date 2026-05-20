# Plugins + Skills design refinement — 2026-05-20

Scope: spec §6 (lines 231–295) and §7 (lines 296–311) of
`docs/superpowers/specs/2026-05-03-claude-manager-design.md`, plus the
implementing code under `src/sections/{Plugins,Skills}Section.tsx`,
`src/components/{plugins,skills}/`, `src/lib/{plugin,skill}-*.ts`, and
`src-tauri/src/{plugins,skills}/commands.rs`.

Spec line numbers below refer to that file. Code line numbers are absolute.

## Summary

- Spec §6.1 / §6.5 understate the on-disk reality: cache path is **4-level**
  (`cache/{marketplace}/{plugin}/{version}/`) not 3-level, `plugin.json` is
  inside `.claude-plugin/`, and the "tree view" in §6.6 was never built —
  the code is a flat list per tab.
- Spec is missing CRUD semantics entirely: no acceptance criteria for
  Install / Reinstall / Remove / Update. Three stub buttons ship as
  hardcoded `disabled` placeholders that R2-violate (they cite
  `ui-defect-sweep#L293/L294/L295` checkbox line numbers, not a
  `T<phase>.<num>` task ID).
- Spec §6.5 says "Update Available" pill exists but is silent on what
  clicking it does. Same for the §6.5 "Install Plugin" button. Both
  are dead-ends in the running app.
- Spec §6.4 "Orphaned" definition has a real bug: code (`plugin-loader.ts:144`)
  only emits orphaned entries when the enabled flag is `true`. Spec wording
  "in `enabledPlugins` but NOT in installed_plugins" is silent on `false`,
  which gives no observable state — fine, but the spec should say so.
- Spec §6.4 says "Active = Installed + enabled + files exist" but the code's
  `derivePluginState` (`plugin-loader.ts:89-97`) checks only `inRegistry &&
  pathExists` — `enabled=false` over a present plugin becomes `disabled`,
  matching spec; however, the same function never returns `update-available`
  (set later in `plugin-updates.ts:78`). Spec needs to call out that state
  transitions are layered (load → update-check overlay).
- Spec §7 is one paragraph + one subsection. It is silent on: SKILL.md schema,
  what happens with duplicate skill names, ordering, allowed/disallowed files
  in a skill directory, and whether the bundled `document-skills`-style
  layout (a plugin containing a `skills/` dir with no top-level `SKILL.md`)
  counts as a "custom" skill (today the code excludes it correctly, but
  the spec doesn't say so).

## §6 Plugins — functional gaps

| # | Topic | Spec says (line) | Code does | Gap |
|---|---|---|---|---|
| F1 | Cache path depth | "3-level nesting" (line 252) | DESIGN-CONTEXT §13 shows `cache/{marketplace}/{plugin-name}/{version}/` = **4 segments under `cache/`** | Spec mis-counts. Either change to "3 sub-levels under `cache/`" or restate as `cache/<marketplace>/<plugin>/<version>/` and drop the "3-level" framing. |
| F2 | Manifest location | "`plugin.json` lives inside the `.claude-plugin/` subdirectory" (line 282) — only stated as a fallback nuance, not the primary path | `read_manifest` (`commands.rs:272-289`) reads `.claude-plugin/plugin.json` as the **preferred** source | Spec §6.5 buries the canonical location inside a fallback paragraph. Promote it: "Manifest path: `<installPath>/.claude-plugin/plugin.json`. Fallback: `<installPath>/.claude-plugin/marketplace.json` → first `plugins[]` entry." |
| F3 | Skills sub-layout | Spec §6.1 lists `skills/ → .md files with YAML frontmatter` (line 239) | Code `scan_skills` (`commands.rs:166-197`) supports BOTH `skills/<name>/SKILL.md` AND legacy flat `skills/<name>.md` | Spec is silent on the nested-directory shape that is actually preferred. Document both, mark `SKILL.md`-in-subdir as preferred, flat as legacy. |
| F4 | Install Plugin | "[Install Plugin] button" (line 278) | Hardcoded `disabled` stub (`PluginListView.tsx:83-101`); no IPC exists | Spec lists the button but has no acceptance criteria, no flow, no error model. Either declare it deferred + add a wire-up task ID, or define the marketplace-browse / CLI-invoke flow. |
| F5 | Reinstall / Remove | "Reinstall/Remove buttons" for Broken (line 271, line 280) | Both hardcoded `disabled` stubs (`PluginCard.tsx:280-310`, `:315-333`); no IPC exists | Same as F4. Plus: R2 violation — TODOs reference `ui-defect-sweep#L293/L294` checkbox line numbers, not a `T<phase>.<num>` task ID. |
| F6 | Update Available action | "Amber 'Update' pill" (line 273); §13 line 483 mentions "manual 'Check for updates' button" | Pill renders (`PluginCard.tsx:180-196`); clicking does **nothing** — there is no install-update action wired | Spec defines the surface but no `Update` action. Need: behavior when pill is clicked (Run `claude plugins update <key>`? No-op? Open command palette?). Today it's purely decorative. |
| F7 | Toggle granularity | Spec §6.4 implies one toggle per plugin | Code (`plugin-store.ts:102-108`) re-derives state for **all installation rows that share `<name>@<marketplace>`** when one is toggled. `installed_plugins.json` values are arrays (DESIGN-CONTEXT §4 / line 250) | Spec hides this. Either declare "enabledPlugins map is keyed at the `name@marketplace` level — toggling affects every installation" or describe per-installation toggling. The current code implements the former but the spec doesn't say so. |
| F8 | Orphaned semantics | Spec §6.4 line 272: "In `enabledPlugins` but NOT in `installed_plugins`" | Code (`plugin-loader.ts:144-161`) only emits orphan when `enabledMap[key] === true`. A `false` entry with no installation is silently dropped | Either acceptable (no user-visible state) or a real omission. Spec should explicitly say "Orphaned only when `enabledPlugins[key] === true`; disabled-and-uninstalled entries are silently ignored." |
| F9 | Update detection lifecycle | §13 line 483: "Cached 1hr. Manual 'Check for updates' button" | Implemented (`plugin-updates.ts:12-65`) | OK — but spec doesn't say what happens **on panel mount** (today: no auto-check; user must click). Document the explicit "no auto-check, user-initiated only" decision. |
| F10 | `update-available` precedence | Spec §6.4 lists 5 mutually-exclusive states | `mergeRemoteSha` (`plugin-updates.ts:76-82`) skips `broken`/`orphaned` but happily overwrites `disabled` → `update-available` | Spec doesn't define precedence. A disabled-with-update plugin will appear as `update-available` (toggle off, amber pill). Either document this behavior or say "update-available only overlays `active`". |
| F11 | Disabled-and-broken | §6.4 implies one state per plugin | Code: a disabled plugin whose files were deleted shows as `broken`, hiding the disabled fact (`derivePluginState` checks `pathExists` before `enabled`) | Spec should declare the precedence order: broken > orphaned > update-available > disabled > active. |
| F12 | List-view counts pre-hydration | Spec §6.5 says "component counts" are on the card | `loadPlugins` initializes counts to 0 then re-fetches them in parallel (`plugin-loader.ts:135-187`). During the hydration window, every card shows "0 skills / 0 agents / 0 hooks" | Spec has no loading-state guidance for the card body. Either render a skeleton for counts until hydrated, or include counts in the initial registry pass. |
| F13 | Description source | Spec §6.5: "name, marketplace source, description" on the card | List-view description is hardcoded `""` (`plugin-loader.ts:131`); only the detail load fills it from manifest | Cards visibly say nothing in the description slot until the user opens the detail view — a regression vs. spec intent. Hydrate description in `loadPlugins`. |
| F14 | "Open in File Browser" / "Open in VS Code" on broken plugins | Spec §6.6 line 287 lists these actions on the header | Code wires them unconditionally — but `openShell(plugin.installPath)` fails for broken (missing) plugins. Error surfaces (`PluginDetailView.tsx:212-220`) but the actions should be **disabled** with tooltip when broken | Add to spec: "When state = broken, Open in File Browser / Open in VS Code disabled with tooltip 'Install path is missing'." |

## §6 Plugins — UI problems

| # | Area | Issue | Evidence |
|---|---|---|---|
| U1 | List layout | Spec §6.5 (line 277) describes a single-column list. Code renders a responsive grid (`md:grid-cols-2 xl:grid-cols-3`) (`PluginListView.tsx:284`) | Pick one. Grid is denser and probably right for plugins with short descriptions, but spec is now wrong. |
| U2 | "Tree view" claim | Spec §6.6 line 289: "tree view of the plugin's file structure with expandable items" | Reality: flat `<ul>` in each tab (`PluginSkillsTab.tsx:28-57`, `PluginAgentsTab`, `PluginHooksTab`). Zero expandable nodes, zero file paths shown. Either build the tree (heavy) or rewrite the spec to "Each tab shows a flat list of entries (name + description + metadata)." Latter matches the code's actual scope. |
| U3 | Loading state | Spec §17.6 (line 619): "3 skeleton cards" | Implemented (`PluginListView.tsx:222-232`). OK. |
| U4 | Empty state | Spec §17.6 (line 619): "No plugins installed. Use `claude plugins install <name>` to add plugins." | Implemented verbatim (`PluginListView.tsx:247-253`). OK. |
| U5 | Error state | Spec §17.5 has no entry for "plugins failed to load" | Code surfaces nothing user-facing on `loadPlugins` rejection — `error` lives in the store (`plugin-store.ts:50`) but **no component reads it**. Add an inline alert in `PluginListView`. Spec must add a row to §17.5. |
| U6 | Update-check error | Spec doesn't mention this | Wired (`PluginListView.tsx:176-184`). OK at code level, but spec should describe it. |
| U7 | Info hierarchy on card | Spec §6.5 lists 7 items per card (status dot, name, marketplace, description, version pill, counts, toggle) | Card crams all 7 into ~96px. Marketplace appears in 11px muted font on its own row; description is double-clipped (JS 120 chars + CSS line-clamp-2) (`PluginCard.tsx:217-234`) | Either: (a) acknowledge marketplace + version + counts as secondary, demote visually; (b) spec the priority order; (c) split into a denser primary row + collapsible secondary metadata. |
| U8 | 5 states palette | Spec §6.4 prescribes colors for 5 states | Code maps `orphaned` to **amber**, not the "yellow" spec says (`PluginCard.tsx:37`). Comment cites WCAG contrast as the reason. Either update spec to "amber (#d97706)" or accept the deviation explicitly. Currently the design and code disagree. |
| U9 | "Update" pill behavior | Spec §6.4 defines the visual only | Pill is non-interactive (`PluginCard.tsx:181-196` — bare `<span>`, no click handler). Sighted user reasonably expects to click "Update" and trigger an update. Spec should either declare the pill non-actionable + show how the update is triggered, or wire it. |
| U10 | Tab bar a11y | Spec §6.6 line 288 says "Tabbed content" | Code implements correct WAI-ARIA APG tabs (`PluginDetailView.tsx:222-303`). Spec should reference the APG pattern by name so future tabs don't reinvent it incorrectly. |
| U11 | Detail-view "Open in" actions when broken | Spec says actions on header (line 287) | See F14 — buttons are enabled even when broken; the only feedback is a post-click error. Spec must specify disable-when-broken behavior. |
| U12 | Detail-view loading | Spec doesn't mention | `selectPlugin` is async (`plugin-store.ts:54-65`) but the section just renders the previous detail until the new one resolves. No spinner / skeleton. Add to §17.6. |
| U13 | Mockup references | Spec §6.6 line 292: "Mockups: `plugin-list.html`, `plugin-detail-v2.html`" | Both exist in `docs/design-visuals/`. (Originally flagged as missing; verified present.) OK. Recommend updating mockups to match the actual implementation (grid layout, real ARIA toolbar, etc.) or vice versa. |
| U14 | a11y (positive) | n/a | Code is unusually thorough on ARIA (toolbar pattern on broken actions, labeled landmarks, status announcements). Spec should reference WCAG criteria once at the top of §6 instead of leaving it to PR-by-PR retrofit. |

R2 (orphan-placeholder rule) violations:
- `PluginCard.tsx:271-273` cites `ui-defect-sweep#L293` (checkbox row number), not a `T<phase>.<num>` task ID.
- `PluginCard.tsx:311-313` cites `ui-defect-sweep#L294`.
- `PluginListView.tsx:76-82` cites `ui-defect-sweep#L295`.
- The defect-sweep doc tracks these as one-line bullets, NOT as `T*` tasks. Per CLAUDE.md R2: "TODO and that task ID must exist in the corresponding plan." Create proper `T4.<n>` (or new-phase) tasks for Install / Reinstall / Remove and update the TODOs.

## §6 Plugins — proposed spec changes

Replace lines 246–256 (§6.2 table) so the path is unambiguous:

```
| File | Purpose |
|---|---|
| `~/.claude/plugins/installed_plugins.json` | Plugin registry. Keyed by `{name}@{marketplace}`, value is ARRAY of installations. |
| `~/.claude/settings.json` → `enabledPlugins` | Enable/disable map (keyed by `{name}@{marketplace}`, separate from installation). Toggling one key affects every installation row of the same plugin. |
| `~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/` | Per-version install root. `installPath` in the registry points here. |
| `~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/.claude-plugin/plugin.json` | Manifest (primary). |
| `~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/.claude-plugin/marketplace.json` | Manifest fallback (first `plugins[]` entry). |
| `~/.claude/plugins/cache/{marketplace}/install-counts-cache.json` | Download counts. |
| `~/.claude/plugins/cache/{marketplace}/blocklist.json` | Server-side blocklist. |
| `~/.claude/plugins/cache/{marketplace}/known_marketplaces.json` | Marketplace sources. |
```

Replace §6.4 (lines 266–273) table to make precedence explicit and to add CRUD behavior:

```
### 6.4 Plugin States

State precedence (highest to lowest): broken > orphaned > update-available > disabled > active.

| State | Condition | Visual | Allowed actions |
|---|---|---|---|
| Active | inRegistry + pathExists + enabledPlugins[key]=true + (no update or update unchecked) | Green dot, toggle ON | Toggle off, Open in File Browser, Open in VS Code |
| Disabled | inRegistry + pathExists + enabledPlugins[key]!=true | Gray dot, toggle OFF, 70% opacity | Toggle on, Open in File Browser, Open in VS Code |
| Broken | inRegistry + !pathExists | Red dot + red border + warning text | Reinstall, Remove. Open in File Browser / VS Code DISABLED with tooltip "Install path is missing." Toggle DISABLED. |
| Orphaned | !inRegistry + enabledPlugins[key]=true | Amber dot (#d97706) + warning text | Remove (from `enabledPlugins` only). Toggle DISABLED. |
| Update Available | (Active) AND remote HEAD != local gitCommitSha | Green dot + amber "Update" pill | Same as Active + Update (runs `claude plugins update <key>`). Disabled-with-update does NOT receive this state. |

Disabled-and-uninstalled entries (`enabledPlugins[key]=false` AND not in registry) are silently ignored — no UI state.
```

Insert after line 280 (inside §6.5), defining the CRUD surface:

```
### 6.5.1 Plugin actions

| Action | Trigger | Backend | Confirmation |
|---|---|---|---|
| Install Plugin | Header button | Opens `claude plugins install <name>` flow (TODO T<phase>.<num>) | n/a |
| Reinstall | Broken card | `claude plugins install <key>` (TODO T<phase>.<num>) | "Reinstall <name>?" |
| Remove | Broken / Orphaned card | `claude plugins uninstall <key>` (TODO T<phase>.<num>) | Destructive confirm |
| Toggle | Switch on card | Atomic `enabledPlugins[key] = bool` rewrite of `settings.json` | None — optimistic with rollback |
| Update | "Update" pill click | `claude plugins update <key>` (TODO T<phase>.<num>) | None |
| Check for Updates | Header button | `git ls-remote` per marketplace (1hr cache) | None |

Until the four TODO actions ship, the corresponding buttons render as hardcoded `disabled` per R2: each must carry `// TODO(T<phase>.<num>): wire up X` AND that task must exist in the corresponding plan.
```

Replace §6.6 (lines 284–292) — drop the "tree view" claim that was never built:

```
### 6.6 Plugin Detail View

Header: name, marketplace, version pill, status dot+label, description, actions (Open in File Browser, Open in VS Code). Header actions DISABLED when state = broken or orphaned (no installPath to open).

Body: WAI-ARIA APG Tabs Pattern (automatic activation, roving tabindex). Three tabs:
- Skills — flat list, one row per skill: name (frontmatter `name` || directory name) + description (frontmatter `description`).
- Agents — flat list, one row per agent: name + description + optional model + optional tools array.
- Hooks — flat list, one row per (event, command) pair extracted from `hooks/hooks.json`.

Loading: previous detail stays visible until new detail resolves; if the load fails, render an inline `role="alert"` and keep the previous detail.

Mockups: `docs/design-visuals/plugin-list.html`, `docs/design-visuals/plugin-detail-v2.html`. (Mockups predate ARIA implementation — treat them as visual reference only.)
```

Insert after §6.6, addressing F12/F13:

```
### 6.7 List load pipeline

`loadPlugins` returns immediately with `description=""`, `skillCount=agentCount=hookCount=0`, then hydrates each card in parallel by invoking `read_plugin_contents`. Cards MUST render a skeleton state for description + counts until hydrated — they must NOT show "0 skills" before the contents IPC resolves. (Implementation defect today: `plugin-loader.ts:135-187` initializes to literal 0, and `PluginCard.tsx:240-248` renders that directly.)
```

Add row to §17.5 (after line 610):

```
| Plugins failed to load | Inline alert at top of plugin list: "Couldn't load plugins: <message>". List shows last known data if any. |
| Plugin detail failed to load | Inline alert inside the detail panel; previous detail stays visible. |
| Update check failed | Inline alert under header; "Check for Updates" button re-enabled for retry. |
```

Add row to §17.6 (after line 619):

```
| Plugin detail | Existing detail stays mounted until new resolves; spinner overlay only after 300ms | n/a (selection is mandatory to reach this view) |
```

## §7 Custom Skills — functional gaps

| # | Topic | Spec says (line) | Code does | Gap |
|---|---|---|---|---|
| G1 | SKILL.md schema | "YAML frontmatter (`name`, `description`)" (line 298) | `scan_custom_skills` (Rust) returns name + description only | OK as a wire shape, but spec is silent on required vs optional fields, max lengths, and behavior when frontmatter is absent. Code falls back to dir name for `name` (`plugin-loader.ts:178-183` for plugin-bundled; assume same for custom). Document this. |
| G2 | Skill ID uniqueness | Not mentioned | Code uses `dirPath` as React key (`SkillsListView.tsx:211`); two skills with the same `name` but different dirs are allowed | Spec should declare: directory name MUST be unique (filesystem enforces it); `name` from frontmatter MAY collide with plugin-bundled skill names; in collision the latest-loaded wins in Claude's runtime. |
| G3 | "Create Skill" semantics | "[+ Create Skill] button" (line 304) | Code opens `~/.claude/skills/` in File Explorer (`SkillsListView.tsx:38-51`). No template, no scaffold, no SKILL.md generation | Spec lists the button without saying what it does. Either define "Opens the skills directory in File Browser; user creates the dir + SKILL.md manually" (current behavior — explicit) or specify a scaffold flow. |
| G4 | Plugin-vs-custom boundary | Spec says these are NOT bundled inside plugins | Code (Rust `scan_custom_skills`) enumerates only `~/.claude/skills/<dir>/` — by construction excludes `~/.claude/plugins/...` | OK but undocumented. Spec should state the exclusion + rationale. |
| G5 | Edit / Remove | Not mentioned at all | Code has no Edit / Remove buttons (`SkillCard.tsx`) | Spec explicitly mentioned in `ui-defect-sweep.md:301` that "Skill card has no Remove action … not a defect: spec §7.1 lists only Open in VS Code and Open in File Browser." Fine — make that explicit in spec: "Skills are managed via filesystem; the app provides no Edit/Remove UI." Avoids future reviewers re-flagging it. |
| G6 | Reload after Create | Not mentioned | Code does NOT re-scan after `onCreateSkill`. User creates a SKILL.md in File Explorer, comes back, sees the old list. No FS watch on `~/.claude/skills/` | Either: (a) re-scan on window focus, (b) FS watch (matches §13 plugin update language), or (c) document the manual refresh expectation. Code silently fails to refresh today. |
| G7 | Empty description handling | Not mentioned | Code conditionally renders description (`SkillCard.tsx:63-65`), which is fine | Document: skills without a `description` frontmatter render with only name + path. |

## §7 Custom Skills — UI problems

| # | Area | Issue | Evidence |
|---|---|---|---|
| V1 | Header layout | Spec §7.1 line 304: header has title, count, path, button, search | Implemented (`SkillsListView.tsx:66-157`). Path rendered as `<code>` chip with `~` (un-expanded display string). OK. |
| V2 | Info box | Spec §7.1 line 306: "Info box at bottom explaining what custom skills are and linking to the Plugins panel" | Implemented (`SkillsListView.tsx:230-247`). OK. |
| V3 | Loading state | Spec §17.6 line 620: "2 skeleton cards" | Implemented (`SkillsListView.tsx:159-177`). OK. |
| V4 | Empty state | Spec §17.6 line 620 copy verbatim | Implemented (`SkillsListView.tsx:178-190`). OK. |
| V5 | Error state | Spec §17.5 has no row for skills | `skill-store.ts:31-37` records error, but **no component reads it**. Add inline alert; add §17.5 row. |
| V6 | Refresh after create | See G6. User creates a skill in File Explorer; list doesn't update | UX dead-end. Either FS watch or focus-refresh. |
| V7 | "Create Skill" expectation mismatch | Button labeled "Create Skill" but only opens a folder | Sighted user expects a dialog. Either rename the button ("Open Skills Folder") or build the scaffold. Today's behavior is the lowest-effort honest version but the label oversells. |
| V8 | Mockup reference | Spec §7.1 line 308: `skills-list.html` | Exists in `docs/design-visuals/skills-list.html`. OK. |
| V9 | a11y | n/a | Same depth as plugin section (labeled lists, role=toolbar, inline error alerts). Spec should reference WCAG criteria once at top of §7. |
| V10 | Path display | Card shows the full `skillMdPath` in a muted `<code>` (`SkillCard.tsx:66-80`) | Long Windows paths overflow → truncated with `title=` fallback. OK but spec should declare that path is shown verbatim, not a relative form. |

## §7 Custom Skills — proposed spec changes

Replace lines 296–308 in full:

```
## 7. Custom Skills

Custom skills live at `~/.claude/skills/<dir>/SKILL.md`. Each subdirectory of `~/.claude/skills/` containing a parseable `SKILL.md` is one skill. Plugin-bundled skills (under `~/.claude/plugins/cache/.../skills/`) are NOT shown here — they live in the Plugins panel's Skills tab.

### 7.1 SKILL.md schema

YAML frontmatter at the top of `SKILL.md`. Required and optional fields:

| Field | Required | Fallback |
|---|---|---|
| `name` | No | Subdirectory name |
| `description` | No | Empty string — card shows only name + path |

Anything past the closing `---` is the skill body (rendered by Claude Code at runtime, not by Claude Manager).

### 7.2 Skills List View

Header:
- Title "Custom Skills", count (pluralized), path chip `~/.claude/skills/`, [+ Create Skill] button (opens the skills directory in the OS file browser; user creates the subdirectory + `SKILL.md` manually — no scaffold is generated), search input.

Body: vertical list of skill cards. Each card:
- 📝 icon, name (truncated with `title=` hover), description (omitted if empty), full `SKILL.md` path as `<code>` (truncated with `title=` hover), action toolbar [Open in VS Code, Open in File Browser].

Info box at bottom: short explainer + link to Plugins panel.

Skills are managed entirely via the filesystem — there is no Edit or Remove UI in the app.

### 7.3 Refresh

The list re-scans on window focus and on navigation back to this section. There is no FS watch (low churn — most users add skills rarely). Until then, manual relaunch was required; this is a code defect tracked under TODO T<phase>.<num>.

Mockup: `docs/design-visuals/skills-list.html`. (Treat as visual reference; the implementation may have evolved a11y treatment.)
```

Add row to §17.5 (after line 610):

```
| Skills failed to load | Inline alert at top of skill list: "Couldn't load skills: <message>". |
| Skill open failed | Inline alert under the affected card. |
```

Add to §17.7 (after line 634) — clarify:

```
- Skills: searches `name`, `description`. Does NOT search the path (path is a debug aid).
```

## Out of scope / flagged for cross-section attention

- **§17.5 Error Handling table is incomplete.** Several error surfaces are wired in code (plugins/skills/MCP load, plugins update-check, plugin open, skill create/open) but have no row. Cross-review should sweep §17.5 against actual store error fields.
- **§13 Data Refresh Strategy** has no row for custom skills. Either add "Custom skills: on mount + window focus" or pick FS watch.
- **R2 violations elsewhere.** I only audited Plugins+Skills code. Same `ui-defect-sweep#L<n>` citation pattern probably exists across MCP/Dashboard TODOs — needs a sweep.
- **`document-skills` plugin (DESIGN-CONTEXT §2.9).** Spec §6.5 mentions it as the canonical "no plugin.json" case but doesn't say it's a real installed plugin on the dev machine. If the test fixtures don't include it, the marketplace.json fallback path is untested in fixture-level data tests.
- **Spec §6 header copy "Plugins are installed via the CLI"** (line 235) — but the app is supposed to grow Install / Reinstall / Remove. Either keep CLI-only and remove those buttons, or scope an in-app install flow. Cross-review with §8 New Session (which already invokes the CLI via shell).
- **Mockups in `docs/design-visuals/` are likely stale** vs. the ARIA-heavy, grid-based implementation. If they're authoritative, the code drifts from them; if the code is authoritative, the mockups need a refresh pass. Pick one source of truth.
- **PluginListView grid layout (`md:grid-cols-2 xl:grid-cols-3`) vs. spec's single-column language.** Same source-of-truth conflict — flag for global consistency review.
