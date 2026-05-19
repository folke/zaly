import type { Node, RenderCtx } from "@zaly/tui"
import type { Context } from "./context.ts"

import { Logger } from "@zaly/tui/logger"

/**
 * `Cli` carries parsed args + lazily-resolved config between citty's
 * `setup` hook and the lazy-loaded subcommand modules. Subcommands grab
 * `cli.config` when they run; bare invocation falls through to the TUI.
 */
export class Console extends Logger {
  #ctx: Context
  #renderCtx?: RenderCtx
  #queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context) {
    super({ styles: { log: { style: "text" } } })
    this.#ctx = ctx
    this.attach({
      append: (node) => {
        // Reassign so `exit()` (and the next append) can await the tail.
        // Discarding the chained promise — as `void this.#queue.then(...)`
        // did — leaves `#queue` as the original `Promise.resolve()`,
        // making `await this.#queue` a no-op and racing process.exit().
        this.#queue = this.#queue
          .then(() => this.#append(node))
          .catch((error) => process.stderr.write(`Logger error: ${error}\n`))
      },
    })
  }

  async #append(node: () => Node): Promise<void> {
    const { createCtx, createRender } = await import("@zaly/tui")
    this.#renderCtx ??= await createCtx({ theme: await this.#ctx.theme() })
    const rows = await createRender(node, this.#renderCtx)
    process.stdout.write(`${rows.join("\n")}\n`)
  }

  async flush(): Promise<void> {
    await this.#queue
  }
}
