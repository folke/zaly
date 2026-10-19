import { describe, expect, test } from "vitest"
import { defaultSettings } from "../src/defaults.ts"
import { validateConfig } from "../src/schemas/gen/config.ts"

describe("syntax highlighting configuration", () => {
  test("defaults to automatic theme selection", () => {
    expect(defaultSettings.ui.shiki).toBe("auto")
  })

  test.each(["auto", "github-dark", "tokyo-night"])("accepts %s", (shiki) => {
    expect(validateConfig({ ui: { shiki } }).ui?.shiki).toBe(shiki)
  })

  test("rejects unknown highlighting selections", () => {
    expect(() => validateConfig({ ui: { shiki: "not-a-shiki-theme" } })).toThrow()
    expect(() => validateConfig({ ui: { shiki: "theme" } })).toThrow()
  })
})
