import type { RenderCtx } from "../core/ctx.ts"
import type { MouseEvent } from "../input/decoder.ts"
import type { RenderFrame } from "./frame.ts"

export type SelectionPoint = {
  surface: "screen"
  row: number
  col: number
}

export type Selection = {
  anchor: SelectionPoint
  focus: SelectionPoint
  dragging: boolean
}

export type SelectionLayerHost = {
  invalidate: () => void
}

export class SelectionLayer {
  #host: SelectionLayerHost
  #selection: Selection | undefined

  constructor(host: SelectionLayerHost) {
    this.#host = host
  }

  get selection(): Selection | undefined {
    return this.#selection
  }

  mouse(event: MouseEvent): boolean {
    if (event.kind === "scroll") return false
    if (event.button !== "left") return false

    const point = screenPoint(event)
    if (event.kind === "down") {
      this.#selection = { anchor: point, dragging: true, focus: point }
      this.#host.invalidate()
      return true
    }

    const selection = this.#selection
    if (!selection?.dragging) return false

    if (event.kind === "drag") {
      selection.focus = point
      this.#host.invalidate()
      return true
    }

    selection.focus = point
    selection.dragging = false
    if (samePoint(selection.anchor, selection.focus)) this.#selection = undefined
    this.#host.invalidate()
    return true
  }

  clear(): void {
    if (!this.#selection) return
    this.#selection = undefined
    this.#host.invalidate()
  }

  render(frame: RenderFrame, ctx: RenderCtx): void {
    const selection = this.#selection
    if (!selection) return
    const { anchor, focus } = selection
    const start = before(anchor, focus) ? anchor : focus
    const end = start === anchor ? focus : anchor

    if (start.row === end.row) {
      frame.highlight(start.row, start.col, end.col, ctx)
      return
    }

    frame.highlight(start.row, start.col, undefined, ctx)
    for (let row = start.row + 1; row < end.row; row++) {
      frame.highlight(row, 1, undefined, ctx)
    }
    frame.highlight(end.row, 1, end.col, ctx)
  }
}

function screenPoint(event: MouseEvent): SelectionPoint {
  return { col: event.x, row: event.y, surface: "screen" }
}

function samePoint(a: SelectionPoint, b: SelectionPoint): boolean {
  return a.row === b.row && a.col === b.col
}

function before(a: SelectionPoint, b: SelectionPoint): boolean {
  return a.row < b.row || (a.row === b.row && a.col <= b.col)
}
