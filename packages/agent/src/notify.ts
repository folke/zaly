import type { Agent } from "./agent.ts"

import { since } from "@zaly/shared"

export type NotifyContext = {
  agent: Agent
}

export type NotifyOptions = {
  idle?: number // seconds of idle time (1800 = 30m)
  periodic?: number // seconds of periodic time notifications (3600 = 1h)
}

export class Notifier {
  #opts: Required<NotifyOptions>
  #lastStep?: number
  #lastTime?: number
  /** Highest pressure threshold (from `#pressureLevels`) we've already
   *  notified for in this session. Reset to 0 when pressure drops back
   *  below the lowest threshold (e.g. after compaction), so a later
   *  refill can fire the same level again. */
  #pressureLevel = 0

  constructor(opts: NotifyOptions = {}) {
    this.#opts = { idle: 30 * 60, periodic: 60 * 60, ...opts }
  }

  attach(agent: Agent) {
    agent.session
      .on("compact", ({ node }) => {
        this.#pressureLevel = 0
        agent.notify({
          data: { ...this.time(), messages_preserved: node.tail, trigger: node.trigger },
          tag: "compacted",
        })
      })
      .on("session-resume", () => {
        agent.notify({ data: this.time(), tag: "session-resume" })
      })
      .on("session-start", () => {
        agent.notify({ data: this.time(), tag: "session-start" })
      })
      .on("cwd", ({ cwd }) => {
        agent.notify({ data: { cwd }, tag: "cwd-changed" })
      })
      .on("meta", ({ changes, prev }) => {
        if (changes.modelId === undefined) return
        agent.notify({
          data: { current: changes.modelId, previous: prev.modelId },
          tag: "model-changed",
        })
      })
  }

  time(now = Date.now()) {
    this.#lastStep = now
    return timeInfo(now)
  }

  check(ctx: NotifyContext) {
    const { agent } = ctx

    const now = Date.now()
    const lastInfo = this.#lastStep ? timeInfo(this.#lastStep) : undefined

    this.#lastStep ??= now
    if (lastInfo && timeInfo(now).date !== lastInfo.date) {
      agent.notify({ data: this.time(now), tag: "new-day" })
    } else if (now - this.#lastStep > this.#opts.idle * 1000) {
      agent.notify({
        data: { idle: since(this.#lastStep, now), ...this.time(now) },
        tag: "user-returned",
      })
    } else if (now - (this.#lastTime ?? now) > this.#opts.periodic * 1000) {
      agent.notify({ data: this.time(now), tag: "time" })
    }
    this.#lastTime = now

    // Context-window pressure — denominator is `limit.context` (full
    // window), NOT `maxTokens` (per-request output cap). Notification
    // fires once per discrete level crossing (75% / 85% / 95%) so the
    // model gets at most a few escalating signals per session, not one
    // per step. Resets if pressure drops below the lowest level (e.g.
    // after compaction) so the cycle can fire again later.
    const pressure = agent.pressure
    if (pressure.level > this.#pressureLevel) {
      agent.notify({
        data: { limit: pressure.limit, pct: Math.round(pressure.ratio * 100), used: pressure.used },
        tag: "context-pressure",
      })
      this.#pressureLevel = pressure.level
    } else if (pressure.level === 0) this.#pressureLevel = 0
  }
}

function timeInfo(t = Date.now()): {
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
