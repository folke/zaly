import type { PromptCtx } from "./registry.ts"

import { findUp, normPath, safeReadFile, safeStat } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { join } from "pathe"

export type MarkdownPromptOptions = {
  name: string
  project?: string[]
  dotUser?: string[] // dotZaly or dotAgents
}

export function createMarkdownPrompt(opts: MarkdownPromptOptions) {
  return (ctx: PromptCtx) => markdownPrompt(ctx, opts)
}

export async function markdownPrompt(ctx: PromptCtx, opts: MarkdownPromptOptions): Promise<string> {
  const resources: string[] = []
  const project = zalyPaths.project(ctx.cwd)

  if (opts.dotUser) {
    const checks = opts.dotUser.flatMap((name) => [
      join(zalyPaths.config, name),
      `~/.agents/${name}`,
    ])
    for (const check of checks) {
      const file = normPath(check)
      if (safeStat(file)?.isFile()) {
        resources.push(file)
        break
      }
    }
  }

  if (opts.project) {
    const file = findUp(ctx.cwd, opts.project, { stop: project.stop, type: "file" })
    if (file) resources.push(file)
  }

  if (resources.length === 0) return ""

  const contents = await Promise.all(resources.map((r) => safeReadFile(r)))
  const ret: string[] = []
  for (let i = 0; i < resources.length; i++) {
    const content = contents[i]
    if (!content) continue
    const r = resources[i]
    ret.push(`## ${opts.name} (${r})\n\n${content.trim()}`)
  }
  return ret.join("\n\n")
}

export async function agentsMdPrompt(ctx: PromptCtx) {
  return markdownPrompt(ctx, {
    dotUser: ["AGENTS.md"],
    name: "AGENTS.md",
    project: ["AGENTS.md", "CLAUDE.md"],
  })
}

export async function memoryMdPrompt(ctx: PromptCtx) {
  return markdownPrompt(ctx, {
    dotUser: ["MEMORY.md"],
    name: "MEMORY.md",
    project: [".agents/MEMORY.md"],
  })
}
