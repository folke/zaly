import { shikiThemes } from "@zaly/tui"
import { expect, test } from "vitest"
import configSchema from "../assets/schemas/config.schema.json" with { type: "json" }
import { validateConfig } from "../src/schemas/config.ts"
import { validateModels } from "../src/schemas/models.ts"
import { validateState } from "../src/schemas/state.ts"

test("config accepts partial settings and normalizes keymaps without mutating the input", () => {
  const input = { keymap: { one: "A", many: ["B", "ctrl- "] }, ui: { transparent: true } }
  expect(validateConfig(input)).toEqual({
    keymap: { one: "shift-a", many: ["shift-b", "ctrl-space"] },
    ui: { transparent: true },
  })
  expect(input.keymap.one).toBe("A")
  expect(input.keymap.many).toEqual(["B", "ctrl- "])
  expect(validateConfig({})).toEqual({ keymap: {} })
})

test("config preserves nested partials and plugin-defined tool names", () => {
  const input = { ui: { collapsedTools: ["plugin-tool"] }, skills: {}, resources: { plugin: {} } }
  expect(validateConfig(input)).toEqual({ ...input, keymap: {} })
})

test("config accepts exactly auto and the current bundled Shiki themes", async () => {
  const themes = await shikiThemes()
  expect(configSchema.definitions.ShikiTheme.enum.toSorted()).toEqual(
    themes.map(({ id }) => id).toSorted()
  )
  expect(validateConfig({ ui: { shiki: "auto" } }).ui?.shiki).toBe("auto")
  for (const { id } of themes) {
    expect(validateConfig({ ui: { shiki: id } }).ui?.shiki).toBe(id)
  }
})

test.each([
  { unknown: true },
  { ui: { unknown: true } },
  { ui: { shiki: "not-a-theme" } },
  { keymap: { action: [42] } },
  { permissions: { preset: "invalid" } },
  { resources: { plugin: { include: [false] } } },
  { compaction: { threshold: "high" } },
])("config rejects malformed or unknown settings: %j", (input) => {
  expect(() => validateConfig(input)).toThrow(/Invalid config/)
})

test("models accept provider overrides, partial metadata, and pricing tiers", () => {
  const input = {
    local: {
      api: "custom-adapter",
      headers: { Authorization: "token" },
      models: [
        {
          id: "test",
          input: ["text", "image"],
          cost: { input: 1, output: 2, context_over_200k: { input: 3, output: 4 } },
        },
      ],
      quirks: { maxTokensField: "none", reasoningLevels: ["high", "max"] },
      replaceModels: true,
    },
  }
  expect(validateModels(input)).toBe(input)
  expect(validateModels({ local: {} })).toEqual({ local: {} })
})

test.each([
  { local: { models: [{}] } },
  { local: { models: [{ id: "test", unknown: true }] } },
  { local: { models: [{ id: "test", input: ["smell"] }] } },
  { local: { models: [{ id: "test", cost: { input: 1 } }] } },
  { local: { models: [{ id: "test", cost: { input: 1, output: 2, context_over_200k: {} } }] } },
  { local: { quirks: { maxTokensField: "invalid" } } },
  { local: { oauth: {} } },
  { local: { apiKey: () => "token" } },
  { local: { models: () => [] } },
  { local: { headers: { Authorization: 42 } } },
])("models reject malformed overrides and runtime-only options: %j", (input) => {
  expect(() => validateModels(input)).toThrow(/Invalid models/)
})

test("state validation is strict, optional, and does not modify values", () => {
  const input = { inputHistory: ["hello"], lastModel: "local/test" }
  expect(validateState(input)).toBe(input)
  expect(validateState({})).toEqual({})
  expect(() => validateState({ lastModel: 1 })).toThrow(/lastModel/)
  expect(() => validateState({ inputHistory: [false] })).toThrow(/inputHistory/)
  expect(() => validateState({ unknown: true })).toThrow(/unknown/)
})
