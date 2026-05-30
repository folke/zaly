import type { AgentContextEvents, AgentEvents, AgentStatus, AgentStop } from "@zaly/agent"
import type { Session } from "@zaly/agent/session"
import type { Message, Model, ReasoningEffort, TokenCount, Tool } from "@zaly/ai"
import type { EmitArgs, EventMap, EventOf, EventType, ListenerCtx } from "@zaly/shared"
import type { Plugin } from "../plugin.ts"
import type { PluginApi } from "./api.ts"

import { Emitter } from "@zaly/shared"

export type PluginEvents = {
  model: { model?: Model; prev?: Model }
  reasoning: { effort: ReasoningEffort; prev?: ReasoningEffort }
  session: { session: Session; prev?: Session }
  cwd: { cwd: string; prev?: string }
  "agent:status": { status: AgentStatus }
  "agent:start": {}
  "agent:turn-start": { turn: number }
  "agent:step-start": { step: number }
  "agent:context": { prompt: string[]; tools: Tool[]; messages: Message[] }
  "agent:step-end": { step: number; outcome: string }
  "agent:turn-end": { turn: number; outcome: string; reason?: string }
  "agent:stop": AgentStop & { usage: TokenCount; status: AgentStatus }
}

export type Events = Emitter<PluginEvents>
export type ApiEventType = keyof PluginEvents
export type AbortableEventType = keyof typeof abortable & ApiEventType

const abortable = {
  session: true,
} as const satisfies Partial<Record<ApiEventType, true>>

type AbortEvent = { abort: (reason?: unknown) => void; signal: AbortSignal }

export type ApiEvent<T extends ApiEventType = ApiEventType> = T extends ApiEventType
  ? { type: T } & PluginEvents[T] & (T extends AbortableEventType ? AbortEvent : {})
  : never

export type Listener<T extends ApiEventType> = (
  event: ApiEvent<T>,
  ctx: PluginApi
) => void | Promise<void>

type WrappedListener<T extends ApiEventType> = (
  data: EventOf<PluginEvents, T>,
  e: Events,
  ctx: ListenerCtx
) => void | Promise<void>

function canAbort(type: ApiEventType): type is AbortableEventType {
  return type in abortable
}

const ANY = Symbol("any")

export class EventsApi {
  #emitter: Events = new Emitter<PluginEvents>()
  #plugin: Plugin
  #wrapped = new Map<ApiEventType | typeof ANY, WeakMap<Listener<any>, WrappedListener<any>>>()

  constructor(plugin: Plugin) {
    this.#plugin = plugin
    this.#emitter.onEmitError = (error) => plugin.logger.error("Error in event litener:", error)
    this.#attach()
  }

  #attach() {
    const agent = this.#source<AgentEvents>(this.#plugin.ctx.agent)
    agent("status", "agent:status", (event) => event)
    agent("start", "agent:start", () => ({}))
    agent("step-start", "agent:step-start", (event) => event)
    agent("context", "agent:context", (event) => event)
    agent("step-end", "agent:step-end", (event) => event)
    agent("stop", "agent:stop", (event) => event)
    agent("turn-start", "agent:turn-start", (event) => event)
    agent("turn-end", "agent:turn-end", (event) => event)

    const ctx = this.#source<AgentContextEvents>(this.#plugin.ctx)
    ctx("model", "model", (event) => event)
    ctx("reasoning", "reasoning", (event) => event)
    ctx("session", "session", (event) => event)
    ctx("cwd", "cwd", (event) => event)
  }

  #source<Source extends EventMap>(emitter: Pick<Emitter<Source>, "on">) {
    return <S extends EventType<Source>, K extends ApiEventType>(
      source: S,
      target: K,
      fn: (event: EventOf<Source, S>) => PluginEvents[K]
    ) => {
      emitter.on(
        source,
        async (data, _, ctx) => {
          const event = fn(data)
          const args = (event ? [event] : []) as EmitArgs<PluginEvents[K]>
          const ok = await (ctx.serial
            ? this.#emitter.emitSerial(target, ...args)
            : this.#emitter.emit(target, ...args))

          if (!ok && canAbort(target)) ctx.abort()
        },
        { signal: this.#plugin.signal }
      )
    }
  }

  #wrap<K extends ApiEventType>(type: K | typeof ANY, fn: Listener<K>): WrappedListener<K> {
    const ret: WrappedListener<K> = (data, _, ctx) => {
      const event = {
        ...data,
        type: type === ANY ? data.type : type,
        ...(type !== ANY && canAbort(type)
          ? { abort: (reason?: unknown) => ctx.abort(reason), signal: ctx.signal }
          : {}),
      } as ApiEvent<K>
      return fn(event, this.#plugin.api)
    }
    let wrapped = this.#wrapped.get(type)
    if (!wrapped) this.#wrapped.set(type, (wrapped = new WeakMap()))
    wrapped.set(fn, ret)
    return ret
  }

  on<K extends ApiEventType>(type: K, fn: Listener<K>): this {
    this.#emitter.on(type, this.#wrap(type, fn), { signal: this.#plugin.signal })
    return this
  }

  onAny(fn: Listener<ApiEventType>): this {
    this.#emitter.onAny(this.#wrap(ANY, fn), { signal: this.#plugin.signal })
    return this
  }

  offAny(fn: Listener<ApiEventType>): this {
    const wrapped = this.#wrapped.get(ANY)?.get(fn)
    if (wrapped) this.#emitter.offAny(wrapped)
    return this
  }

  once<K extends ApiEventType>(type: K, fn: Listener<K>): this {
    this.#emitter.once(type, this.#wrap(type, fn), { signal: this.#plugin.signal })
    return this
  }

  off<K extends ApiEventType>(type: K, fn: Listener<K>): this {
    const wrapped = this.#wrapped.get(type)?.get(fn)
    if (wrapped) this.#emitter.off(type, wrapped)
    return this
  }
}
