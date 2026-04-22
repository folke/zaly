import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/style/theme.ts"
import { log } from "../../src/widgets/log.ts"

const ctx = createCtx({ theme, width: 40 })
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\]8;;[^\x07]*\x07/g, "")

describe("log() widget", () => {
  test("info emits a leading icon prefix", async () => {
    const rows = await log({ content: "hello", level: "info" }).render(ctx)
    expect(rows).toHaveLength(1)
    const plain = strip(rows[0]).replace(/ +$/, "")
    expect(plain).toMatch(/^ℹ\s+hello$/)
  })

  test("error emits a badge-style prefix containing the level", async () => {
    const rows = await log({ content: "boom", level: "error" }).render(ctx)
    const plain = strip(rows[0])
    expect(plain).toContain("error")
    expect(plain).toContain("boom")
  })

  test("log level has no prefix chrome", async () => {
    const rows = await log({ content: "x", level: "log" }).render(ctx)
    expect(strip(rows[0]).replace(/ +$/, "")).toBe("x")
  })

  test("wrapped lines indent to align with prefix", async () => {
    const narrow = createCtx({ theme, width: 10 })
    const rows = await log({ content: "one two three four", level: "info" }).render(narrow)
    expect(rows.length).toBeGreaterThan(1)
    const first = strip(rows[0])
    const cont = strip(rows[1])
    expect(first).toMatch(/^ℹ\s+one/)
    // Continuation lines start with spaces (aligned with prefix body).
    expect(cont.startsWith("  ")).toBe(true)
  })

  test("overrides: style=title + custom icon", async () => {
    const rows = await log({
      content: "hi",
      icon: "»",
      level: "info",
      style: "prompt",
    }).render(ctx)
    const plain = strip(rows[0])
    expect(plain).toMatch(/^»\s+info\s+hi/)
  })

  test("accepts a Node as content", async () => {
    const { text } = await import("../../src/widgets/text.ts")
    const rows = await log({ content: text("from-node"), level: "info" }).render(ctx)
    expect(strip(rows[0])).toContain("from-node")
  })
})
