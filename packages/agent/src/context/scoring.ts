// ── Frecency tuning ───────────────────────────────────────────────────
// Half-life measured in user turns, not wall time — what matters for
// compaction context is what's been hot in the agent's *recent
// experience*, regardless of how long the user spent between turns.
// 60 turns is a middle ground: actively-iterated work stays at the top
// while recurring workflow patterns (git stash, test-runner flags) still
// clear the minScore filter instead of getting buried under one-shot

import type {
  AnyPart,
  Message,
  MetaPart,
  ParamsOf,
  Role,
  SafeParamsOf,
  Tool,
  ToolCallPart,
  ToolResultPart,
} from "@zaly/ai"
import type { BashTool } from "../tools/bash.ts"
import type { EditTool, EditToolMeta } from "../tools/edit.ts"
import type { ReadTool, ReadToolMeta } from "../tools/read.ts"
import type { AnyTool } from "../tools/registry.ts"
import type { WriteTool, WriteToolMeta } from "../tools/write.ts"

import { isAttachment, safeParseToolParams } from "@zaly/ai"
import { safeStringify } from "@zaly/shared"

const DEFAULT_HALF_LIFE = 40
const DEFAULT_WEIGHT = 1
const DEFAULT_GAMMA = 0.5

const maskedMeta = (result = "result", action = "call"): MetaPart => ({
  content: `Masked ${result}. Re-${action} to refresh`,
  tag: "masked",
  type: "meta",
})

export type MsgPart<R extends Role = Role, P extends AnyPart = AnyPart> = {
  message: Message<R>
  part: P
  score: number
  turn: number
  $m: number
  $p: number
}

export type MaskGroup<P extends MsgPart = MsgPart> = {
  id: string
  key: string
  policy: MaskPolicy<P, MaskGroup<P>>
  parts: P[]
}

export type MaskRule<P extends MsgPart = MsgPart, G extends MaskGroup<P> = MaskGroup<P>> = {
  filter?: (part: MsgPart) => boolean
  id?: (part: P) => string | undefined
  update?: (group: G, part: P) => void
  gamma?: number | ((group: G) => number | undefined)
  halfLife?: number | ((group: G) => number | undefined)
  key?: "id" | ((group: G) => string | undefined)
  weight?: number | ((group: G) => number | undefined)
  mask: (part: P, group: G) => AnyPart
}

export type ToolPart<T extends Tool = Tool, M extends object = object> = MsgPart<
  "assistant" | "tool" | "system",
  ToolCallPart<T["name"], ParamsOf<T>> | ToolResultPart<T["name"], M>
>

export type ToolGroup<T extends Tool = Tool, M extends object = object> = MaskGroup<
  ToolPart<T, M>
> & {
  name: T["name"]
  params: SafeParamsOf<T>
  call?: ToolCallPart<T["name"], ParamsOf<T>>
  result?: ToolResultPart<T["name"], M>
}

export type ToolRule<T extends Tool = Tool, M extends object = object> =
  | MaskRule<ToolPart<T, M>, ToolGroup<T, M>>
  | {
      key?: "name" | "params" | "id" | ((tool: ToolGroup<T, M>) => string | undefined)
    }

class MaskPolicy<
  P extends MsgPart = MsgPart,
  G extends MaskGroup<P> = MaskGroup<P>,
> implements Required<MaskRule<P, G>> {
  #rule: MaskRule<P, G>

  constructor(rule: MaskRule<P, G>) {
    this.#rule = rule
  }

  update(group: G, part: P): void {
    group.parts.push(part)
    this.#rule.update?.(group, part)
  }

  mask(part: P, group: G): AnyPart {
    return this.#rule.mask(part, group)
  }

  filter(part: MsgPart): boolean {
    return this.#rule.filter?.(part) ?? true
  }

  id(part: P): string {
    return this.#rule.id?.(part) ?? `${part.$m}:${part.$p}`
  }

  halfLife(group: G): number {
    const halfLife = this.#rule.halfLife ?? DEFAULT_HALF_LIFE
    return typeof halfLife === "number" ? halfLife : (halfLife(group) ?? DEFAULT_HALF_LIFE)
  }

  lambda(group: G): number {
    return Math.LN2 / this.halfLife(group)
  }

  weight(group: G): number {
    const weight = this.#rule.weight ?? DEFAULT_WEIGHT
    return typeof weight === "number" ? weight : (weight(group) ?? DEFAULT_WEIGHT)
  }

  gamma(group: G): number {
    const gamma = this.#rule.gamma ?? DEFAULT_GAMMA
    return typeof gamma === "number" ? gamma : (gamma(group) ?? DEFAULT_GAMMA)
  }

  key(group: G): string {
    const key = this.#rule.key ?? "id"
    if (key === "id") return group.id
    else if (typeof key === "function") return key(group) ?? group.id
    return group.id
  }
}

class ToolPolicy<T extends Tool = Tool, M extends object = object> extends MaskPolicy<
  ToolPart<T, M>,
  ToolGroup<T, M>
> {
  constructor(name: string, rule: ToolRule<T, M>) {
    super({
      filter: (part) =>
        (part.part.type === "tool-call" || part.part.type === "tool-result") &&
        (part.part.name === name || name === "*"),
      id: (part) => part.part.id,
      mask: (part, group) => {
        if (part.part.type === "tool-call")
          return {
            ...part.part,
            params: { masked: truncate(safeStringify(group.params), 100) },
          }
        return { ...part.part, content: [maskedMeta()] }
      },
      update: (group, part) => {
        group.name = name
        if (part.part.type === "tool-call") {
          group.call = part.part
          group.params = safeParseToolParams(part.part.params)
        }
        if (part.part.type === "tool-result") group.result = part.part
      },
      ...rule,
      key: (group) => {
        const key = rule.key ?? "params"
        if (key === "name") return group.name
        if (key === "params" && group.params !== undefined) return safeStringify(group.params)
        if (key === "id") return group.id
        if (typeof key === "function") return key(group)
        return group.id
      },
    })
  }
}

function truncate(text: string, len: number): string {
  return text.length <= len ? text : `${text.slice(0, len)}…`
}

const fileScore: ToolRule<
  ReadTool | WriteTool | EditTool,
  ReadToolMeta | WriteToolMeta | EditToolMeta
> = {
  gamma: (t) => {
    if (t.name === "write") return 0.45
    if (t.name === "edit") return 0.65
    if (t.result?.meta?.full) return 0.75
    return 0.95
  },
  halfLife: (t) => {
    if (t.name === "write") return 90
    if (t.name === "edit") return 75
    if (t.result?.meta?.full) return 60
    return 50 // partial read
  },
  key: (t) => `file:${t.result?.meta?.path ?? t.id}`,
  mask: (part) => {
    if (part.part.type === "tool-call")
      return {
        ...part.part,
        params: { masked: true, path: part.part.params.path },
      }
    return part.part.isError ? part.part : { ...part.part, content: [maskedMeta()] }
  },
  weight: (t) => {
    if (t.name === "write") return 1.25
    if (t.name === "edit") return 1.2
    if (t.result?.meta?.full) return 1.1
    return 1
  },
}

export type ContextScoringOptions = {
  tools?: Record<AnyTool | "*", ToolRule>
  parts?: MaskRule[]
}

const defaults: ContextScoringOptions = {
  parts: [
    {
      filter: (part) => isAttachment(part.part),
      mask: (part) => maskedMeta(part.part.type, "attach"),
    },
    {
      filter: (part) => part.message.role === "system" && part.message.meta?.kind === "task",
      halfLife: 25,
      mask: (part) => {
        if (part.part.type === "meta") return part.part
        return maskedMeta("task")
      },
    },
  ],
  // oxlint-disable-next-line sort-keys
  tools: {
    bash: {
      gamma: 0.35,
      halfLife: 25,
      key: (t: ToolGroup<BashTool>) => `bash:${t.params?.command?.replace(/\s+/g, " ") ?? t.id}`,
    },
    find: { gamma: 0.7, halfLife: 35 },
    grep: { gamma: 0.7, halfLife: 35 },
    search: { gamma: 0.5, halfLife: 40 },

    read: fileScore,
    edit: fileScore,
    write: fileScore,

    "*": { gamma: 0.5, halfLife: 40 },
  } as Record<AnyTool | "*", ToolRule>,
}

export class ContextScoring {
  #groups = new Map<string, MaskGroup>()
  #messages: readonly Message[] = []
  #policies: MaskPolicy[] = []

  constructor(opts: ContextScoringOptions = {}) {
    const tools = { ...defaults.tools, ...opts.tools }
    for (const [name, tool] of Object.entries(tools)) {
      this.#policies.push(new ToolPolicy(name, tool) as MaskPolicy)
    }
    for (const rule of [...(defaults.parts ?? []), ...(opts.parts ?? [])]) {
      this.#policies.push(new MaskPolicy(rule))
    }
  }

  #reset() {
    this.#groups.clear()
  }

  #index() {
    let turn = 0
    for (let $m = this.#messages.length - 1; $m >= 0; $m--) {
      const m = this.#messages[$m]
      if (m.role === "user") turn++

      if (!Array.isArray(m.content)) continue

      for (let $p = m.content.length - 1; $p >= 0; $p--) {
        const part: MsgPart = { $m, $p, message: m, part: m.content[$p], score: 0, turn }
        const policy = this.#policy(part)
        if (!policy) continue
        const id = policy.id(part)
        const group = this.#groups.get(id) ?? { id, key: "", parts: [], policy }
        policy.update(group, part)
        this.#groups.set(id, group)
      }
    }
  }

  #policy(part: MsgPart): MaskPolicy | undefined {
    return this.#policies.find((policy) => policy.filter(part))
  }

  score(messages: readonly Message[]): MaskGroup[] {
    this.#reset()
    this.#messages = messages
    this.#index()
    // tools sorted by recency
    const groups = [...this.#groups.values()]
    const gammas = new Map<string, number>()
    for (const group of groups) {
      const key = group.policy.key(group)
      group.key = key
      const weight = group.policy.weight(group)
      const shadow = gammas.get(key) ?? 1
      const lambda = group.policy.lambda(group)
      for (const part of group.parts) {
        const decay = Math.exp(-lambda * part.turn)
        part.score = decay * weight * shadow
      }
      gammas.set(key, shadow * group.policy.gamma(group))
    }
    return groups
  }
}
