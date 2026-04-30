import type { Agent } from "@zaly/agent"
import type { Attachment, ContentPart, ImagePart, PdfPart, TextPart, Usage } from "@zaly/ai"
import type { Input, LogCallable } from "@zaly/tui"
import type { Config } from "./config.ts"
import type { RenderHandle } from "./render/index.ts"

import { toImagePart, toPdfPart } from "@zaly/ai"
import { fileDetect, imageConvert, imageInfo } from "@zaly/shared"
import { signal } from "@zaly/tui"
import { readFile } from "node:fs/promises"
import { basename } from "pathe"
import { registerActions } from "./actions.ts"
import { buildAgent } from "./agent.ts"
import { buildRenderer } from "./render/index.ts"

/** A staged attachment waiting to be sent. The `part` is what goes to
 *  the agent, `path` is the on-disk source for stream-side markdown. */
type StagedAttachment =
  | { kind: "image"; part: ImagePart; path: string }
  | { kind: "pdf"; part: PdfPart; path: string }

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
  #log!: LogCallable

  readonly #busy = signal(false)
  readonly #status = signal("ready")
  readonly #model = signal("")
  readonly #usage = signal<Usage>({ input: 0, output: 0 })

  /** Attachments pasted since the last submit, keyed by the
   *  `[Image #n]` / `[PDF #n]` index inserted into the input text.
   *  `part` is the encoded payload sent to the agent; `path` is the
   *  on-disk source so the stream's markdown view can render the
   *  image inline (`![](path)`) or link the PDF (`[name](path)`).
   *  Cleared on every submit so indices stay small and per-message. */
  readonly #attachments = new Map<number, StagedAttachment>()
  #attachCounter = 0

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
    this.#model.set(this.#agent.model.id)

    this.#render = buildRenderer(this.#agent, {
      busy: this.#busy.get,
      model: this.#model.get,
      status: this.#status.get,
      usage: this.#usage.get,
    })

    this.#log = this.#render.renderer.log

    registerActions({
      agent: this.#agent,
      renderer: this.#render.renderer,
      reset: () => this.#reset(),
      toggleHelp: this.#render.toggleHelp,
    })

    // Refresh usage after every step's terminal point — `agent.usage`
    // reflects the last response by the time `step-end` fires.
    this.#agent.on("step-end", () => {
      this.#usage.set(this.#agent.usage)
    })

    this.#agent.on("stop", ({ reason }) => {
      this.#busy.set(false)
      this.#status.set(reason === "error" ? "error" : "ready")
      if (reason === "error" && this.#agent.lastError) {
        const err = this.#agent.lastError
        console.error(`${err.name}: ${err.message}`)
        if (err.stack) console.error(err.stack)
      }
    })

    // Replay the tail of a resumed conversation so the stream surface
    // isn't empty on session load. 20 messages ≈ a handful of recent
    // exchanges; older history stays in the session and is sent to the
    // model on the next request — just not painted here.
    this.#render.stream.replay(this.#agent.messages.slice(-50))

    this.#render.input.on("submit", ({ value }, self) => {
      const trimmed = value.trim()
      if (trimmed === "" || this.#busy.get()) return
      self.setState({ cursor: 0, value: "" })
      void this.#submit(trimmed)
    })

    // Paste flow: reserve a `[Image #n]` / `[PDF #n]` placeholder in
    // the input at the cursor; on submit we'll swap placeholders for
    // markdown refs (rendered inline) and ship the encoded part to
    // the agent alongside the text. When the active model can't take
    // that modality — or the file is something other than an image
    // or PDF — paste the bare path as text so the user can keep
    // editing and decide what to do with it.
    this.#render.input.on("attach", ({ attachment: att }, self) => {
      void this.#stageAttachment(att, self)
    })
  }

  async #stageAttachment(
    att: { kind: "image" | "file"; path: string; type: string },
    input: Input
  ): Promise<void> {
    const isImage = att.kind === "image" || att.type.startsWith("image/")
    const isPdf =
      att.kind === "file" &&
      (att.type === "application/pdf" || att.path.toLowerCase().endsWith(".pdf"))

    if (isImage && this.#agent.model.canAttach("image")) {
      const detected = await fileDetect(att.path)
      if (detected?.type !== "image") {
        this.#log.error(`couldn't read image \`${att.path}\``)
        return insertAtCursor(input, att.path)
      }
      const info = imageInfo(detected)
      const ready = await imageConvert(info, ["png", "jpeg", "webp"])
      if (!ready) {
        this.#log.error(`couldn't convert \`${att.path}\` (**${info.format}**) to png/jpeg/webp`)
        return insertAtCursor(input, att.path)
      }
      const idx = ++this.#attachCounter
      this.#attachments.set(idx, { kind: "image", part: toImagePart(ready), path: att.path })
      insertAtCursor(input, `[Image #${idx}]`)
      return
    }

    if (isPdf && this.#agent.model.canAttach("pdf")) {
      const data = await readFile(att.path).catch((error: unknown) => {
        this.#log.error(`couldn't read **PDF** \`${att.path}\`: ${(error as Error).message}`)
        return undefined
      })
      if (!data) return insertAtCursor(input, att.path)
      const idx = ++this.#attachCounter
      this.#attachments.set(idx, { kind: "pdf", part: toPdfPart(data), path: att.path })
      insertAtCursor(input, `[PDF #${idx}]`)
      return
    }

    // Unsupported modality, unknown file kind, or model doesn't accept
    // attachments of this type — surface the path as plain text so the
    // user can keep typing or remove it.
    insertAtCursor(input, att.path)
  }

  async #submit(text: string): Promise<void> {
    // Collect referenced attachments in document order. Pastes the
    // user deleted before submit are silently dropped.
    const re = /\[(Image|PDF) #(\d+)\]/g
    const referenced: Attachment[] = []
    for (const m of text.matchAll(re)) {
      const entry = this.#attachments.get(Number(m[2]))
      if (entry) referenced.push(entry.part)
    }

    // Stream display: swap placeholders for markdown refs on their
    // own line. The markdown widget only renders an image as a block
    // (real picture rows) when the `![](…)` reference sits alone on
    // a line — inline refs fall back to alt text. Padding with blank
    // lines triggers block render. PDFs become regular markdown
    // links so the user sees a clickable filename in the transcript.
    //
    // The agent gets the raw text (with `[Image #n]` / `[PDF #n]`
    // placeholders) plus the encoded parts as separate content
    // entries — the model correlates them via the literal placeholder.
    const display = text.replace(re, (whole, _kind, n) => {
      const entry = this.#attachments.get(Number(n))
      if (!entry) return whole
      if (entry.kind === "image") return `\n\n![](${entry.path})\n\n`
      return `\n\n[${basename(entry.path)}](${entry.path})\n\n`
    })
    this.#render.stream.pushUser(display)

    const message =
      referenced.length === 0
        ? { content: text, role: "user" as const }
        : {
            content: [{ text, type: "text" } as TextPart, ...referenced] as ContentPart[],
            role: "user" as const,
          }

    this.#attachments.clear()
    this.#attachCounter = 0
    this.#busy.set(true)
    this.#status.set("thinking")
    this.#agent.inject(message)
    await this.#agent.waitIdle()
  }

  async #reset(): Promise<void> {
    this.#render.stream.dispose()
    await this.#agent.dispose()
    this.#agent = await buildAgent(this.#config)
    this.#model.set(this.#agent.model.id)
    // Re-bind stream + actions to the new agent. Renderer/UI stays.
    // Quick + dirty: rebuild everything except the renderer itself.
    // (Future: Renderer should expose `clear()` so we don't accumulate
    // history nodes across resets.)
  }
}

/** Insert `s` at the input's current cursor and advance the cursor. */
function insertAtCursor(input: Input, s: string): void {
  const v = input.state.value ?? ""
  const c = input.state.cursor ?? 0
  input.setState({ cursor: c + s.length, value: v.slice(0, c) + s + v.slice(c) })
}
