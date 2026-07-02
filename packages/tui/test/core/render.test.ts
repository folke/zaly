import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Node } from "../../src/core/node.ts"
import { createRender } from "../../src/core/render.ts"
import {
  createAsync,
  createRoot,
  createSuspenseBoundary,
  memo,
  provideContext,
  SuspenseContext,
} from "../../src/core/reactive.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"

const ctx: RenderCtx = createCtx({ theme, width: 20 })

class ReaderNode extends Node<{ content: () => string }> {
  renderCalls = 0

  protected _render(): string[] {
    this.renderCalls++
    return [this.state.content()]
  }
}

class InRenderAsyncNode extends Node<{ content: string }> {
  renderCalls = 0

  constructor(private boundary: ReturnType<typeof createSuspenseBoundary>) {
    super({ content: "initial" })
  }

  protected _render(): string[] {
    this.renderCalls++
    if (this.renderCalls === 1) {
      this.boundary.increment()
      setTimeout(() => {
        this.state.content = "resolved"
        this.boundary.decrement()
      }, 0)
    }
    return [this.state.content]
  }
}

describe("createRender", () => {
  test("factory form installs a suspense boundary and returns resolved rows", async () => {
    const rows = await createRender(() => {
      const content = createAsync(async () => "resolved", { initialValue: "initial" })
      const formatted = memo(() => `[${content()}]`)
      return new ReaderNode({ content: formatted })
    }, ctx)

    expect(rows).toEqual(["[resolved]"])
  })

  test("prebuilt node form drains the provided boundary before rendering", async () => {
    const boundary = createSuspenseBoundary()
    const work = Promise.withResolvers<string>()

    const node = createRoot(() => {
      provideContext(SuspenseContext, boundary)
      const content = createAsync(() => work.promise, { initialValue: "initial" })
      return new ReaderNode({ content })
    })

    work.resolve("resolved")
    const rows = await createRender(node, { ...ctx, boundary })

    expect(rows).toEqual(["resolved"])
    expect(boundary.active()).toBe(false)
  })

  test("drains async work started during render and renders again", async () => {
    const boundary = createSuspenseBoundary()
    const node = new InRenderAsyncNode(boundary)

    const rows = await createRender(node, { ...ctx, boundary })

    expect(rows).toEqual(["resolved"])
    expect(node.renderCalls).toBe(2)
    expect(boundary.active()).toBe(false)
  })
})
