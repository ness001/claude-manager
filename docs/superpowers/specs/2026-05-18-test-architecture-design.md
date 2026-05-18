# Test Architecture Design

**Status:** Draft (team agreement, not enforced by phase gates yet)
**Owner:** Ness
**Date:** 2026-05-18
**Related:** `docs/research/2026-05-09-dashboard-bugs-rca.md`, `CLAUDE.md` (R1/R2/R3)

## 1. Why this document exists

Claude Manager is a Tauri v2 desktop app — a real frontend/backend project where:

- **Frontend** (`src/`) is React 19 + TypeScript running inside an embedded WebView2 (Windows) / WebKit (other OSes).
- **Backend** (`src-tauri/src/`) is Rust compiled to native code, running in the same `.exe` process group.
- The two halves talk only through the **Tauri IPC bridge**: 15 functions decorated with `#[tauri::command]` on the Rust side, called from TypeScript via `invoke("command_name", args)`.

Today the project has strong unit coverage on both halves, weak cross-module coverage on the Rust side, no internal IPC contract, and a single E2E spec that isn't even wired into `package.json`. The April–May 2026 dashboard RCA proved that the gaps cost real shipping bugs — four of them visible the moment the app launched, none of which any test caught.

This document defines the test architecture the team will follow going forward. It is a blueprint and team agreement, not (yet) a hard phase gate.

## 2. Mental model: two pyramids joined by one contract

```
                  ┌────────────────────────────────────┐
                  │  E2E (tauri-driver + WebdriverIO)  │   real webview · real Rust · real FS
                  │  golden paths + RCA regression     │   the ONLY layer that crosses IPC
                  └────────────────────────────────────┘
                          ▲                  ▲
              ┌───────────┘                  └───────────┐
              │                                          │
   ┌──────────────────────┐                  ┌──────────────────────┐
   │  Frontend            │                  │  Rust                │
   │  Integration         │                  │  Integration         │
   │  loader+store+ui     │                  │  src-tauri/tests/    │
   │  (mocked invoke)     │                  │  (tmpdir, no Tauri)  │
   └──────────────────────┘                  └──────────────────────┘
              ▲                                          ▲
              │   ╔══════════════════════════════════╗   │
              │   ║  IPC Schema (single source)      ║   │
              │   ║  schemars → JSON Schema files    ║   │
              │   ║  both sides validate against it  ║   │
              │   ╚══════════════════════════════════╝   │
              ▲                                          ▲
   ┌──────────────────────┐                  ┌──────────────────────┐
   │  Frontend Units      │                  │  Rust Units          │
   │  components/stores/  │                  │  inline #[test]      │
   │  pure lib            │                  │  pure logic only     │
   └──────────────────────┘                  └──────────────────────┘
```

Two key ideas:

1. **Two independent pyramids.** Frontend has its own unit + integration layers; Rust has its own. Each half can be developed and tested without the other being runnable.
2. **One contract spine.** The IPC schema is the single source of truth for what crosses the bridge. Both sides validate their fixtures against it, so frontend mocks cannot silently drift from Rust reality.

E2E is the only layer that actually exercises the IPC bridge end-to-end. That makes it the most valuable layer for catching wiring bugs — and the most expensive, so it stays small and intentional.

## 3. Layer-by-layer specification

### 3.1 Frontend unit tests

**Tool:** Vitest + jsdom + `@testing-library/react`
**Location:** `tests/` (mirrors `src/`)
**Command:** `npm test`
**Status today:** ~50 specs, healthy

**What belongs here:**
- Single-component rendering and interaction (`tests/components/**`)
- Pure store reducers / selectors (`tests/stores/**`)
- Pure parsers and utilities (`tests/lib/**`, `tests/styles/**`)

**What does NOT belong here:**
- Anything that requires real Tauri IPC (→ E2E)
- Multi-module flows like loader→store→component (→ frontend integration)
- Real `~/.claude/` disk access (→ Rust IT or E2E)

**Rules:**
- Mock at the module boundary, not inside. Specifically, mock `@tauri-apps/api/core`'s `invoke` — never reach into store internals.
- Mock fixtures for `invoke` return values **must validate against the IPC schema** (see §3.5). Tests that violate this fail.
- No network, no filesystem, no timers without `vi.useFakeTimers()`.
- Speed budget: full suite under 30 seconds.

### 3.2 Rust unit tests

**Tool:** built-in `cargo test`, inline `#[cfg(test)] mod tests`
**Location:** inside each module file under `src-tauri/src/`
**Command:** `cd src-tauri && cargo test --lib`
**Status today:** ~37 tests across `sessions/`, `plugins/`, `mcp/`, `skills/`

**What belongs here:**
- Pure parsing, transformation, derivation logic (e.g. `sessions/parser.rs`, `sessions/pid.rs::is_alive`)
- Small helper functions whose only inputs are values

**What does NOT belong here:**
- Anything that touches the filesystem (→ Rust integration)
- Anything that needs `tauri::State` or `AppHandle` (→ Rust integration with `mock_app`, only if absolutely needed)
- Anything that depends on the host's real `~/.claude/` (→ E2E)

**Rules:**
- Inline tests use only the fixtures already present under `src-tauri/tests/fixtures/` (read-only) — they do not create temp dirs.
- Speed budget: full unit suite under 5 seconds.
- Hard coverage target for pure parsers: **100% line coverage** on `sessions/parser.rs` and equivalents. Other modules have no enforced percentage.

### 3.3 Frontend integration tests

**Tool:** Vitest + jsdom + `@testing-library/react`
**Location:** new directory `tests/integration/`
**Command:** `npm test` (same runner as unit; separated by directory convention)
**Status today:** does not exist

**Purpose:** prove that loader → store → component wires up correctly, on the same JS runtime, without crossing IPC.

**What a typical integration test looks like:**
```
tests/integration/
  session-flow.test.tsx
    // 1. Mock invoke to return canned discover_sessions + read_pid_files
    //    (fixtures validated against the IPC schema)
    // 2. Render <SessionsSection /> wrapped in its real store provider
    // 3. Wait for the list to populate
    // 4. Click a SessionCard
    // 5. Assert <SessionDetailPanel /> shows the right data
```

**Specs to create (in priority order):**
1. `session-flow.test.tsx` — list → select → detail panel
2. `plugin-toggle.test.tsx` — toggle plugin → `write_plugin_enabled` invoked → store reflects new state
3. `mcp-add-server.test.tsx` — submit form → `write_mcp_server` invoked → list refreshes
4. `dashboard-load.test.tsx` — initial load → all six widgets render with non-placeholder data

**What does NOT belong here:**
- Real `invoke` calls (→ E2E)
- Mocking the store under test (that's what unit tests do — integration uses the real store)
- Asserting on internal store state instead of observable UI (that's a unit-test smell)

**Rules:**
- Use real Zustand stores, real loaders, real components. Mock only the IPC boundary.
- Speed budget: full integration suite under 60 seconds.

### 3.4 Rust integration tests

**Tool:** Cargo's built-in `tests/` directory + `assert_fs` crate + `tempfile`
**Location:** `src-tauri/tests/*.rs` (each file is a separate test binary)
**Command:** `cd src-tauri && cargo test --tests`
**Status today:** only `src-tauri/tests/fixtures/` exists — no actual `.rs` test binaries

**Purpose:** prove that each `#[tauri::command]` function correctly reads and writes the filesystem layout it expects, using a temp directory that mirrors `~/.claude/`. The command function is called **directly as a regular Rust function** — no Tauri runtime is started.

**Why no Tauri runtime?**
- Speed: starting `mock_app` adds hundreds of ms per test
- Simplicity: the value of these tests is the FS contract, not the Tauri plumbing
- Serialization concerns (does my struct survive the IPC round-trip?) are covered by the schema contract layer (§3.5), not by re-running every test through a mock app

**Files to create (one per command module):**
- `src-tauri/tests/sessions_commands.rs` — `discover_sessions`, `read_pid_files`, `read_jsonl_file`
- `src-tauri/tests/plugins_commands.rs` — `read_installed_plugins`, `read_settings_enabled_plugins`, `read_plugin_contents`, `write_plugin_enabled`, `check_plugin_updates`
- `src-tauri/tests/mcp_commands.rs` — `read_claude_json`, `read_mcp_json`, `write_mcp_server`, `remove_mcp_server`, `check_mcp_status`
- `src-tauri/tests/skills_commands.rs` — `scan_custom_skills`

**Pattern (all files follow this):**
```rust
// src-tauri/tests/sessions_commands.rs
use assert_fs::prelude::*;
use claude_manager_lib::sessions::commands::discover_sessions;

#[tokio::test]
async fn discover_sessions_returns_empty_when_no_claude_dir() {
    let fake_home = assert_fs::TempDir::new().unwrap();
    let result = discover_sessions(fake_home.path().to_path_buf()).await;
    assert_eq!(result.unwrap(), vec![]);
}

#[tokio::test]
async fn discover_sessions_finds_projects_and_jsonl_files() {
    let fake_home = assert_fs::TempDir::new().unwrap();
    fake_home.child(".claude/projects/proj-a/abc.jsonl").touch().unwrap();
    fake_home.child(".claude/projects/proj-a/def.jsonl").touch().unwrap();

    let result = discover_sessions(fake_home.path().to_path_buf()).await.unwrap();
    assert_eq!(result.len(), 2);
}
```

**Prerequisite refactor:** today many commands hardcode `dirs::home_dir()`. They must be refactored to accept an injectable home path (production wires `dirs::home_dir()`, tests inject a `TempDir`). This is a one-time investment.

**Rules:**
- Always use `TempDir` — never touch the real `~/.claude/`.
- Use `assert_fs::prelude::*` for fluent path assertions (`child("foo").assert(predicate::path::exists())`).
- Test the unhappy paths: missing files, malformed JSON, permission errors (where reasonable on Windows).
- Speed budget: full Rust integration suite under 30 seconds.

### 3.5 IPC contract layer (the spine)

This is **not a test layer**, it's a generated artifact that both halves of the project depend on. It is the single most important addition this design proposes.

**The problem it solves:**
> Rust renames a return-type field from `sessionId` to `session_id`. The Rust unit tests pass (Rust types are consistent with themselves). The frontend unit tests pass (`vi.mock` still returns the old field name). Production breaks the moment a real user opens the app.

**Tool:** [`schemars`](https://docs.rs/schemars/) (Rust → JSON Schema) + [`ajv`](https://ajv.js.org/) (TS JSON Schema validator)
**Schema location:** `src-tauri/schemas/*.json` (generated, committed)
**Frontend consumption:** `tests/fixtures/ipc/*.json` validated against the matching schema in test setup

**Workflow:**

1. Every Rust type used in an IPC command's args or return value derives `JsonSchema`:
   ```rust
   #[derive(Serialize, Deserialize, JsonSchema)]
   pub struct DiscoveredSession {
       pub project_dir: String,
       pub jsonl_path: String,
       // ...
   }
   ```

2. A small Cargo binary `src-tauri/src/bin/export-schemas.rs` writes one JSON Schema file per command, e.g.:
   ```
   src-tauri/schemas/
     discover_sessions.args.json
     discover_sessions.return.json
     read_pid_files.args.json
     read_pid_files.return.json
     ...
   ```
   Run via `cargo run --bin export-schemas`.

3. A pre-commit hook (or CI step) runs `cargo run --bin export-schemas` and fails the commit if the generated files differ from what's committed. This guarantees the schema is always current with the Rust types.

4. Frontend test setup loads each schema and exposes a helper:
   ```typescript
   // tests/setup.ts (additions)
   import Ajv from "ajv";
   const ajv = new Ajv();
   export function validateIpcFixture(commandName: "discover_sessions" | ..., side: "args" | "return", fixture: unknown) {
     const schema = loadSchema(`${commandName}.${side}.json`);
     const valid = ajv.validate(schema, fixture);
     if (!valid) throw new Error(`IPC fixture for ${commandName}.${side} does not match schema: ${ajv.errorsText()}`);
   }
   ```

5. Every frontend unit/integration test that mocks `invoke` MUST pipe its fixture through `validateIpcFixture` first. If Rust changes a field name, the next `cargo run --bin export-schemas` updates the schema, the frontend fixture stops validating, the test goes red — drift is caught at unit-test speed, not at E2E speed or in production.

**Scope:** both directions — args (frontend → Rust) and return values (Rust → frontend). Pure tagged-union (`enum`) variants are part of the schema. We deliberately do NOT generate TypeScript type definitions (no `ts-rs` / `typeshare`) — the schema is the contract; the TS types remain hand-authored to stay readable. The mismatch risk is bounded by the validate-the-fixture rule.

**One-time cost:** add `schemars` dependency, decorate ~20 structs/enums, write the export binary (~50 lines), add the pre-commit hook, add the `validateIpcFixture` helper, update existing frontend mocks to use it.

### 3.6 E2E tests

**Tool:** WebdriverIO + tauri-driver + Mocha
**Location:** `tests/e2e/*.spec.ts`
**Command:** `npm run test:e2e` (to be added to `package.json`)
**Status today:** `wdio.conf.ts` configured, `tsconfig.e2e.json` exists, one spec (`dashboard.spec.ts`) written, **no `package.json` script wires it up**

**Two distinct buckets of E2E specs:**

#### Bucket A — Golden Path Smokes (one per section, ~6 total)

Each section gets exactly one smoke spec that proves: app launches, the section's main panel renders with real data, the section's primary interaction works. These are the R3 phase-end gate from `CLAUDE.md`.

| Section   | Spec file                          | Primary assertions                                                          |
|-----------|------------------------------------|-----------------------------------------------------------------------------|
| Dashboard | `tests/e2e/dashboard.smoke.spec.ts`| All 6 widgets render; ActivityChart latest tick within 7 days               |
| Sessions  | `tests/e2e/sessions.smoke.spec.ts` | Session list populates; clicking a card opens detail panel                  |
| Plugins   | `tests/e2e/plugins.smoke.spec.ts`  | Plugin list populates; toggling one persists to settings.json               |
| Skills    | `tests/e2e/skills.smoke.spec.ts`   | Custom skills enumerate from `~/.claude/skills/`                            |
| MCP       | `tests/e2e/mcp.smoke.spec.ts`      | MCP server list populates from `~/.claude.json`; add-server form opens      |
| Settings  | `tests/e2e/settings.smoke.spec.ts` | Theme toggle persists across launches; section reachable via Ctrl+,         |

#### Bucket B — RCA Regression Tests (grows by one per shipped production bug)

Every production bug that escaped lower layers gets a permanent E2E spec named after the incident. The current `dashboard.spec.ts` is the first — covers the four bugs from the 2026-05-09 RCA. Future regressions live alongside it (e.g. `dashboard-rca-2026-05-09.spec.ts`, `sessions-rca-2026-06-xx.spec.ts`).

**Rules for both buckets:**
- E2E tests use the **real** `~/.claude/` of the machine running them — they make no attempt to inject a fake home. This is a deliberate inversion of the Rust-integration rule in §3.4: integration tests need isolation to be deterministic; E2E exists to catch bugs that only manifest with real-world data shapes.
- A required CI/dev step seeds a minimum corpus into `~/.claude/` if it's empty (so a fresh machine still has something to discover). Seed script lives in `scripts/_test/seed-claude-home.ps1`.
- Speed budget: full E2E suite under 5 minutes on local Windows. If it grows beyond that, split smoke vs regression in CI.
- Selector preference: `data-testid` > ARIA role + name > visible text. Never CSS class selectors.

**Cross-platform constraint:**
- tauri-driver supports Windows + Linux only. macOS is not supported by Tauri v2.x as of this writing.
- CI matrix: `windows-latest` + `ubuntu-latest`. macOS dev machines run unit + integration only.

### 3.7 Source-of-truth contract tests (already exist, keep them)

`tests/sources-of-truth/` (11 specs) pins the on-disk format of files Claude Manager *reads* but does not own — `sessions/{pid}.json`, `~/.claude.json`, `settings.json`, the JSONL session format, etc. This layer is **complementary** to the IPC contract layer in §3.5:

| Layer                | Owns?    | Catches                                      |
|----------------------|----------|----------------------------------------------|
| SoT contracts (§3.7) | external | Claude Code changes its on-disk format       |
| IPC contracts (§3.5) | internal | Our own Rust ↔ TS bridge silently drifts     |

Both layers stay and they complement each other — SoT guards the external boundary, IPC schema guards the internal one. This document does not propose any changes to the SoT layer.

## 4. Test type mapping by component

| Concern                                | Unit (FE) | Unit (Rust) | IT (FE) | IT (Rust) | E2E |
|----------------------------------------|-----------|-------------|---------|-----------|-----|
| React component renders                | ✓         |             |         |           |     |
| Zustand store reducer                  | ✓         |             |         |           |     |
| Pure TS parser (jsonl-parser, time)    | ✓         |             |         |           |     |
| Rust pure parser (session JSONL)       |           | ✓           |         |           |     |
| Rust PID file → `is_alive` derivation  |           | ✓           |         |           |     |
| Loader → store → component flow        |           |             | ✓       |           |     |
| `discover_sessions` reads a real dir   |           |             |         | ✓         |     |
| `write_plugin_enabled` mutates JSON    |           |             |         | ✓         |     |
| IPC schema fixture validation          | ✓         |             | ✓       |           |     |
| App boots + Dashboard widgets render   |           |             |         |           | ✓   |
| Session click → detail panel updates   |           |             | ✓       |           | ✓   |
| Theme toggle persists across launches  |           |             |         |           | ✓   |
| RCA regression                         |           |             |         |           | ✓   |

The dual-checkmark rows (session click; schema validation) are intentional: integration covers the wiring, E2E covers the cross-process reality.

## 5. CI matrix and speed budgets

| Stage             | Runs                                                          | OS                  | Budget    | Trigger              |
|-------------------|---------------------------------------------------------------|---------------------|-----------|----------------------|
| Lint / typecheck  | `tsc --noEmit`, `cargo check`                                 | ubuntu              | < 2 min   | every push           |
| Schema drift gate | `cargo run --bin export-schemas` + `git diff --exit-code`     | ubuntu              | < 1 min   | every push           |
| Unit (FE)         | `npm test`                                                    | ubuntu              | < 30 s    | every push           |
| Unit (Rust)       | `cargo test --lib`                                            | ubuntu              | < 30 s    | every push           |
| Integration (FE)  | `npm test -- tests/integration`                               | ubuntu              | < 60 s    | every push           |
| Integration (Rust)| `cargo test --tests`                                          | windows + ubuntu    | < 30 s    | every push           |
| E2E smoke         | `npm run test:e2e -- --suite smoke`                           | windows + ubuntu    | < 5 min   | every push (PR only) |
| E2E regression    | `npm run test:e2e -- --suite regression`                      | windows + ubuntu    | < 5 min   | nightly + pre-release|

The schema-drift gate is the cheapest meaningful protection in the whole matrix — if it ever fails, two halves of the codebase are about to disagree.

## 6. Coverage policy

**Enforced (CI fails below these):**
- `src-tauri/src/sessions/parser.rs` — 100% line coverage. This is the JSONL parser; every variant matters.
- `src-tauri/src/sessions/pid.rs` — 100% line coverage. PID liveness derivation drives the entire ALIVE state.

**Recommended (no CI gate):**
- Anything else under `src-tauri/src/` — aim for 80%, don't sweat the last 20%.
- `src/lib/` parsers and loaders — same, 80% target.

**Not measured:**
- React components, Zustand stores — coverage % isn't a useful proxy for UI correctness; observable-behavior tests are.

## 7. Forbidden anti-patterns

These mirror `CLAUDE.md` §"Executing a plan task" rule 7 and add testing-specific extensions:

- `it.skip` / `xit` / `#[ignore]` without an open issue link in the comment
- `expect.assertions(0)` or any pattern that lets a test "pass" with no checks
- Mocking the thing under test (e.g. mocking the Zustand store in a store unit test)
- Snapshot tests for HTML output — assert behavior, not markup
- E2E tests that mock `invoke` — that defeats the entire point of the layer
- Integration tests that don't validate their IPC fixtures against the schema
- Comments like "this test is flaky, retry it 3 times" — flakiness is a bug, fix the root cause

## 8. Migration roadmap

This is the order to bring the test architecture up to the design. Each step is a separate plan / phase, not part of this design doc.

1. **Add `test:e2e` + `test:e2e:build` scripts to `package.json`.** Wire `dashboard.spec.ts` into CI. (R3 was already supposed to enforce this.)
2. **Build the IPC contract layer.** Add `schemars` to Rust deps, decorate command-related types with `#[derive(JsonSchema)]`, write `export-schemas` binary, commit generated schemas, add the pre-commit drift gate, add `validateIpcFixture` helper, retrofit existing frontend mocks.
3. **Build the Rust integration suite.** Refactor commands to accept injectable home paths; write `sessions_commands.rs`, `plugins_commands.rs`, `mcp_commands.rs`, `skills_commands.rs`.
4. **Build the frontend integration suite.** Write the four specs listed in §3.3.
5. **Fill in the E2E golden-path bucket.** Write the five remaining section smokes from §3.6 Bucket A.

Steps are mostly independent — 2/3/4/5 can parallelize across worktrees once 1 unblocks CI.

## 9. Glossary (because terminology bites)

| Term                  | In this project, it means                                                                 |
|-----------------------|--------------------------------------------------------------------------------------------|
| Frontend              | Code under `src/` — TS + React, runs in WebView2                                          |
| Backend / Rust        | Code under `src-tauri/src/` — Rust, runs as native code in the same exe                   |
| IPC bridge            | The Tauri-provided JSON channel between the two; the only way they communicate            |
| Unit test             | Tests one module in isolation, mocks at module boundaries                                  |
| Integration test      | Tests multiple modules in *one half* of the app collaborating (no IPC crossing)            |
| E2E test              | Tests the real app process, real IPC, real filesystem                                      |
| Contract test (SoT)   | Pins the format of files written by Claude Code (external systems)                         |
| Contract (IPC schema) | Pins the shape of args/returns crossing our own Rust ↔ TS bridge (internal)               |
| Smoke test            | A small, fast, high-signal test that proves "the thing turns on and the lights work"      |
