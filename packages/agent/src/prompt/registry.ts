import type { Model } from "@zaly/ai"

import { BaseCollection } from "@zaly/shared/collection"
import { createRegistry } from "@zaly/shared/registry"

export interface PromptCtx {
  model: Model
  cwd: string
}

export type PromptLoader = (ctx: PromptCtx) => Promise<string>
export type Prompt = {
  name: string
  text: string | PromptLoader
}
export type { PromptCollection }

const builtin = {
  "AGENTS.md": (ctx) => import("./markdown.ts").then((m) => m.agentsMdPrompt(ctx)),
  "MEMORY.md": (ctx) => import("./markdown.ts").then((m) => m.memoryMdPrompt(ctx)),
  agent: () => import("./agent.ts").then((m) => m.agentPrompt),
  env: (ctx) => import("./env.ts").then((m) => m.prompt(ctx)),
  model: (ctx) => import("./model.ts").then((m) => m.prompt(ctx)),
} as const satisfies Record<string, PromptLoader>

export type BuiltinPrompt = keyof typeof builtin
export type AnyPrompt = BuiltinPrompt | (string & {})

export const promptRegistry = createRegistry<PromptLoader>("prompt").from(builtin)

class PromptCollection extends BaseCollection<AnyPrompt[], Prompt[], Prompt> {
  list(): Prompt[] {
    const ret = new Map<string, Prompt>()
    for (const k of promptRegistry.keys())
      ret.set(k, {
        name: k,
        text: (ctx) => promptRegistry.load(k, ctx),
      })
    for (const r of this.registered) ret.set(r.name, r)
    return [...ret.values()]
  }

  async render(ctx: PromptCtx & { prompts?: string[] }): Promise<string[]> {
    const all = new Map(this.list().map((p) => [p.name, p]))
    const ret = await Promise.all(
      (ctx.prompts ?? this.active).map(async (p) => {
        const def = all.get(p)
        if (!def) throw new Error(`Unknown prompt: ${p}`)
        return typeof def.text === "string" ? def.text : def.text(ctx)
      })
    )
    return ret.map((p) => p.trim()).filter((p) => p.length > 0)
  }
}

export async function promptCollection(): Promise<PromptCollection> {
  return new PromptCollection(["agent", "env", "model", "AGENTS.md", "MEMORY.md"])
}
