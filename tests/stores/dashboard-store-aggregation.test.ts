// Unit tests for the pure aggregateModelUsage helper (P0 derivation function
// per docs/superpowers/specs/2026-05-18-test-architecture-design.md §3.2).

import { describe, expect, it } from "vitest";

import { aggregateModelUsage } from "../../src/stores/dashboard-store";

describe("aggregateModelUsage", () => {
  it("returns [] for empty input", () => {
    expect(aggregateModelUsage([])).toEqual([]);
  });

  it("returns a single row with the model and its tokens when given one day with one model", () => {
    const result = aggregateModelUsage([
      { tokensByModel: { sonnet: 1500 } },
    ]);
    expect(result).toEqual([{ model: "sonnet", tokens: 1500 }]);
  });

  it("sums tokens across days for the same model", () => {
    const result = aggregateModelUsage([
      { tokensByModel: { sonnet: 100 } },
      { tokensByModel: { sonnet: 250 } },
      { tokensByModel: { sonnet: 50 } },
    ]);
    expect(result).toEqual([{ model: "sonnet", tokens: 400 }]);
  });

  it("sorts multiple models by tokens descending", () => {
    const result = aggregateModelUsage([
      { tokensByModel: { haiku: 10, opus: 500, sonnet: 1000 } },
      { tokensByModel: { opus: 200 } },
    ]);
    expect(result).toEqual([
      { model: "sonnet", tokens: 1000 },
      { model: "opus", tokens: 700 },
      { model: "haiku", tokens: 10 },
    ]);
  });

  it("keeps models with 0 tokens in the output (does not filter zero-token models)", () => {
    const result = aggregateModelUsage([
      { tokensByModel: { sonnet: 100, opus: 0 } },
    ]);
    expect(result).toContainEqual({ model: "opus", tokens: 0 });
    expect(result).toHaveLength(2);
  });
});
