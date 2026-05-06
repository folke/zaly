import type { Color } from "../src/style/types.ts"

import { expect, test } from "vitest"

// These assertions run as compile-time checks via tsc (`@ts-expect-error` is a
// meta-assertion that fails the build if the marked line does NOT error).
// The runtime test body is a no-op.

test("Color accepts valid forms and rejects invalid ones", () => {
  const _valid: Color[] = ["#82aaff", "#f00", "red", "brightRed", "primary", "accent", "inherit"]
  void _valid

  // @ts-expect-error — unknown name, typo.
  const _a: Color = "reddd"
  // @ts-expect-error — not a theme slot and not an ANSI name.
  const _b: Color = "turquoise"
  // @ts-expect-error — wrong bright casing (canonical is brightRed).
  const _c: Color = "BrightRed"
  void _a
  void _b
  void _c

  expect(true).toBe(true)
})
