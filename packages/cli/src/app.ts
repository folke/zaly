import type { Agent } from "@zaly/agent"
import type { ContentPart, ImagePart, TextPart } from "@zaly/ai"
import type { ImageInfo } from "@zaly/shared"
import type { Config } from "./config.ts"
import type { RenderHandle } from "./render/index.ts"

import { imageConvert, imageInfo } from "@zaly/shared"
import { signal } from "@zaly/tui"
import { registerActions } from "./actions.ts"
import { buildAgent } from "./agent.ts"
import { buildRenderer } from "./render/index.ts"

/**
 * App = the long-lived glue between Agent and Renderer. Keeps state
 * minimal: signals for the UI footer, a single agent reference (which
 * can be swapped on /reset), and a render handle that gets disposed
 * with it.
 */
export class App {
  readonly #config: Config
  #agent!: Agent
  #render!: RenderHandle

  readonly #busy = signal(false)
  readonly #status = signal("ready")
  readonly #model = signal("")

  /** Images pasted into the input since the last submit, keyed by the
   *  `[Image #n]` index inserted into the text. `part` is the encoded
   *  payload sent to the agent; `path` is the on-disk source so the
   *  stream's markdown view can render it inline via `![](path)`.
   *  Cleared on every submit so indices stay small and per-message. */
  readonly #images = new Map<number, { part: ImagePart; path: string }>()
  #imageCounter = 0

  constructor(config: Config) {
    this.#config = config
  }

  static async start(config: Config): Promise<App> {
    const app = new App(config)
    await app.#boot()
    app.#render.renderer.start()
    return app
  }

  async #boot(): Promise<void> {
    this.#agent = await buildAgent(this.#config)
    this.#model[1](this.#agent.model.id)

    this.#render = buildRenderer(this.#agent, {
      busy: this.#busy[0],
      model: this.#model[0],
      status: this.#status[0],
    })

    registerActions({
      agent: this.#agent,
      renderer: this.#render.renderer,
      reset: () => this.#reset(),
      toggleHelp: this.#render.toggleHelp,
    })

    this.#agent.on("stop", ({ reason }) => {
      this.#busy[1](false)
      this.#status[1](reason === "error" ? "error" : "ready")
      if (reason === "error" && this.#agent.lastError) {
        const err = this.#agent.lastError
        console.error(`${err.name}: ${err.message}`)
        if (err.stack) console.error(err.stack)
      }
    })

    this.#render.input.on("submit", ({ value }, self) => {
      const trimmed = value.trim()
      if (trimmed === "" || this.#busy[0]()) return
      self.setState({ cursor: 0, value: "" })
      void this.#submit(trimmed)
    })

    // Image paste: reserve a `[Image #n]` placeholder in the input
    // value at the cursor; on submit we'll swap placeholders for
    // markdown image refs (so they render inline) and attach the
    // ImagePart to the agent's message alongside the raw text.
    this.#render.input.on("attach", ({ attachment: att }, self) => {
      if (att.kind !== "image" && !att.type.startsWith("image/")) return
      void (async () => {
        const info = await imageInfo(att.path)
        if (!info) return
        const ready = await imageConvert(info, ["png", "jpeg", "webp"])
        if (!ready) return
        const idx = ++this.#imageCounter
        this.#images.set(idx, { part: toImagePart(ready), path: att.path })
        const tag = `[Image #${idx}]`
        const v = self.state.value ?? ""
        const c = self.state.cursor ?? 0
        self.setState({
          cursor: c + tag.length,
          value: v.slice(0, c) + tag + v.slice(c),
        })
      })()
    })
  }

  async #submit(text: string): Promise<void> {
    // Collect images referenced in the text in input order. Pastes
    // the user deleted before submit are silently dropped.
    const re = /\[Image #(\d+)\]/g
    const referenced: ImagePart[] = []
    for (const m of text.matchAll(re)) {
      const entry = this.#images.get(Number(m[1]))
      if (entry) referenced.push(entry.part)
    }

    // Stream display: swap placeholders for markdown image refs on
    // their own line. The markdown widget only renders an image as a
    // block (real picture rows) when the `![](…)` reference sits alone
    // on a line — inline refs fall back to alt text. Padding with blank
    // lines triggers block render.
    //
    // The agent gets the raw text (with `[Image #n]` placeholders)
    // plus the ImageParts as separate content entries — the model
    // correlates them via the literal placeholder.
    const display = text.replace(re, (whole, n) => {
      const entry = this.#images.get(Number(n))
      return entry ? `\n\n![](${entry.path})\n\n` : whole
    })
    this.#render.stream.pushUser(display)

    const message =
      referenced.length === 0
        ? { content: text, role: "user" as const }
        : {
            content: [{ text, type: "text" } as TextPart, ...referenced] as ContentPart[],
            role: "user" as const,
          }

    this.#images.clear()
    this.#imageCounter = 0
    this.#busy[1](true)
    this.#status[1]("thinking")
    this.#agent.inject(message)
    await this.#agent.waitIdle()
  }

  async #reset(): Promise<void> {
    this.#render.stream.dispose()
    await this.#agent.dispose()
    this.#agent = await buildAgent(this.#config)
    this.#model[1](this.#agent.model.id)
    // Re-bind stream + actions to the new agent. Renderer/UI stays.
    // Quick + dirty: rebuild everything except the renderer itself.
    // (Future: Renderer should expose `clear()` so we don't accumulate
    // history nodes across resets.)
  }
}

/** Wrap a converted image as an `ImagePart` for an agent message. */
function toImagePart(img: ImageInfo<"jpeg" | "webp" | "png">): ImagePart {
  const mime = ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const)[img.format]
  return {
    mime,
    source: { data: Buffer.from(img.data).toString("base64"), type: "base64" },
    type: "image",
  }
}
