import type { AnyPart, Message, Role } from "@zaly/ai"
import type { Agent } from "./agent.ts"
import type { MsgPart } from "./context/scoring.ts"
import type { ContextPressure } from "./types.ts"

import { ContextScoring } from "./context/scoring.ts"
import { estimatePart, tokenStats } from "./context/tokens.ts"

/** Top-level masking config. */
export type MaskOptions = {
  /** Don't mask tool-result parts whose original content is shorter
   *  than this (estimated tokens). Skips tiny "ok"-style success
   *  messages where the stub would be larger than the original.
   *  Doesn't apply to attachments (always worth masking). */
  minTokens?: number
  /** How many turns to keep in the tail of the conversation, regardless
   *  of score. Defaults to 20. */
  keepTurns?: number
  /** How far above the target ratio to trigger a new masking pass.
   *  Defaults to 0.25 (25%). */
  delta?: number
  /** Target ratio of used/limit tokens to reach by masking. Defaults to 0.5 (50%). */
  target?: number
}

const defaults = {
  delta: 0.25,
  keepTurns: 20,
  minTokens: 50,
  target: 0.5,
}

/** In-place mask projection for the request stream.
 *
 *  The masker replaces low-value parts with stable stubs to keep the
 *  projected request within budget. A scoring pass ranks maskable parts
 *  by recency, repeated-use shadowing, and per-policy weights; the budget
 *  pass masks from lowest score upward until the target is reached or no
 *  useful candidates remain.
 *
 *  Masking intentionally happens rarely because it changes historical
 *  bytes and busts prefix cache. The first pass after startup/session
 *  reset always rebuilds the projection. Later passes use a hysteresis
 *  threshold: mask toward `target`, then trigger again at roughly
 *  `actual + delta`. If the target cannot be reached, the next threshold
 *  rises automatically to avoid repeated no-op cache busts.
 */
export class Masker {
  readonly #opts: Required<MaskOptions>
  #stats = new Map<Role, Record<string, number>>()
  #masked = new Map<string, Map<number, AnyPart>>()
  #threshold?: number

  constructor(opts: MaskOptions = {}) {
    this.#opts = { ...defaults, ...opts }
  }

  reset(): void {
    this.#masked.clear()
    this.#stats.clear()
    this.#threshold = undefined
  }

  get stats(): Map<Role, Record<string, number>> {
    return this.#stats
  }

  /** Number of messages with at least one masked part. */
  get masked(): number {
    return this.#masked.size
  }

  isMasked(msgId: string, partIdx?: number): boolean {
    const parts = this.#masked.get(msgId)
    if (parts === undefined) return false
    return partIdx === undefined ? parts.size > 0 : parts.has(partIdx)
  }

  attach(agent: Agent) {
    agent.on("context", (ctx, a) => (ctx.messages = this.mask(ctx.messages, a.pressure)))
    agent.ctx.on("session", () => this.reset())
  }

  /** Apply masks and return the projected message array.
   *
   *  Always rebuild once after startup/session reset: `pressure.ratio`
   *  may describe a previously masked projection, while this instance has
   *  no mask decisions yet. After that, rebuild only when projected
   *  pressure crosses the hysteresis threshold. */
  mask(messages: readonly Message[], pressure: ContextPressure): Message[] {
    // Always rebuild once after startup/session reset: pressure.ratio may
    // describe a previously masked projection, while #masked is empty here.
    if (this.#threshold === undefined || pressure.ratio >= this.#threshold) {
      this.#update(messages, pressure)
    }
    return this.#mask(messages)
  }

  #stat(role: Role, key: string, n = 1): void {
    const r = this.#stats.get(role) ?? {}
    r[key] = (r[key] ?? 0) + n
    this.#stats.set(role, r)
  }

  /** Recompute mask decisions for the current message history. */
  #update(messages: readonly Message[], pressure: ContextPressure): void {
    this.#masked.clear()
    this.#stats.clear()
    this.#threshold ??= this.#opts.target + this.#opts.delta
    const usage = tokenStats(messages)
    // `pressure.ratio` is based on the current projected/masked request,
    // not the raw session. Raw history may exceed model context; masking
    // only needs to keep the projected request in a safe band.
    const targetRatio = Math.max(this.#opts.target, this.#threshold - this.#opts.delta)
    const target = pressure.limit * targetRatio

    // Return when already under target.
    if (usage.tokens <= target) return

    let mask = usage.tokens - target

    if (mask === 0) return

    const scorer = new ContextScoring()
    const scores = scorer.score(messages)
    const parts: (MsgPart & { mask: () => AnyPart })[] = []
    for (const s of scores) {
      for (const p of s.parts) {
        parts.push({
          ...p,
          mask: () => s.policy.mask(p, s),
        })
      }
    }
    parts.sort((a, b) => a.score - b.score)

    let masked = 0
    for (const p of parts) {
      if (mask <= 0) break
      const id = p.message.id
      if (!id) continue

      if (p.turn <= this.#opts.keepTurns) continue

      const tokens = estimatePart(p.part).tokens
      if (tokens < this.#opts.minTokens) continue

      const part = p.mask()
      if (part === p.part) continue

      const msgParts = this.#masked.get(id) ?? new Map()
      msgParts.set(p.$p, part)
      this.#stat(
        p.message.role,
        `${p.part.type}${p.part.type === "tool-result" || p.part.type === "tool-call" ? `:${p.part.name}` : ""}`
      )
      this.#masked.set(id, msgParts)
      const delta = tokens - estimatePart(part).tokens
      masked += delta
      mask -= delta
    }

    this.#threshold = Math.max(
      (usage.tokens - masked) / pressure.limit + this.#opts.delta,
      this.#opts.target + this.#opts.delta
    )
  }

  /** Render the current projection using the last computed mask decisions. */
  #mask(messages: readonly Message[]): Message[] {
    return messages.map((m) => {
      if (m.id === undefined || typeof m.content === "string") return m
      const masked = m.id ? this.#masked.get(m.id) : undefined
      return masked && masked.size > 0
        ? ({
            ...m,
            content: m.content.map((p, i) => masked.get(i) ?? p),
          } as Message)
        : m
    })
  }
}
