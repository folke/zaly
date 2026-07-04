import type { RenderCtx } from "../core/ctx.ts"
import type { MouseEvent } from "../input/decoder.ts"
import type { LineSlice, RenderFrame } from "./frame.ts"
import type { Renderer } from "./renderer.ts"
import type { Point } from "./surface.ts"

import { Emitter } from "@zaly/shared"
import { sliceAnsi, stripAnsi } from "@zaly/shared/ansi"
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
  selection: { text: string; selection: Selection }
}

export class SelectionLayer extends Emitter<SelectionEvents> {
  #selection: Selection | undefined
  #text = ""
  #dirty = false
  #emitted?: Selection
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
    this.#dirty = true
    this.#emitted = undefined
    if (!value) {
      this.#text = ""
      this.#dirty = false
    }
    this.invalidate()
    void this.emit("change", { prev, selection: value })
  }

  get text(): string | undefined {
    return this.#selection ? this.#text : undefined
  }

  set text(value: string) {
    if (this.#text === value && !this.#dirty) return
    this.#text = value
    const selection = this.#selection
    if (!selection || selection.dragging || this.#emitted === selection) return
    this.#dirty = false
    setImmediate(() => {
      if (selection !== this.#selection || value !== this.#text) return
      this.#emitted = selection
      void this.emit("selection", { selection, text: value })
    })
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
      if (event.click === 2) {
        this.select(point.screen, "word")
        return true
      }
      if (event.click === 3) {
        this.select(point.screen, "line")
        return true
      }
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

  select(screen: Point, what: "line" | "word"): void {
    const point = this.#hitPoint(screen)
    const line = this.$r.frame.slice(screen.row, 1, undefined)
    if (!line) return
    const slice = what === "line" ? lineRange(line.line) : wordRange(line.line, screen.col)
    if (!slice) return
    const row = point.stream?.row ?? screen.row
    this.selection = {
      dragging: false,
      from: { col: slice.from, row },
      surface: point.stream ? "stream" : "screen",
      to: { col: slice.to, row },
    }
  }

  renderStream(frame: RenderFrame, ctx: RenderCtx): void {
    if (this.#selection?.surface === "stream") this.render(frame, ctx)
  }

  renderScreen(frame: RenderFrame, ctx: RenderCtx): void {
    if (this.#selection?.surface === "screen") this.render(frame, ctx)
  }

  render(frame: RenderFrame, ctx: RenderCtx): void {
    const selection = this.#selection
    if (!selection) return

    const from = this.#toScreen(selection.surface, selection.from)
    const to = this.#toScreen(selection.surface, selection.to)
    const start = before(from, to) ? from : to
    const end = start === from ? to : from
    const bounds = selection.surface === "stream" ? this.$r.stream.bounds : undefined
    const highlighted = renderRange({ bounds, ctx, end, frame, start })
    this.text = normalizeText(
      selection.surface === "stream" ? this.#streamSlices(start, end, bounds!) : highlighted
    )
  }

  #hit(event: MouseEvent): HitPoint {
    return this.#hitPoint({ col: event.x, row: event.y })
  }

  #hitPoint(screen: Point): HitPoint {
    if (this.$r.overlay.contains(screen)) return { screen }
    if (this.$r.ui.contains(screen)) return { screen }
    const stream = this.$r.stream.contains(screen) ? this.$r.stream.fromScreen(screen) : undefined
    return { screen, stream }
  }

  #update(selection: Selection, point: HitPoint, dragging: boolean): Selection {
    if (selection.surface === "stream" && point.stream)
      return { ...selection, dragging, to: point.stream }

    const from =
      selection.surface === "stream" ? this.$r.stream.toScreen(selection.from)! : selection.from
    return { dragging, from, surface: "screen", to: point.screen }
  }

  #toScreen(surface: SelectionSurface, point: Point): Point {
    return surface === "stream" ? this.$r.stream.toScreen(point)! : point
  }

  #streamSlices(start: Point, end: Point, bounds: { top: number; bottom: number }): LineSlice[] {
    const ret: LineSlice[] = []
    const firstRow = Math.max(start.row, bounds.top)
    const lastRow = Math.min(end.row, bounds.bottom)
    if (lastRow < firstRow) return ret

    for (let row = firstRow; row <= lastRow; row++) {
      const streamPoint = this.$r.stream.fromScreen({ col: 1, row })
      if (!streamPoint) continue
      const line = this.$r.stream.getRow(streamPoint.row)
      if (line === undefined) continue
      ret.push({
        from: row === start.row ? start.col : 1,
        line,
        to: row === end.row ? end.col : undefined,
      })
    }
    return ret
  }
}

type Range = { from: number; to: number }

const WORD = /^[\w\-/\\@]$/

function lineRange(line: string): Range | undefined {
  const text = stripAnsi(line)
  const start = text.search(/\S/)
  if (start === -1) return
  let end = text.length
  while (end > start && /\s/.test(text[end - 1]!)) end--
  return { from: start + 1, to: end + 1 }
}

function wordRange(line: string, col: number): Range | undefined {
  const text = stripAnsi(line)
  const index = col - 1
  if (index < 0 || index >= text.length) return
  const match = charClass(text[index]!)
  let start = index
  while (start > 0 && charClass(text[start - 1]!) === match) start--
  let end = index + 1
  while (end < text.length && charClass(text[end]!) === match) end++
  return { from: start + 1, to: end + 1 }
}

function charClass(char: string): "space" | "word" | "punct" {
  if (/\s/.test(char)) return "space"
  if (WORD.test(char)) return "word"
  return "punct"
}

function samePoint(a: Point, b: Point): boolean {
  return a.row === b.row && a.col === b.col
}

function before(a: Point, b: Point): boolean {
  return a.row < b.row || (a.row === b.row && a.col <= b.col)
}

function normalizeText(slices: LineSlice[]): string {
  const lines = slices.map((slice) => {
    const full = stripAnsi(slice.line).trimEnd()
    const text = stripAnsi(
      sliceAnsi(slice.line, slice.from - 1, slice.to ? slice.to - 1 : undefined)
    ).trimEnd()
    return { from: slice.from, full, text }
  })
  const indent = commonIndent(lines.map((line) => line.full))
  return lines.map((line) => stripIndent(line.text, line.from, indent)).join("\n")
}

function commonIndent(lines: string[]): number {
  const nonEmpty = lines.filter((line) => line.trim() !== "")
  if (nonEmpty.length === 0) return 0
  return Math.min(...nonEmpty.map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0))
}

function stripIndent(line: string, from: number, indent: number): string {
  if (indent === 0 || line.trim() === "") return line
  const visibleBeforeSelection = from - 1
  const remove = Math.max(0, indent - visibleBeforeSelection)
  return remove === 0 ? line : line.slice(remove)
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
}): LineSlice[] {
  const lines: LineSlice[] = []
  const firstRow = bounds ? Math.max(start.row, bounds.top) : start.row
  const lastRow = bounds ? Math.min(end.row, bounds.bottom) : end.row
  if (lastRow < firstRow) return lines

  if (firstRow === lastRow) {
    const from = firstRow === start.row ? start.col : 1
    const to = firstRow === end.row ? end.col : undefined
    const text = frame.highlight(firstRow, from, to, ctx)
    if (text !== undefined) lines.push(text)
    return lines
  }

  const first = frame.highlight(firstRow, firstRow === start.row ? start.col : 1, undefined, ctx)
  if (first !== undefined) lines.push(first)
  for (let row = firstRow + 1; row < lastRow; row++) {
    const text = frame.highlight(row, 1, undefined, ctx)
    if (text !== undefined) lines.push(text)
  }
  const last = frame.highlight(lastRow, 1, lastRow === end.row ? end.col : undefined, ctx)
  if (last !== undefined) lines.push(last)
  return lines
}
