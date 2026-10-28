import type { ModelInfo, ReasoningOption } from "../src/types.ts"

import { describe, expect, test } from "vitest"
import { reasoningLevels, resolveReasoning } from "../src/models/reasoning.ts"

const model = (reasoning_options?: ReasoningOption[]): ModelInfo => ({
  id: "test",
  reasoning: true,
  reasoning_options,
})

describe("reasoning capabilities", () => {
  test("normalizes none and toggle into off without exposing provider default sentinels", () => {
    expect(
      // oxlint-disable-next-line unicorn/no-null -- models.dev uses JSON null for the provider default.
      reasoningLevels(model([{ type: "effort", values: [null, "default", "none", "low", "high"] }]))
    ).toEqual(["off", "low", "high"])
    expect(
      reasoningLevels(model([{ type: "toggle" }, { type: "effort", values: ["low", "medium"] }]))
    ).toEqual(["off", "low", "medium"])
  })

  test("off maps to the lowest positive effort on always-thinking models", () => {
    const m = model([{ type: "effort", values: ["high", "low", "medium", "max"] }])
    expect(reasoningLevels(m)).toEqual(["low", "medium", "high", "max"])
    expect(resolveReasoning(m, "off")).toBe("low")
    expect(resolveReasoning(m, "xhigh")).toBe("high")
    expect(resolveReasoning(m, "max")).toBe("max")
  })

  test("positive efforts never accidentally clamp to off", () => {
    const m = model([{ type: "effort", values: ["none", "low", "high"] }])
    expect(resolveReasoning(m, "minimal")).toBe("low")
    expect(resolveReasoning(m, "off")).toBe("off")
    expect(resolveReasoning(m, "medium")).toBe("low")
  })

  test("undefined stays undefined and non-reasoning models ignore requests", () => {
    expect(resolveReasoning(model(), undefined)).toBeUndefined()
    expect(reasoningLevels({ id: "plain", reasoning: false })).toEqual([])
    expect(resolveReasoning({ id: "plain", reasoning: false }, "high")).toBeUndefined()
  })

  test("legacy budgets keep the effort-to-budget interface and off", () => {
    const m = model([{ type: "budget_tokens", min: 1024 }])
    expect(reasoningLevels(m)).toContain("max")
    expect(resolveReasoning(m, "off")).toBe("off")
    expect(resolveReasoning(m, "high")).toBe("high")
  })

  test("missing metadata preserves existing custom model levels", () => {
    expect(reasoningLevels(model())).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
    expect(resolveReasoning(model(), "high")).toBe("high")
  })

  test("explicit provider quirks take precedence over catalog effort lists", () => {
    const m = {
      ...model([{ type: "effort", values: ["none", "low", "medium", "high", "max"] }]),
      provider: { quirks: { reasoningLevels: ["low", "medium", "high", "xhigh"] as const } },
    }
    expect(
      resolveReasoning(
        { ...m, provider: { quirks: { reasoningLevels: ["low", "medium", "high", "xhigh"] } } },
        "off"
      )
    ).toBe("low")
  })
})
