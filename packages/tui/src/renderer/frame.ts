import type { RenderCtx } from "../core/ctx.ts"
import type { Terminal } from "./terminal.ts"

import { sliceAnsi, stringWidth } from "@zaly/shared/ansi"
import { stripAnsiBg } from "../style/ansi.ts"

export type FrameOp = (terminal: Terminal) => void

export type LineSlice = {
  from: number
  line: string
  to?: number
}

function sliceLine(
  line: string,
  from: number | undefined,
  to: number | undefined,
  width: number
): LineSlice | undefined {
  const start = from ? Math.max(0, from - 1) : 0
  const end = to ? Math.max(start, to - 1) : width
  if (end <= start) return
  const lineWidth = stringWidth(line)
  if (start >= lineWidth) return
  const clampedEnd = Math.min(end, lineWidth)
  return { from: start + 1, line, to: clampedEnd + 1 }
}

export class Frame {
  #base: (string | undefined)[] = []
  #current: (string | undefined)[] = []

  constructor(readonly terminal: Terminal) {}

  reset(rows = this.terminal.rows): void {
    this.#base = Array(rows).fill(undefined)
    this.#current = Array(rows).fill(undefined)
  }

  begin(): RenderFrame {
    const rows = this.terminal.rows
    if (this.#current.length !== rows || this.#base.length !== rows) this.reset(rows)
    return new RenderFrame(this.terminal, this.#current, this.#base)
  }

  slice(
    row: number,
    from: number | undefined,
    to: number | undefined,
    width = this.terminal.cols
  ): LineSlice | undefined {
    return sliceLine(this.#current[row - 1] ?? "", from, to, width)
  }
}

export class RenderFrame {
  readonly #ops: FrameOp[] = []
  readonly #next: string[]

  constructor(
    readonly terminal: Terminal,
    readonly current: (string | undefined)[],
    readonly base: (string | undefined)[]
  ) {
    this.#next = base.map((row) => row ?? "")
  }

  get(row: number): string {
    return this.#next[row - 1] ?? ""
  }

  set(row: number, content: string): void {
    if (row < 1 || row > this.#next.length) return
    this.#next[row - 1] = content
  }

  clear(row: number): void {
    this.set(row, "")
  }

  overlay(row: number, col: number, content: string): void {
    if (row < 1 || row > this.#next.length) return
    const base = this.get(row)
    const start = Math.max(0, col - 1)
    const width = stringWidth(content)
    const prefix = sliceAnsi(base, 0, start)
    const pad = " ".repeat(Math.max(0, start - stringWidth(prefix)))
    this.set(row, `${prefix}${pad}${content}${sliceAnsi(base, start + width)}`)
  }

  slice(
    row: number,
    from: number | undefined,
    to: number | undefined,
    width = this.terminal.cols
  ): LineSlice | undefined {
    if (row < 1 || row > this.#next.length) return
    return sliceLine(this.get(row), from, to, width)
  }

  highlight(
    row: number,
    from: number | undefined,
    to: number | undefined,
    ctx: RenderCtx
  ): LineSlice | undefined {
    const ret = this.slice(row, from, to, ctx.width)
    if (!ret) return
    const start = ret.from - 1
    const end = (ret.to ?? ctx.width + 1) - 1
    const text = sliceAnsi(ret.line, start, end)
    const highlighted = ctx.style.selection(stripAnsiBg(text))
    this.set(row, `${sliceAnsi(ret.line, 0, start)}${highlighted}${sliceAnsi(ret.line, end)}`)
    return ret
  }

  queue(op: FrameOp): void {
    this.#ops.push(op)
  }

  commitBase(): void {
    for (let i = 0; i < this.#next.length; i++) this.base[i] = this.#next[i]
  }

  flush(): void {
    for (let i = 0; i < this.#next.length; i++) {
      const next = this.#next[i]
      if (this.current[i] === next) continue
      const row = i + 1
      this.queue((terminal) => {
        terminal.write(terminal.moveTo(row, 1) + terminal.clearLine() + next.trimEnd())
      })
      this.current[i] = next
    }
  }

  scrollUp(top: number, bottom: number, lines: number, op: FrameOp): void {
    if (lines <= 0 || top > bottom) return
    this.flush()
    this.queue(op)
    const from = Math.max(1, top)
    const to = Math.min(this.#next.length, bottom)
    const amount = Math.min(lines, to - from + 1)
    for (let i = from - 1; i < to; i++) {
      const source = i + amount
      const value = source < to ? (this.current[source] ?? "") : ""
      this.current[i] = value
      this.#next[i] = value
    }
  }

  scrollDown(top: number, bottom: number, lines: number, op: FrameOp): void {
    if (lines <= 0 || top > bottom) return
    this.flush()
    this.queue(op)
    const from = Math.max(1, top)
    const to = Math.min(this.#next.length, bottom)
    const amount = Math.min(lines, to - from + 1)
    for (let i = to - 1; i >= from - 1; i--) {
      const source = i - amount
      const value = source >= from - 1 ? (this.current[source] ?? "") : ""
      this.current[i] = value
      this.#next[i] = value
    }
  }

  paint(): { rows: number; ops: number } {
    const ops = this.#ops.length
    this.flush()
    const rows = this.#ops.length - ops
    for (const op of this.#ops) op(this.terminal)
    this.#ops.length = 0
    return { ops, rows }
  }
}
