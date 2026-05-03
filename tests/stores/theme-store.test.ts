import { describe, it, expect, beforeEach, vi } from "vitest";
import { useThemeStore } from "../../src/stores/theme-store";

describe("theme-store", () => {
  beforeEach(() => {
    // Reset store to defaults between tests.
    useThemeStore.setState({ mode: "dark", resolved: "dark" });
    vi.restoreAllMocks();
  });

  it("defaults to dark mode", () => {
    const state = useThemeStore.getState();
    expect(state.mode).toBe("dark");
    expect(state.resolved).toBe("dark");
  });

  it("setMode('light') updates mode and resolved to light", () => {
    useThemeStore.getState().setMode("light");
    const state = useThemeStore.getState();
    expect(state.mode).toBe("light");
    expect(state.resolved).toBe("light");
  });

  it("setMode('dark') switches back to dark", () => {
    useThemeStore.getState().setMode("light");
    useThemeStore.getState().setMode("dark");
    const state = useThemeStore.getState();
    expect(state.mode).toBe("dark");
    expect(state.resolved).toBe("dark");
  });

  it("setMode('system') resolves via matchMedia (dark when matches=true)", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList);

    useThemeStore.getState().setMode("system");
    const state = useThemeStore.getState();
    expect(state.mode).toBe("system");
    expect(state.resolved).toBe("dark");
  });
});
