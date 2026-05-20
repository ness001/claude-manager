// WebdriverIO config for Tauri v2 e2e tests.
// See docs/research/2026-05-09-dashboard-bugs-rca.md §5 for the tooling decision rationale.
//
// Cross-platform support is constrained by tauri-driver: Windows + Linux only
// (no macOS as of Tauri v2.x). CI matrix should reflect this.

import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";

let tauriDriver: ChildProcess | undefined;
let viteDevServer: ChildProcess | undefined;

const APP_NAME = "claude-manager.exe";
// Use debug build: the driver session attaches to whatever URL the WebView
// is showing, and only debug build's devUrl (http://localhost:1420) is a
// real HTTP origin that msedgedriver can navigate/refresh — release build
// uses tauri://localhost which msedgedriver cannot drive. We spawn Vite
// alongside tauri-driver in beforeSession so the dev URL is live.
const RELEASE_PATH = path.resolve(
  process.cwd(),
  "src-tauri",
  "target",
  "debug",
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
      // W3C: "none" lets the SPA finish navigating before any wdio command
      // runs; default "normal" waits only for the initial about:blank
      // document.readyState, which Tauri then replaces. "none" + our
      // explicit handle/url polling in spec before() blocks gives the SPA
      // time to mount before we touch the DOM.
      "pageLoadStrategy": "none",
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
    // Start Vite dev server (devUrl http://localhost:1420) — the debug
    // build expects it to be running, otherwise the WebView lands on a
    // dead URL and #root never mounts.
    viteDevServer = spawn("npm", ["run", "dev"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: true,
    });
    viteDevServer.stdout?.on("data", (d) => process.stderr.write(`[vite] ${d}`));
    viteDevServer.stderr?.on("data", (d) => process.stderr.write(`[vite:err] ${d}`));

    // Wait for Vite to be ready (probes the dev URL until it answers).
    const readyDeadline = Date.now() + 30_000;
    let viteReady = false;
    while (Date.now() < readyDeadline) {
      try {
        const res = await fetch("http://localhost:1420/");
        if (res.ok) {
          viteReady = true;
          break;
        }
      } catch {
        /* not ready yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!viteReady) {
      throw new Error("Vite dev server did not become ready on :1420 within 30s");
    }

    tauriDriver = spawn(TAURI_DRIVER, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    tauriDriver.stdout?.on("data", (d) => process.stderr.write(`[tauri-driver] ${d}`));
    tauriDriver.stderr?.on("data", (d) => process.stderr.write(`[tauri-driver:err] ${d}`));
    await new Promise((r) => setTimeout(r, 1000));
  },

  afterSession: async () => {
    if (tauriDriver && !tauriDriver.killed) {
      tauriDriver.kill();
    }
    if (viteDevServer && !viteDevServer.killed) {
      // Vite spawns child node processes; killing the wrapper alone isn't
      // always enough on Windows. Use taskkill /T to kill the tree.
      try {
        const { execSync } = await import("node:child_process");
        execSync(`taskkill /PID ${viteDevServer.pid} /T /F`, { stdio: "ignore" });
      } catch {
        viteDevServer.kill();
      }
    }
  },
};
