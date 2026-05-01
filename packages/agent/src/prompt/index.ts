import type { Model } from "@zaly/ai"

import { createRegistry } from "@zaly/shared"

export interface PromptCtx {
  model: Model
  cwd: string
}

const builtin = {
  agent: () => import("./agent.ts").then((m) => m.agentPrompt),
  env: (ctx) => import("./env.ts").then((m) => m.prompt(ctx)),
  model: (ctx) => import("./model.ts").then((m) => m.prompt(ctx)),
  "AGENTS.md": (ctx) => import("./markdown.ts").then((m) => m.agentsMdPrompt(ctx)),
  "MEMORY.md": (ctx) => import("./markdown.ts").then((m) => m.memoryMdPrompt(ctx)),
} as const satisfies Record<string, (ctx: PromptCtx) => Promise<string>>

export type BuiltinPrompt = keyof typeof builtin
export type AnyPrompt = BuiltinPrompt | (string & {})

export const promptRegistry = createRegistry<Promise<string>, PromptCtx>("prompt").from(builtin)
