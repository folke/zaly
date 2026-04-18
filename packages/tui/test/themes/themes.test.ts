import { describe, expect, test } from "vitest"
import { resolveStyleSlot } from "../../src/style/compose.ts"
import { ansi } from "../../src/themes/ansi.ts"
import { moon } from "../../src/themes/tokyonight.ts"

describe("theme part slots — moon", () => {
  test("border slot defined", () => {
    expect(moon.border).toBeDefined()
  })

  test("borderTitle slot defined", () => {
    expect(moon.borderTitle).toBeDefined()
  })

  test("border resolves to a Style via resolveStyleSlot", () => {
    const s = resolveStyleSlot("border", moon)
    expect(s.fg).toBeDefined()
  })
})

describe("theme part slots — ansi", () => {
  test("border slot defined", () => {
    expect(ansi.border).toBeDefined()
  })

  test("borderTitle slot defined", () => {
    expect(ansi.borderTitle).toBeDefined()
  })
})
