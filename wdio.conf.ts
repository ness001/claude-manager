// WebdriverIO config for Tauri v2 e2e tests.
// See docs/research/2026-05-09-dashboard-bugs-rca.md §5 for the tooling decision rationale.
//
// Cross-platform support is constrained by tauri-driver: Windows + Linux only
// (no macOS as of Tauri v2.x). CI matrix should reflect this.

import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";

let tauriDriver: ChildProcess | undefined;

const APP_NAME = "claude-manager.exe";
const RELEASE_PATH = path.resolve(
  process.cwd(),
  "src-tauri",
  "target",
  "release",
  APP_NAME,
);
const TAURI_DRIVER = path.resolve(
  os.homedir(),
  ".cargo",
  "bin",
  "tauri-driver.exe",
);

export const config: WebdriverIO.Config = {
  runner: "local",
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  specs: ["./tests/e2e/**/*.spec.ts"],
  maxInstances: 1,
  logLevel: "warn",

  capabilities: [
    {
      // Tauri webview identifier — see https://v2.tauri.app/develop/tests/webdriver/
      browserName: "wry",
      "tauri:options": {
        application: RELEASE_PATH,
      },
    } as WebdriverIO.Capabilities,
  ],

  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    // 60s — Tauri startup + WebView2 init is slow on first run
    timeout: 60_000,
  },
  reporters: ["spec"],

  // Spawn tauri-driver before each session; kill after.
  // We do NOT rebuild the app here — assume `npx tauri build` was run
  // already (or invoked by `npm run test:e2e:build`).
  beforeSession: async () => {
    tauriDriver = spawn(TAURI_DRIVER, [], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    await new Promise((r) => setTimeout(r, 1000));
  },

  afterSession: async () => {
    if (tauriDriver && !tauriDriver.killed) {
      tauriDriver.kill();
    }
  },
};
