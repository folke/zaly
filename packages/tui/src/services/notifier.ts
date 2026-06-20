import type { LogLevel } from "@zaly/shared/logger"
import type { Node } from "../core/node.ts"
import type { OverlayRenderState, OverlaySurface } from "../renderer/overlay.ts"
import type { LogState } from "../widgets/log.ts"
import type { Overlay } from "../widgets/overlay.ts"

import { log } from "../widgets/log.ts"
import { overlay } from "../widgets/overlay.ts"

export type NotifProps = Omit<LogState, "content" | "level"> & {
  level?: LogLevel
  timeout?: number
  keep?: () => boolean
  onClose?: () => void
}

type Notif = {
  node: Overlay
  opts?: NotifProps
  state?: OverlayRenderState
}

export class Notifier {
  #ui: OverlaySurface
  #active = new Map<Node, Notif>()
  #queue: Notif[] = []

  constructor(ui: OverlaySurface) {
    this.#ui = ui
    ui.on("render-node", ({ node, ...state }) => {
      const notif = this.#active.get(node)
      if (!notif) return
      notif.state = state
    })
  }

  #notif(msg: string, opts?: NotifProps) {
    return overlay(
      { padding: [0, 0], width: 40, x: -40, y: 1, zIndex: 1000 },
      log({
        level: "info",
        ...opts,
        content: msg,
        style: "notif",
      })
    )
  }

  #start(notif: Notif) {
    this.#active.set(notif.node, notif)
    notif.node.state.visible = true
    const t = setInterval(() => {
      if (notif.opts?.keep?.()) return
      clearInterval(t)
      this.#active.delete(notif.node)
      this.#ui.close(notif.node)
      notif.opts?.onClose?.()
      this.#check()
    }, notif.opts?.timeout ?? 3000)
    t.unref()
  }

  #check() {
    if (this.#queue.length === 0) return

    const termHeight = this.#ui.$r.terminal.rows
    let y = 2
    for (const n of this.#active.values()) {
      if (!n.state) return // wait till it renders
      y = Math.max(y, n.state.y + n.state.height + 1)
    }
    if (termHeight - y < 10) return // Don't start if less than 10 rows remain below the last notif

    const next = this.#queue.shift()!
    next.node.state.y = y
    this.#start(next)
  }

  notify(msg: string, opts?: NotifProps): Overlay {
    const node = this.#ui.add(() => this.#notif(msg, opts))
    this.#queue.push({ node, opts })
    setImmediate(() => this.#check())
    return node
  }
}
