import type { Session, SessionInfo } from "@zaly/agent/session"
import type { Option } from "@zaly/tui/widgets/select"
import type { Flags } from "../types.ts"
import type { App } from "./app.ts"

import { loadSession, resumeSession } from "@zaly/agent/session"
import { normPath, safeStatAsync } from "@zaly/shared"

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

type SessionItem = Option<SessionInfo>

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

  const items: SessionItem[] = sessions.map((info, s) => ({
    desc: `${formatRelativeTime(info.mtime ?? 0)}, ${formatSize(info.stat?.size ?? 0, 1)}`,
    name: messages[s] ? stringifyContent(messages[s].content) : "[new session]",
    value: info,
  }))
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
