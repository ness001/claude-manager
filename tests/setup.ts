import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom does not implement window.matchMedia. Provide a default mock that
// reports prefers-color-scheme: dark === false. Individual tests can override
// this via vi.spyOn(window, "matchMedia") when they need different behavior.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// @tauri-apps/api/window reads window.__TAURI_INTERNALS__.metadata, which
// only exists inside the real Tauri runtime. Without this mock, any component
// that calls getCurrentWindow() (e.g. TitleBar) crashes under jsdom with
// "Cannot read properties of undefined (reading 'metadata')".
vi.mock("@tauri-apps/api/window", () => {
  const win = {
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getCurrentWindow: () => win,
  };
});
