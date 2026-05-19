# Test Architecture Design

**Status:** Draft (team agreement, not enforced by phase gates yet)
**Owner:** Ness
**Date:** 2026-05-18
**Related:** `docs/research/2026-05-09-dashboard-bugs-rca.md`, `CLAUDE.md` (R1/R2/R3)

## 1. Why this document exists

Claude Manager is a Tauri v2 desktop app — a real frontend/backend project. Strong unit coverage on both halves did not stop the April–May 2026 dashboard RCA from shipping four bugs visible the moment the app launched. The gap was not "not enough tests"; it was the absence of a coherent layering model. This document defines that model so future tests are placed where they earn their cost, and so silent drift across the frontend/backend boundary is caught at unit-test speed instead of in production.

It is a methodology — principles, layer responsibilities, and what each layer must and must not do. It deliberately does **not** specify which files to create, which command names to test first, or which percentage of coverage to enforce. Those are decisions for the implementation plans that follow this design.

## 2. Project shape that the methodology is built on

The methodology assumes — and is shaped by — these architectural facts about the project. If any of them change, the methodology should be revisited.

- **Frontend half:** TypeScript + React 19, running inside an embedded WebView (WebView2 on Windows, WebKit elsewhere). Lives under `src/`. Includes UI components, client-side state stores, and pure parsers/loaders.
- **Backend half:** Rust, compiled to native code, running in the same `.exe` process. Lives under `src-tauri/src/`. Owns all filesystem access, process inspection, and parsing of external on-disk artifacts.
- **The bridge:** Tauri's IPC mechanism (`#[tauri::command]` on Rust, `invoke()` on TypeScript). JSON-serialized in both directions. This is the only path between the two halves.
- **External boundary:** the project reads files owned by other tools (Claude Code's `~/.claude/` tree, `~/.claude.json`, etc.). The on-disk format of those files is a contract the project does not own.
- **Cross-platform reality:** Tauri v2 supports Windows + Linux + macOS for the app itself, but the WebDriver-based E2E tooling (`tauri-driver`) supports only Windows and Linux. macOS dev machines can run everything except E2E.

## 3. Methodology

### 3.1 The two-pyramid model

Because the frontend and backend are two languages, two runtimes, and two test frameworks, the project does not have one test pyramid — it has **two**, one per half:

```
                  ┌────────────────────────────────────┐
                  │  E2E                               │   real app process
                  │  (only layer that crosses IPC)     │
                  └────────────────────────────────────┘
                          ▲                  ▲
              ┌───────────┘                  └───────────┐
              │                                          │
   ┌──────────────────────┐                  ┌──────────────────────┐
   │  Frontend            │                  │  Backend             │
   │  Integration         │                  │  Integration         │
   └──────────────────────┘                  └──────────────────────┘
              ▲                                          ▲
              │   ╔══════════════════════════════════╗   │
              │   ║  IPC Contract (single source)    ║   │
              │   ║  both sides validate against it  ║   │
              │   ╚══════════════════════════════════╝   │
              ▲                                          ▲
   ┌──────────────────────┐                  ┌──────────────────────┐
   │  Frontend Units      │                  │  Backend Units       │
   └──────────────────────┘                  └──────────────────────┘
```

Two ideas drive the picture:

1. **Each half has its own unit and integration layers, owned by its own tooling and runnable in isolation.** Frontend tests do not need Rust to be built; Rust tests do not need a browser. Either half can be worked on while the other is broken.
2. **E2E is the only layer that crosses the IPC bridge.** Anything that needs both halves alive in the same process is, by definition, an E2E test. This is a definitional rule, not a stylistic preference — it determines where every test belongs.

The contract layer in the middle is not a test layer; see §3.6.

### 3.2 Unit layer (both halves)

**Purpose:** prove that a single unit of code behaves correctly in isolation.

**Boundary:** one module. Mocks live at module boundaries, never inside them. A unit test never mocks the thing it is testing.

**What goes here:**
- A pure function or parser with value-in / value-out semantics.
- A single UI component rendered with canned props.
- A single state-store reducer or selector with no I/O.

**What does not go here:**
- Any test that requires multiple modules to collaborate (→ integration).
- Any test that touches the real filesystem, network, or system clock without a fake (→ integration if isolated, E2E if real).
- Any test that needs the IPC bridge alive (→ E2E).

**Speed expectation:** the entire unit suite for a half runs in seconds, not minutes. If it slows past that, something has leaked in and needs to move up a layer.

### 3.3 Integration layer (both halves)

This is the layer most prone to terminology confusion, so the definition is explicit:

**Purpose:** prove that multiple modules in **one half** of the app collaborate correctly, without crossing the IPC bridge.

A frontend integration test wires a loader, a store, and a component together and exercises a user-visible flow — the IPC boundary is mocked, the rest is real. A backend integration test wires the relevant modules together and runs them against a filesystem fixture (a temp directory standing in for the part of the host filesystem the code expects to read).

**Boundary:** one half of the app, multiple modules, real collaboration between them.

**What goes here:**
- A flow that starts in one module and ends in another within the same half (e.g. "render a list, click an item, see the detail panel update").
- A backend command function exercised against a temp-directory fixture that mirrors the on-disk layout it expects.
- Anything where the bug class is "two modules each behave correctly in isolation but don't connect properly".

**What does not go here:**
- Tests that mock the very thing they claim to integrate. If a frontend integration test mocks its store, it is a unit test in disguise.
- Tests that reach across the IPC bridge for real. The whole point of this layer is to be fast and runnable without the other half being alive.
- Tests that depend on data on the real host filesystem. Integration tests must construct their own isolated fixtures so they are deterministic and parallelisable.

**Speed expectation:** the integration suite for a half runs in tens of seconds. It is slower than unit but still cheap enough to run on every push.

**Why this layer exists at all:** the dashboard RCA was full of bugs where each unit was individually correct but the wiring between them was wrong — a button correctly rendered as `disabled`, a chart correctly rendering whatever data it received, a loader correctly fetching data that nothing was subscribing to. Integration is the layer that catches "everything compiles, every unit passes, the feature still doesn't work."

### 3.4 E2E layer

**Purpose:** prove that the real app, with both halves alive and the real IPC bridge in between, does what a user expects.

**Boundary:** the whole app, the whole process, the real filesystem.

**What goes here:**
- A small set of **golden-path smokes**: launch the app, navigate to each top-level section, confirm its primary content renders and its primary interaction works.
- **Regression tests** for production bugs that escaped the lower layers. Every such bug earns a permanent E2E spec; the suite grows by one per incident.

**What does not go here:**
- Anything a lower layer could have caught. E2E is the slowest, most expensive layer; using it for things integration could cover wastes the budget and makes the CI loop painful.
- Exhaustive permutation testing. E2E proves "the lights turn on", not "every combination of inputs produces the correct output" — that is unit/integration territory.
- Tests that mock the IPC bridge. If `invoke` is mocked, the test is no longer end-to-end and belongs one layer down.

**Speed expectation:** the E2E suite finishes in a small number of minutes. If it grows beyond a tolerable wall-clock, split smoke from regression so PRs only pay for smoke.

**Realism rule:** E2E uses the real host filesystem — it does not inject a fake home directory. This is a deliberate inversion of the integration-layer rule, because the value of E2E is catching bugs that only appear against real-world data shapes. A small seed script may populate the host with a minimum corpus when none exists.

**Tooling constraint:** the WebDriver-based tooling only supports Windows and Linux. macOS development is fine but cannot run E2E locally, so the suite cannot be a hard gate on macOS PRs.

### 3.5 Source-of-truth contracts (external boundary)

The project reads files written by other tools — most importantly Claude Code's on-disk artifacts. The shape of those files is a contract owned by an external party. A dedicated layer of tests pins that shape, using verbatim (redacted) copies of real files as fixtures.

This layer already exists and is healthy. It is mentioned in the methodology for completeness and to distinguish it from the IPC contract (§3.6), which guards an entirely different boundary.

**Rule:** these fixtures are read-only references to reality. They are not edited to make a failing test pass — if a fixture stops matching reality, that is itself the signal worth investigating.

### 3.6 IPC contract (internal boundary, the spine)

This is the single most important addition the methodology proposes and the layer most likely to be skipped because it is not "a test layer" in the usual sense.

**The problem it solves.** When two halves of a project are written in different languages with hand-maintained types on each side, mocks drift. Suppose the backend renames a returned field. The backend unit tests pass (the Rust types are consistent with themselves). The frontend unit tests pass (their mocks still return the old field name). Production breaks the first time a user opens the app — and only E2E would have caught it, slowly.

**The fix.** Treat the IPC bridge as a contract with a single source of truth that both halves depend on. The contract is a machine-readable schema, generated from the half that owns the data shape (the backend), committed to the repo, and used by both sides at test time:

- The backend generates the schema as part of its build or as a separate command.
- Any frontend test that mocks an IPC call must validate its mock fixture against the schema before using it. A drifted mock fails the test the first time it runs.
- A drift gate (pre-commit hook or CI step) regenerates the schema and fails if the committed copy is stale, guaranteeing the schema is always current with the backend types.

**Scope.** Both directions — what the frontend sends in, and what the backend sends back. Including enums and tagged unions, since those are the most common silent-drift surface.

**What is deliberately not done.** Generating TypeScript type definitions from Rust is *not* proposed. The hand-written TS types remain the source of truth for compile-time ergonomics in the frontend; the schema is the source of truth for runtime correctness across the bridge. The two are kept aligned by the validate-fixtures rule, not by code generation. This is a trade-off in favour of frontend readability and against one more generated artifact to maintain.

**Why it is not "a test layer".** Schemas are not tests — they are an artifact tests consume. But its placement in the model is exactly between the two unit layers because that is where it does its work: it makes a frontend unit test (which mocks the backend) accountable to the backend's real shape, without requiring the backend to be alive.

### 3.7 The mapping discipline

Given the layers above, every new test must have an obvious home before it is written. The mapping rules are:

| If the test needs…                                       | …it belongs in… |
|----------------------------------------------------------|-----------------|
| Only one module, value-in / value-out                    | Unit            |
| Multiple modules in one half collaborating               | Integration     |
| The real filesystem of the host, real data shapes        | E2E             |
| The IPC bridge alive in the same process                 | E2E             |
| To pin the shape of an externally owned file             | SoT contract    |
| To stop frontend mocks from drifting from backend reality| IPC contract    |

A test that fits two rows is a sign the test is too broad and should be split. A test that fits no row is a sign the methodology has a gap worth examining.

## 4. Forbidden anti-patterns

These apply uniformly across all layers. They are listed because each has bitten this project or projects like it.

- **Skipping or "soft-passing" tests** — disabling specs without an open issue link, asserting nothing, or wrapping the assertion in a try/catch that swallows failures. A test that can't fail isn't a test.
- **Mocking the thing under test** — a unit test for a store that mocks the store. The mock will always agree with itself; the production code never runs.
- **Snapshot-on-markup tests** — assertions on serialized HTML. They lock in incidental structure, break on every refactor, and provide no behavioral guarantee.
- **Mocked IPC in E2E** — defeats the entire purpose of the layer. If the bridge isn't real, the test is integration.
- **Real-filesystem reads in unit or integration tests** — couples tests to host state and breaks parallelism. Integration uses fakes; only E2E uses the real host.
- **Unvalidated IPC mock fixtures** — once the contract layer exists, every mock must validate against it. An unchecked mock is the drift waiting to happen.
- **Flake-tolerant retries** — wrapping a test in a "retry 3 times" loop is treating a real bug (non-determinism) as cosmetic. The right answer is always to fix the root cause.

## 5. Coverage policy

Coverage as a number is not a useful proxy for correctness, and chasing a global percentage produces tests that exist to pass coverage rather than to catch bugs. The methodology takes a stricter stance on a few high-leverage areas and is deliberately silent on the rest:

- **Pure parsers and derivation functions** — areas where a single missed branch becomes a class of production bug — should be held to full line coverage. Which modules qualify is a decision for the implementation plans.
- **Everywhere else** — coverage is a diagnostic, not a target. Use it to find untested code worth testing, not to satisfy a gate.

The corollary: missing tests in a high-leverage area are a release blocker; missing tests elsewhere are a tech-debt note.

## 6. Speed budget as a design constraint

Speed is part of the architecture, not an afterthought. The faster a layer is, the more often developers run it, the earlier bugs are caught. The methodology assumes:

- Unit suites finish so fast they can run on save during development.
- Integration suites finish fast enough to run on every push without breaking flow.
- E2E suites finish in single-digit minutes; if they grow past that, smoke and regression are split so PRs only pay for smoke.

If a layer's suite consistently exceeds its budget, the response is to investigate what has leaked in from a slower-layer concern — not to relax the budget.

## 7. Glossary

Because the term *integration test* is used in two incompatible ways across the industry, this glossary fixes the meanings used in this document.

| Term                  | In this project, it means                                                                 |
|-----------------------|--------------------------------------------------------------------------------------------|
| Frontend              | The TypeScript + React half, running in the embedded WebView                              |
| Backend               | The Rust half, running as native code in the app process                                  |
| IPC bridge            | The Tauri-provided JSON channel between the two halves                                    |
| Unit test             | Tests one module in isolation, mocks at module boundaries                                  |
| Integration test      | Tests multiple modules in **one half** of the app collaborating, no IPC crossing           |
| E2E test              | Tests the real app process, real IPC, real filesystem                                      |
| SoT contract          | Pins the on-disk format of files written by external tools                                 |
| IPC contract          | Pins the shape of args / returns crossing the internal frontend/backend bridge             |
| Smoke test            | Small, fast, high-signal test that proves "the thing turns on and the lights work"        |
