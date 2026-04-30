import type { Agent } from "./agent.ts"

export type NotifyContext = {
  agent: Agent
}

export type NotifyOptions = {
  idle?: number // seconds of idle time (1800 = 30m)
  periodic?: number // seconds of periodic time notifications (3600 = 1h)
}

export class Notifier {
  #opts: Required<NotifyOptions>
  #modelId?: string
  #lastStep?: number
  #lastTime?: number
  /** Highest pressure threshold (from `#pressureLevels`) we've already
   *  notified for in this session. Reset to 0 when pressure drops back
   *  below the lowest threshold (e.g. after compaction), so a later
   *  refill can fire the same level again. */
  #lastPressureLevel = 0
  /** Discrete pressure levels at which to fire `context-pressure`. The
   *  notification fires once per crossing — at most this many times per
   *  session — instead of on every step. Order matters; iteration looks
   *  for the highest level the current ratio meets. */
  readonly #pressureLevels = [0.75, 0.85, 0.95] as const

  constructor(opts: NotifyOptions = {}) {
    this.#opts = { idle: 30 * 60, periodic: 60 * 60, ...opts }
  }

  check(ctx: NotifyContext) {
    const { agent } = ctx
    const now = Date.now()
    const nowInfo = timeInfo(now)
    const lastInfo = this.#lastStep ? timeInfo(this.#lastStep) : undefined

    let notified = true
    if (!this.#lastStep) {
      agent.notify({
        data: nowInfo,
        tag: agent.messages.length > 0 ? "session-resumed" : "session-started",
      })
    } else if (lastInfo && nowInfo.date !== lastInfo.date) {
      agent.notify({ data: nowInfo, tag: "new-day" })
    } else if (now - this.#lastStep > this.#opts.idle * 1000) {
      agent.notify({ data: { idle: since(this.#lastStep, now), ...nowInfo }, tag: "user-returned" })
    } else if (now - (this.#lastTime ?? now) > this.#opts.periodic * 1000) {
      agent.notify({ data: nowInfo, tag: "time" })
    } else {
      notified = false
    }
    if (notified) this.#lastTime = now

    this.#lastStep = now

    this.#modelId ??= agent.session.modelId ?? agent.model.id
    const [current, previous] = [agent.model.id, this.#modelId]
    if (current !== previous) {
      this.#modelId = current
      agent.notify({
        data: { current, previous },
        tag: "model-changed",
      })
    }

    // Context-window pressure — denominator is `limit.context` (full
    // window), NOT `maxTokens` (per-request output cap). Notification
    // fires once per discrete level crossing (75% / 85% / 95%) so the
    // model gets at most a few escalating signals per session, not one
    // per step. Resets if pressure drops below the lowest level (e.g.
    // after compaction) so the cycle can fire again later.
    const used = agent.contextSize
    const limit = agent.model.spec.limit.context
    const ratio = used / limit
    const level = this.#pressureLevels.findLast((t) => ratio >= t) ?? 0
    if (level > this.#lastPressureLevel) {
      agent.notify({
        data: { limit, pct: Math.round(ratio * 100), used },
        tag: "context-pressure",
      })
      this.#lastPressureLevel = level
    } else if (ratio < this.#pressureLevels[0]) {
      this.#lastPressureLevel = 0
    }
  }
}

export function timeInfo(t = Date.now()): {
  day: string
  date: string
  time: string
  tz: string
} {
  const now = new Date(t)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return {
    date: now.toLocaleDateString("sv-SE", { timeZone: tz }),
    day: now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" }),
    time: now.toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }),
    tz,
  }
}

export function since(from: number, to = Date.now()): string {
  const ms = to - from
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`
}
