import type { LogLevel } from "@zaly/shared/logger"
import type { RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Color } from "../style/types.ts"

import { hasColors } from "@zaly/shared/env"
import { isMarkdown } from "../logger/inspect.ts"
import { stringWidth } from "../style/ansi.ts"
import { box } from "./box.ts"
import { markdown } from "./markdown.ts"
import { text } from "./text.ts"
import { widget } from "./widget.ts"

export type LogStyle = "badge" | "icon" | "prompt" | "title" | "text" | "notif"

export interface LogState {
  level: LogLevel
  content: string
  title?: string
  /** Rendering of the per-level prefix chunk. Defaults by level. */
  style?: LogStyle
  /** Single-glyph icon for `icon` / `prompt` styles. */
  icon?: string
  /** Theme slot or color name used to tint the prefix. */
  color?: Color
  /** Extra plain text prepended to the auto prefix (unstyled). */
  prefix?: string
  /** Theme slot or color name for the body text. Defaults by level, except */
  textColor?: Color
  markdown?: boolean
}

interface LevelDefaults {
  style: LogStyle
  icon?: string
  color?: Color
  textColor?: Color
}

/** Per-level default prefix style + icon + color. Matches rekal's
 *  `defaultStyles` table, adapted to zaly's theme slots. */
const defaultLogStyles: Record<LogLevel, LevelDefaults> = {
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

const noColorStyles: Record<LogStyle, LogStyle> = {
  badge: "title",
  icon: "text",
  notif: "text",
  prompt: "text",
  text: "text",
  title: "text",
}

function renderPrefix(s: LogState, ctx: RenderCtx): string {
  const style = ctx.style

  const base = defaultLogStyles[s.level]
  let ls: LogStyle = s.style ?? base.style
  if (!hasColors) ls = noColorStyles[ls]

  let icon = s.icon ?? base.icon ?? ""
  icon = icon === "" ? "" : `${icon}${" ".repeat(2 - stringWidth(icon))}`
  const color: Color = s.color ?? base.color ?? "inherit"

  // text doesn't get a prefix
  let styledPrefix = ""
  if (ls === "badge") {
    styledPrefix = style.bg(color).fg("black").bold(` ${s.level} `)
  } else if (ls === "icon") {
    styledPrefix = style.fg(color)(icon)
  } else if (ls === "prompt") {
    styledPrefix = style.fg(color).bold(`${icon} ${s.level}`)
  } else if (ls === "title") {
    styledPrefix = style.fg(color).bold(`${s.level}:`)
  } else if (ls === "notif") {
    styledPrefix = style.fg(color).bold(`${icon} ${s.title ?? s.level}`)
  }

  if (s.prefix) styledPrefix = s.prefix + styledPrefix
  if (s.title) styledPrefix += style.bold(` ${s.title}`)
  return styledPrefix
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
export const log = widget((state: LogState, ...children: Node[]) => {
  const body =
    (state.markdown ?? true) && isMarkdown(state.content)
      ? markdown(state.content, { width: "fill" })
      : text(state.content, { width: "fill" })

  const base = defaultLogStyles[state.level]
  const color: Color = state.color ?? base.color ?? "inherit"
  const textColor = state.textColor ?? base.textColor
  body.setState({ style: textColor ? { fg: textColor } : undefined })

  const s = state

  return box(
    {
      ...(s.style === "notif"
        ? {
            border: "single",
            borderStyle: { fg: color },
            borderTitle: (ctx) => renderPrefix(state, ctx),
            borderTitleAlign: "center",
            padding: [0, 1],
            //style: "overlay",
            width: "fill",
          }
        : undefined),
      flexDirection: "row",
      gap: 1,
    },
    s.style === "notif" ? undefined : text((ctx) => renderPrefix(state, ctx)),
    body,
    ...children
  )
})
