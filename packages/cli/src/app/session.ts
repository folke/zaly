import type { Session, SessionInfo, SessionNode } from "@zaly/agent/session"
import type { Message, TextPart, Usage } from "@zaly/ai"
import type { AnyStyle, RenderCtx } from "@zaly/tui"
import type { Option } from "@zaly/tui/widgets/select"
import type { TreeItem } from "@zaly/tui/widgets/tree"
import type { Flags } from "../types.ts"
import type { App } from "./app.ts"

import { loadSession, resumeSession } from "@zaly/agent/session"
import { formatNumber, normPath, prettyPath, safeStatAsync } from "@zaly/shared"
import { toolParams } from "../widgets/params.ts"

export async function bootstrapSession(flags: Flags): Promise<Session> {
  const filter = flags.session ?? normPath()

  if (flags.new) return await loadSession()

  const s = flags.session ? await safeStatAsync(flags.session) : undefined

  if (s?.isFile()) {
    const path = flags.session!

    if (isClaudePath(path)) {
      const { loadClaudeSession } = await import("@zaly/agent/session/claude")
      const loaded = await loadClaudeSession(path)
      const session = await loadSession()
      // oxlint-disable-next-line no-await-in-loop
      for (const m of loaded.messages) await session.add(m)
      return session
    }

    return await loadSession({ path })
  }

  const session = await resumeSession(filter)

  if (!session && flags.session) throw new Error(`No session found for \`${flags.session}\``)

  return session ?? (await loadSession())
}

function isClaudePath(p: string): boolean {
  // `~/.claude/projects/<encoded>/<id>.jsonl` is Claude Code's layout.
  return /(?:^|\/)\.claude\/projects\//.test(p)
}

type SessionItem = Option & { value: SessionInfo }

export async function pickSession(app: App) {
  const { listSessions, Session } = await import("@zaly/agent/session")
  const { stringifyContent } = await import("@zaly/ai")
  const { formatRelativeTime, formatSize } = await import("@zaly/shared")
  const sessions = await listSessions({
    filter: { workspace: normPath() },
    sort: true,
  })
  const messages = await Promise.all(
    sessions.map((s) => Session.lastMessage({ path: s.path }).catch(() => undefined))
  )
  if (sessions.length === 0) {
    app.ctx.info("No sessions found in this workspace.")
    return
  }

  const items: SessionItem[] = sessions.map((info, s) => {
    const text = messages[s] ? stringifyContent(messages[s].content) : "[new session]"
    return {
      desc: `${formatRelativeTime(info.mtime ?? 0)}, ${formatSize(info.stat?.size ?? 0, 1)}`,
      text,
      value: info,
    }
  })
  const ret = await app.pick({ items, sort: true })
  if (!ret) return
  await switchSession(ret.value, app)
}

export async function switchSession(opts: SessionInfo | undefined, app: App) {
  const { replay } = await import("./replay.ts")
  const s = await loadSession(opts)
  app.renderer.stream.reset()
  await Promise.all([replay(s, app), app.agent.ctx.useSession(s)])
}

export async function newSession(app: App) {
  return await switchSession(undefined, app)
}

export type SessionTreeFilter = "assistant" | "reasoning" | "tools" | "system" | "fallback"

export type SessionTreeOpts = {
  filter?: SessionTreeFilter[]
}

type TreeMessage = {
  role: Message["role"]
  text: string
  render: (ctx: RenderCtx) => string
}

function assertExhaustive(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}

const icons = {
  active: "● ",
  head: "▶ ",
  inactive: "○ ",
  reasoning: "∴ ",
}

const roleStyles = {
  assistant: { role: "success", text: "text" },
  reasoning: { role: "quiet", text: "quiet" },
  system: { role: "quiet", text: "quiet" },
  tool: { role: "info", text: "text" },
  user: { role: "primary", text: "text" },
} as const satisfies Record<string, { text: AnyStyle; role: AnyStyle }>

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function expand(
  m: Message,
  filter: Set<SessionTreeFilter>,
  opts: { active?: boolean; head?: boolean } = {}
): TreeMessage[] {
  const ret: TreeMessage[] = []
  if (m.role === "system" && !filter.has("system")) return ret
  if (m.role === "assistant" && !filter.has("assistant")) return ret

  const icon = (ctx: RenderCtx, ico?: string) => {
    if (opts.head) return ctx.style.accent(ico ?? icons.head)
    return opts.active
      ? ctx.style.accent(ico ?? icons.active)
      : ctx.style.divider(ico ?? icons.inactive)
  }
  const parts =
    typeof m.content === "string" ? [{ text: m.content, type: "text" } as TextPart] : m.content
  for (const part of parts) {
    switch (part.type) {
      case "reasoning": {
        if (!filter.has("reasoning") || part.text.trim() === "") continue
        ret.push({
          render: (ctx) => ctx.style.quiet(`${icon(ctx, icons.reasoning)}${clean(part.text)}`),
          role: m.role,
          text: part.text,
        })
        break
      }

      case "text": {
        if (part.text.trim() === "") continue
        ret.push({
          render: (ctx) => {
            const s = roleStyles[m.role]
            const role = ctx.style.add(s.role)(`${m.role}:`)
            const text = ctx.style.add(s.text)(clean(part.text))
            return `${icon(ctx)}${role} ${text}`
          },
          role: m.role,
          text: part.text,
        })
        break
      }
      case "tool-call": {
        if (!filter.has("tools")) continue
        ret.push({
          render: (ctx) =>
            `${icon(ctx)}${ctx.style.syntaxConstant(part.name)}: ${ctx.style.muted(toolParams(part.params, { ...ctx, quote: false }))}`,
          role: m.role,
          text: `tool ${part.name} ${typeof part.params === "string" ? part.params : JSON.stringify(part.params)}`,
        })
        break
      }
      case "error":
      case "audio":
      case "image":
      case "video":
      case "pdf":
      case "tool-result":
      case "meta": {
        break
      }
      default: {
        assertExhaustive(part)
      }
    }
  }
  return ret
}

export async function sessionTree(app: App, opts: SessionTreeOpts = {}) {
  const filter = new Set<SessionTreeFilter>(opts.filter ?? ["reasoning", "tools", "assistant"])
  const session = app.agent.session

  type Node = TreeItem<
    Option & { node?: SessionNode; root?: boolean } & {
      render?: (ctx: RenderCtx) => string
      active?: boolean
    } & ({ root: boolean } | { node: SessionNode })
  >
  const root: Node = { root: true, text: "root" }
  const sessionNodes = new Map<string, SessionNode>()
  const now = performance.now()
  const all = await Array.fromAsync(session.nodes())
  for (const node of all.toReversed()) sessionNodes.set(node.uuid, node)
  const diff = performance.now() - now
  app.notify(`Loaded ${sessionNodes.size} session nodes in ${diff.toFixed(2)}ms`)

  const sessionHead = session.messages.at(-1)?.id ?? session.head

  const active = new Set<string>()
  for (let node = session.head ? sessionNodes.get(session.head) : undefined; node; ) {
    active.add(node.uuid)
    node = node.parentUuid ? sessionNodes.get(node.parentUuid) : undefined
  }

  const children = new Map<string | undefined, SessionNode[]>()
  for (const node of sessionNodes.values()) {
    const parent =
      node.parentUuid && sessionNodes.has(node.parentUuid) ? node.parentUuid : undefined
    const list = children.get(parent) ?? []
    list.push(node)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort((a, b) => a.ts - b.ts)

  const parts = (node: SessionNode): Node[] => {
    const isActive = active.has(node.uuid)
    const expanded =
      node.type === "message"
        ? expand(node.message, filter, {
            active: isActive,
            head: sessionHead === node.uuid,
          })
        : []
    if (expanded.length === 0 && filter.has("fallback"))
      expanded.push({
        render: (ctx: RenderCtx) => ctx.style.add("quiet")(`[${node.type}]`),
        role: "system" as const,
        text: `[${node.type}]`,
      })
    return expanded.map((m) => ({
      active: isActive,
      node,
      render: m.render,
      text: m.text,
    }))
  }

  type BuiltChain = { anchor?: Node; rows: Node[] }

  const buildChain = (start: SessionNode): BuiltChain => {
    const rows: Node[] = []
    let anchor: Node | undefined
    let node = start

    for (;;) {
      const visible = parts(node)
      if (visible.length > 0) {
        rows.push(...visible)
        anchor = visible.at(-1)
      }

      const next: SessionNode[] = children.get(node.uuid) ?? []
      if (next.length === 0) return { anchor, rows }
      if (next.length === 1) {
        node = next[0]
        continue
      }

      // next.sort((a, b) => Number(active.has(b.uuid)) - Number(active.has(a.uuid)) || a.ts - b.ts)
      next.sort((a, b) => a.ts - b.ts)
      const branches = next.map(buildChain).filter((branch) => branch.rows.length > 0)
      if (branches.length === 0) return { anchor, rows }

      // Raw marker/settings nodes may have multiple children, while the
      // current display options leave only one visible continuation. Treat
      // that as a linear chain instead of creating a one-child subtree.
      if (branches.length === 1) {
        const [branch] = branches
        rows.push(...branch.rows)
        anchor = branch.anchor ?? anchor
        return { anchor, rows }
      }

      const branchHeads = branches.map((branch) => {
        const [head, ...rest] = branch.rows
        if (rest.length > 0) {
          head.children ??= []
          head.children.push(...rest)
        }
        return head
      })
      if (anchor) {
        anchor.children ??= []
        anchor.children.push(...branchHeads)
      } else {
        rows.push(...branchHeads)
        anchor = branchHeads.at(-1)
      }
      return { anchor, rows }
    }
  }

  root.children = (children.get(undefined) ?? []).flatMap((node) => buildChain(node).rows)

  const node = await app.pick({
    active: (item) => item.node?.uuid === sessionHead,
    fuzzy: false,
    maxHeight: app.$.ui.treeHeight,
    render: (item, ctx) => {
      const s = ctx.style
      if (item.root) return s.accent("Session Root")
      if (!item.render) return s.dim(item.text)
      return item.render(ctx)
    },
    title: "Session Tree",
    tree: root,
  })

  if (!node?.node) return
  await session.checkout(node.node.uuid)
  const { replay } = await import("./replay.ts")
  app.renderer.stream.reset()
  await Promise.all([replay(session, app), app.agent.ctx.useSession(session)])
}

function usageStats(usage: Usage): Record<string, number> {
  // oxlint-disable-next-line sort-keys
  return {
    input: usage.input,
    output: usage.output,
    "cache read": usage.cacheRead ?? 0,
    "cache write": usage.cacheWrite ?? 0,
    reasoning: usage.reasoning ?? 0,
    total: usage.input + usage.output + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0),
  }
}

export async function sessionInfo(app: App) {
  const session = app.agent.session
  const info: string[] = ["## Current session"]

  const path = session.path ?? session.dir
  info.push(`- **path:** \`${prettyPath(path, "~")}\``)

  info.push("### Messages")
  const stats = new Map<string, number>()
  for (const m of session.messages) {
    stats.set(m.role, (stats.get(m.role) ?? 0) + 1)
  }
  for (const [role, count] of stats.entries()) {
    info.push(`- **${role}:** \`${count}\``)
  }
  info.push(`- **total:** \`${session.messages.length}\``)

  info.push(`> [!TIP]
> Use \`/tree\` to view the session tree`)

  info.push("### Token Usage")
  const cols = [
    usageStats(app.agent.usage),
    usageStats(app.agent.usage.total),
    usageStats(app.agent.usage.cost),
  ]
  info.push("| | Context | Session | Est. Cost |")
  info.push("| - | -: | -: | -: |")
  for (const [key, last] of Object.entries(cols[0])) {
    if (cols.every((c) => !c[key])) continue
    const total = cols[1][key]
    const cost = cols[2][key]
    const l = last ? `\`${formatNumber(last, { notation: "compact" })}\`` : "-"
    const t = total ? `\`${formatNumber(total, { notation: "compact" })}\`` : "-"
    const c = cost
      ? `\`$${formatNumber(cost, { minimumFractionDigits: 1, notation: "standard" })}\``
      : "-"
    info.push(`| **${key}** | ${l} | ${t} | ${c} |`)
  }

  info.push(`> [!TIP]`)
  info.push(
    `> Use \`/context\` to view a detailed breakdown of token usage, including prompts, messages, and tools.`
  )
  info.push("")

  info.push("> [!NOTE]")
  info.push(
    "> Cost is estimated from model catalog pricing and may not reflect subscriptions or provider discounts."
  )

  info.push("### Details")

  info.push(`- **id:** \`${session.id}\``)
  for (const [key, value] of Object.entries(session.settings)) {
    if (key === "sessionId") continue
    const v =
      typeof value === "string" && ["cwd", "workspace"].includes(key)
        ? prettyPath(value, "~")
        : value
    info.push(`- **${key}:** \`${v}\``)
  }

  app.ctx.info(`${info.join("\n")}\n`)
}
