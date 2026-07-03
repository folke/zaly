import type { RenderCtx } from "../core/ctx.ts"
import type { MouseEvent } from "../input/decoder.ts"
import type { RenderFrame } from "./frame.ts"
import type { Renderer } from "./renderer.ts"
import type { Point } from "./surface.ts"

import { Emitter } from "@zaly/shared"
import { isDeepStrictEqual } from "node:util"
import { untrack } from "../core/reactive.ts"

export type SelectionSurface = "stream" | "screen"

export type Selection = {
  dragging: boolean
  from: Point
  surface: SelectionSurface
  to: Point
}

type HitPoint = {
  screen: Point
  stream?: Point
}

export type SelectionEvents = {
  change: { selection?: Selection; prev?: Selection }
}

export class SelectionLayer extends Emitter<SelectionEvents> {
  #selection: Selection | undefined
  $r: Renderer

  constructor(renderer: Renderer) {
    super()
    this.$r = renderer
  }

  get selection(): Selection | undefined {
    return this.#selection
  }

  set selection(value: Selection | undefined) {
    const prev = this.#selection
    if (isDeepStrictEqual(prev, value)) return
    this.#selection = value
    this.invalidate()
    void this.emit("change", { prev, selection: value })
  }

  invalidate(): void {
    this.$r.overlay.invalidate()
    untrack(() => void this.$r.emit("dirty"))
  }

  mouse(event: MouseEvent): boolean {
    if (event.kind === "scroll") return false
    if (event.button !== "left") return false

    const point = this.#hit(event)
    if (event.kind === "down") {
      this.selection = point.stream
        ? { dragging: true, from: point.stream, surface: "stream", to: point.stream }
        : { dragging: true, from: point.screen, surface: "screen", to: point.screen }
      return true
    }

    const selection = this.#selection
    if (!selection?.dragging) return false

    if (event.kind === "drag") {
      this.selection = this.#update(selection, point, true)
      return true
    }

    const next = this.#update(selection, point, false)
    this.selection = samePoint(next.from, next.to) ? undefined : next
    return true
  }

  clear(): void {
    if (!this.#selection) return
    this.selection = undefined
  }

  render(frame: RenderFrame, ctx: RenderCtx): void {
    const selection = this.#selection
    if (!selection) return

    const from = this.#toScreen(selection.surface, selection.from)
    const to = this.#toScreen(selection.surface, selection.to)
    const start = before(from, to) ? from : to
    const end = start === from ? to : from
    const bounds = selection.surface === "stream" ? this.$r.stream.bounds : undefined
    renderRange({ bounds, ctx, end, frame, start })
  }

  #hit(event: MouseEvent): HitPoint {
    const screen = { col: event.x, row: event.y }
    if (this.$r.overlay.contains(screen)) return { screen }
    if (this.$r.ui.contains(screen)) return { screen }
    const stream = this.$r.stream.contains(screen) ? this.$r.stream.fromScreen(screen) : undefined
    return { screen, stream }
  }

  #update(selection: Selection, point: HitPoint, dragging: boolean): Selection {
    if (selection.surface === "stream" && point.stream)
      return { ...selection, dragging, to: point.stream }

    const from = selection.surface === "stream" ? this.$r.stream.toScreen(selection.from)! : selection.from
    return { dragging, from, surface: "screen", to: point.screen }
  }

  #toScreen(surface: SelectionSurface, point: Point): Point {
    return surface === "stream" ? this.$r.stream.toScreen(point)! : point
  }
}

function samePoint(a: Point, b: Point): boolean {
  return a.row === b.row && a.col === b.col
}

function before(a: Point, b: Point): boolean {
  return a.row < b.row || (a.row === b.row && a.col <= b.col)
}

function renderRange({
  bounds,
  ctx,
  end,
  frame,
  start,
}: {
  bounds?: { top: number; bottom: number }
  ctx: RenderCtx
  end: Point
  frame: RenderFrame
  start: Point
}): void {
  const firstRow = bounds ? Math.max(start.row, bounds.top) : start.row
  const lastRow = bounds ? Math.min(end.row, bounds.bottom) : end.row
  if (lastRow < firstRow) return

  if (firstRow === lastRow) {
    const from = firstRow === start.row ? start.col : 1
    const to = firstRow === end.row ? end.col : undefined
    frame.highlight(firstRow, from, to, ctx)
    return
  }

  frame.highlight(firstRow, firstRow === start.row ? start.col : 1, undefined, ctx)
  for (let row = firstRow + 1; row < lastRow; row++) {
    frame.highlight(row, 1, undefined, ctx)
  }
  frame.highlight(lastRow, 1, lastRow === end.row ? end.col : undefined, ctx)
}
