import type { ResourceScope } from "../utils/resource.ts"
import type { PromptCtx } from "./index.ts"

import { safeReadFile } from "@zaly/shared"
import { findResource } from "../utils/resource.ts"

export type MarkdownPromptOptions = {
  name: string
  scopes: ResourceScope[]
  merge?: boolean
}

export function createMarkdownPrompt(opts: MarkdownPromptOptions) {
  return (ctx: PromptCtx) => markdownPrompt(ctx, opts)
}

export async function markdownPrompt(ctx: PromptCtx, opts: MarkdownPromptOptions): Promise<string> {
  let resources = findResource({
    cwd: ctx.cwd,
    rel: opts.name,
    scopes: opts.scopes,
  })
  if (resources.length === 0) return ""
  if (!(opts.merge ?? true)) resources = [resources[resources.length - 1]]

  const contents = await Promise.all(resources.map((r) => safeReadFile(r.path)))
  const ret: string[] = []
  for (let i = 0; i < resources.length; i++) {
    const content = contents[i]
    if (!content) continue
    const r = resources[i]
    ret.push(`## ${opts.name} [${r.scope}] (${r.path})\n\n${content.trim()}`)
  }
  return ret.join("\n\n")
}

export async function agentsMdPrompt(ctx: PromptCtx) {
  return markdownPrompt(ctx, { name: "AGENTS.md", scopes: ["user", "project"] })
}

export async function memoryMdPrompt(ctx: PromptCtx) {
  return markdownPrompt(ctx, { name: "MEMORY.md", scopes: ["user", "agent"] })
}
