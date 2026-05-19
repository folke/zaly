import type { Session } from "@zaly/agent/session"
import type { Flags } from "../config.ts"

import { loadSession as $loadSession, resumeSession } from "@zaly/agent/session"
import { normPath, safeStatAsync } from "@zaly/shared"

export async function loadSession(flags: Flags): Promise<Session> {
  const filter = flags.session ?? normPath()

  if (flags.new) return await $loadSession()

  const s = flags.session ? await safeStatAsync(flags.session) : undefined

  if (s?.isFile()) {
    const path = flags.session!

    if (isClaudePath(path)) {
      const { loadClaudeSession } = await import("@zaly/agent/session/claude")
      const loaded = await loadClaudeSession(path)
      const session = await $loadSession()
      // oxlint-disable-next-line no-await-in-loop
      for (const m of loaded.messages) await session.add(m)
      return session
    }

    return await $loadSession({ path })
  }

  const session = await resumeSession(filter)
  console.log(session?.messages.length, session?.path)

  if (!session && flags.session) throw new Error(`No session found for \`${flags.session}\``)

  return session ?? (await $loadSession())
}

function isClaudePath(p: string): boolean {
  // `~/.claude/projects/<encoded>/<id>.jsonl` is Claude Code's layout.
  return /(?:^|\/)\.claude\/projects\//.test(p)
}
