import type { LogLevel } from "@zaly/shared/logger"
import type { OverlaySurface } from "../renderer/overlay.ts"
import type { LogState } from "../widgets/log.ts"
import type { Overlay } from "../widgets/overlay.ts"

import { log } from "../widgets/log.ts"
import { overlay } from "../widgets/overlay.ts"

export type NotifProps = Omit<LogState, "content" | "level"> & {
  level?: LogLevel
  timeout?: number
  onClose?: () => void
}

export class Notifier {
  #ui: OverlaySurface

  constructor(ui: OverlaySurface) {
    this.#ui = ui
  }

  #notif(msg: string, opts?: NotifProps) {
    return overlay(
      { padding: [1, 1], width: 40, x: -40, y: 1 },
      log({
        level: "info",
        ...opts,
        content: msg,
        style: "notif",
      })
    )
  }

  notify(msg: string, opts?: NotifProps): Overlay {
    const node = this.#ui.open(() => this.#notif(msg, opts))
    setTimeout(() => {
      this.#ui.close(node)
      opts?.onClose?.()
    }, opts?.timeout ?? 3000)
    return node
  }
}
