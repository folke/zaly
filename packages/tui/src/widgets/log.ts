import type { RenderCtx } from "../core/ctx.ts"
import type { LogLevel } from "../logger/levels.ts"
import type { Color } from "../style/types.ts"
import type { TextContent } from "./text.ts"

import { hasColors } from "@zaly/shared/env"
import { Node, isNode } from "../core/node.ts"
import { stringWidth } from "../style/ansi.ts"
import { text as textFactory } from "./text.ts"

export type LogStyle = "badge" | "icon" | "prompt" | "title" | "text"

export interface LogState {
  level: LogLevel
  content: Node | TextContent
  /** Rendering of the per-level prefix chunk. Defaults by level. */
  style?: LogStyle
  /** Single-glyph icon for `icon` / `prompt` styles. */
  icon?: string
  /** Theme slot or color name used to tint the prefix. */
  color?: Color
  /** Optional fg applied to a string body. Ignored when `content` is a Node. */
  textColor?: Color
  /** Extra plain text prepended to the auto prefix (unstyled). */
  prefix?: string
}

interface LevelDefaults {
  style: LogStyle
  icon?: string
  color?: Color
  textColor?: Color
}

/** Per-level default prefix style + icon + color. Matches rekal's
 *  `defaultStyles` table, adapted to zaly's theme slots. */
export const defaultLogStyles: Record<LogLevel, LevelDefaults> = {
  cancel: { color: "warn", icon: "✖ ", style: "icon" },
  debug: { color: "info", icon: "⚙ ", style: "prompt" },
  error: { color: "error", icon: "✖ ", style: "badge", textColor: "error" },
  fatal: { color: "error", icon: "☢ ", style: "badge" },
  info: { color: "info", icon: "ℹ ", style: "icon" },
  log: { color: "muted", icon: "●", style: "icon" },
  success: { color: "success", icon: "✔ ", style: "icon" },
  trace: { color: "muted", icon: "⠿", style: "icon", textColor: "muted" },
  warn: { color: "warn", icon: "⚠", style: "badge", textColor: "warn" },
}

export const noColorStyles: Record<LogStyle, LogStyle> = {
  badge: "title",
  icon: "text",
  prompt: "text",
  text: "text",
  title: "text",
}

export class Log extends Node<LogState> {
  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const s = this.state
    const base = defaultLogStyles[s.level]

    let style: LogStyle = s.style ?? base.style
    if (!hasColors) style = noColorStyles[style]

    let icon = s.icon ?? base.icon ?? ""
    icon = icon === "" ? "" : `${icon}${" ".repeat(2 - stringWidth(icon))}`
    const color: Color = s.color ?? base.color ?? "inherit"
    const textColor = s.textColor ?? base.textColor

    let styledPrefix = ""
    if (style === "badge") {
      styledPrefix = ctx.style.bg(color).fg("black").bold(` ${s.level} `)
    } else if (style === "icon") {
      styledPrefix = ctx.style.fg(color)(icon)
    } else if (style === "prompt") {
      styledPrefix = ctx.style.fg(color).bold(`${icon} ${s.level}`)
    } else if (style === "title") {
      styledPrefix = ctx.style.fg(color).bold(`${s.level}:`)
    }

    if (s.prefix) styledPrefix = s.prefix + styledPrefix

    const prefixWidth = stringWidth(styledPrefix)
    const bodyOffset = prefixWidth === 0 ? 0 : prefixWidth + 1
    const bodyWidth = Math.max(1, ctx.width - bodyOffset)

    const body: Node = isNode(s.content)
      ? s.content
      : textFactory(s.content, textColor ? { fg: textColor } : {})

    const bodyRows = await body.render({ ...ctx, width: bodyWidth })

    if (bodyOffset === 0) return bodyRows

    const pad = " ".repeat(bodyOffset)
    return bodyRows.map((row, i) => (i === 0 ? `${styledPrefix} ${row}` : `${pad}${row}`))
  }
}

/**
 * A single log entry — level-styled prefix (icon / badge / prompt / title /
 * plain text) followed by the body content. The body can be any Node, so
 * callers can stack markdown, code, images, etc. inside a log line.
 *
 * ```ts
 * log({ level: "info", content: "hello" })
 * log({ level: "error", content: markdown("**boom**") })
 * ```
 */
export function log(state: LogState): Log {
  return new Log(state)
}
