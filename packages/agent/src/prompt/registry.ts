import type { Model } from "@zaly/ai"

import { createRegistry } from "@zaly/shared/registry"

export interface PromptCtx {
  model: Model
  cwd: string
}

export type PromptLoader = (ctx: PromptCtx) => Promise<string>

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
