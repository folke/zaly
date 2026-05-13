import type { RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { AnsiHighlighter } from "../style/shiki.ts"
import type { Image } from "../widgets/image.ts"
import type { MdOptions, RenderMarkdown } from "./types.ts"

import { createCallbacks } from "./callbacks.ts"
import { shikiCodeLangs } from "./code.ts"
import { createImageCallback } from "./image.ts"

export type MarkdownOptions = MdOptions & {
  parent?: Node
}

export type MarkdownCtx = RenderCtx & {
  highlighter?: AnsiHighlighter | boolean
  images?: boolean
}

export class MarkdownRenderer {
  #render?: RenderMarkdown
  #images = new Map<string, Image>()
  #parent?: Node
  #opts: MarkdownOptions

  constructor(opts: MarkdownOptions = {}) {
    this.#opts = opts
    this.#parent = opts.parent
  }

  async render(source: string, ctx: MarkdownCtx): Promise<string> {
    // oxlint-disable-next-line unicorn/no-await-expression-member
    this.#render ??= this.#opts.render ?? (await import("#md")).renderMarkdown

    const callbacks = createCallbacks({
      ...ctx,
      highlighter: await this.#highlighter(source, ctx),
    })

    // Image handling: the callback emits `<img id=N>` markers during
    // rendering; a post-processing resolver then renders the referenced
    // images concurrently and splices their rows back in. Keeps the
    // markdown callback surface synchronous while supporting async
    // image preparation.
    const image =
      (ctx.images ?? true)
        ? createImageCallback({
            add: (child) => this.#parent?.add(child),
            images: this.#images,
            remove: (child) => this.#parent?.remove(child) ?? child.unmount(),
          })
        : undefined

    if (image) callbacks.image = image.cb

    let rendered = this.#render(source, callbacks, this.#opts)
    if (image) rendered = await image.resolve(ctx, rendered)
    return this.normalizeEol(source, rendered)
  }

  /** Mirror the source's trailing newlines: the renderer adds its own
  /* padding after blocks (`\n\n` after paragraphs, etc.) which would
  /* leave stray blank rows. Normalizing to what the caller typed keeps
  /* single-line inputs compact and preserves explicit spacing when
  /* they asked for it. */
  normalizeEol(source: string, rendered: string): string {
    rendered = rendered.replace(/\n\n+/g, "\n\n")
    const trailing = /\n*$/.exec(source)?.[0] ?? ""
    return rendered.replace(/\n+$/, trailing)
  }

  async #highlighter(source: string, ctx: MarkdownCtx) {
    if (ctx.highlighter === false) return
    if (ctx.highlighter === true) {
      const { shiki } = await import("../style/shiki.ts")
      const langs = shikiCodeLangs(source)
      const theme = ctx.style.theme.shiki
      await shiki.load(langs, theme)
      return shiki.highlighter(theme)
    }
    return ctx.highlighter
  }
}
