import type { CustomTheme } from "../../src/themes/default.ts"

import { expect, test } from "vitest"
import { validateTheme } from "../../src/schemas/theme.ts"
import { defaultsDark } from "../../src/themes/default.ts"

const theme = {
  id: "required-slots",
  fg: "#eeeeee",
  bg: "#111111",
  primary: "#82aaff",
  accent: "#c099ff",
  selection: { bg: "#334466", fg: "#ffffff" },
  success: "#55aa55",
  info: "#55aaaa",
  warn: "#aaaa55",
  error: "#aa5555",
  diffAdd: { fg: "success" },
  diffDel: { fg: "error" },
  syntaxBoolean: "primary",
  syntaxBracket: "fg",
  syntaxConstant: "accent",
  syntaxDelimiter: "fg",
  syntaxField: "fg",
  syntaxFunction: "primary",
  syntaxNumber: "primary",
  syntaxSpecial: "accent",
  syntaxString: "success",
} satisfies CustomTheme

const required = Object.keys(theme).filter((key) => !(key in defaultsDark))

test("accepts a theme providing only the required slots", () => {
  expect(validateTheme(theme)).toEqual(theme)
})

test.each(required)("rejects a missing required slot: %s", (key) => {
  const input: Record<string, unknown> = { ...theme }
  delete input[key]
  expect(() => validateTheme(input)).toThrow()
})

test.each(required)("rejects an undefined required slot: %s", (key) => {
  expect(() => validateTheme({ ...theme, [key]: undefined })).toThrow()
})

test("accepts optional fallback overrides and custom slots", () => {
  const input = { ...theme, title: { bold: false }, pluginSlot: { fg: "primary" } }
  expect(validateTheme(input)).toEqual(input)
})

test("keeps color-only slots distinct from style slots", () => {
  expect(() => validateTheme({ ...theme, primary: { fg: "#ff0000" } })).toThrow()
})
