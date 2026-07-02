import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { signal } from "../../src/core/reactive.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
import { show } from "../../src/widgets/show.ts"
import { text } from "../../src/widgets/text.ts"

const ctx: RenderCtx = createCtx({ theme, width: 20 })

describe("show", () => {
  test("guard-only false renders no rows", async () => {
    const node = show({ when: false }, () => text("fallback"))
    expect(await node.render(ctx)).toEqual([])
  })

  test("guard-only true continues to fallback", async () => {
    const node = show({ when: true }, () => text("fallback"))
    expect(await node.render(ctx)).toEqual(["fallback"])
  })

  test("chooses the first matching branch", async () => {
    const node = show(
      { use: () => text("first"), when: true },
      { use: () => text("second"), when: true },
      () => text("fallback")
    )
    expect(await node.render(ctx)).toEqual(["first"])
  })

  test("falls back when no branch matches", async () => {
    const node = show(
      { use: () => text("first"), when: false },
      { use: () => text("second"), when: false },
      () => text("fallback")
    )
    expect(await node.render(ctx)).toEqual(["fallback"])
  })

  test("branches are lazy and reused across toggles", async () => {
    const [enabled, setEnabled] = signal(false)
    const createBranch = vi.fn(() => text("branch"))
    const node = show({ use: createBranch, when: enabled }, () => text("fallback"))

    expect(await node.render(ctx)).toEqual(["fallback"])
    expect(createBranch).not.toHaveBeenCalled()

    setEnabled(true)
    expect(await node.render(ctx)).toEqual(["branch"])
    expect(createBranch).toHaveBeenCalledTimes(1)

    setEnabled(false)
    expect(await node.render(ctx)).toEqual(["fallback"])
    setEnabled(true)
    expect(await node.render(ctx)).toEqual(["branch"])
    expect(createBranch).toHaveBeenCalledTimes(1)
  })

  test("fallback must be final", () => {
    const invalid = [() => text("fallback"), { when: true }] as unknown as Parameters<typeof show>
    expect(() => show(...invalid)).toThrow("Show: `fallback` must be the final argument")
  })
})
