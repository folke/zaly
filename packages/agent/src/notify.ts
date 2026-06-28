import type { Agent } from "./agent.ts"

import { formatDuration } from "@zaly/shared"

export type NotifyContext = {
  agent: Agent
}

export type NotifyOptions = {
  idle?: number // seconds of idle time (1800 = 30m)
  periodic?: number // seconds of periodic time notifications (3600 = 1h)
}

export class Notifier {
  #opts: Required<NotifyOptions>
  #lastTime?: number
  #lastStep?: number
  /** Highest pressure threshold (from `#pressureLevels`) we've already
   *  notified for in this session. Reset to 0 when pressure drops back
   *  below the lowest threshold (e.g. after compaction), so a later
   *  refill can fire the same level again. */
  #pressureLevel = 0
  #ac?: AbortController

  constructor(opts: NotifyOptions = {}) {
    this.#opts = { idle: 30 * 60, periodic: 60 * 60, ...opts }
  }

  attach(agent: Agent) {
    agent.on("step-start", () => this.check(agent))
    agent.ctx.on("session", () => this.attachSession(agent))
    this.attachSession(agent)
  }

  attachSession(agent: Agent) {
    this.#ac?.abort()
    this.#ac = new AbortController()
    const opts = { signal: this.#ac.signal }
    agent.session
      .on(
        "compact",
        ({ node }) => {
          this.#pressureLevel = 0
          agent.notify("compacted", {
            ...this.time(),
            messages_preserved: node.tail,
            trigger: node.trigger,
          })
        },
        opts
      )
      .on(
        "session-resume",
        () => {
          agent.notify("session-resume", this.time())
        },
        opts
      )
      .on(
        "session-start",
        () => {
          agent.notify("session-start", this.time())
        },
        opts
      )
      .on(
        "cwd",
        ({ cwd }) => {
          agent.notify("cwd-changed", { cwd })
        },
        opts
      )
      .on(
        "model",
        ({ model, prev }) => {
          agent.notify("model-changed", { current: model, prev })
        },
        opts
      )
  }

  time(now = Date.now()) {
    this.#lastTime = now
    return timeInfo(now)
  }

  check(agent: Agent) {
    const now = Date.now()
    const lastInfo = this.#lastTime ? timeInfo(this.#lastTime) : undefined

    this.#lastStep ??= now
    this.#lastTime ??= now

    if (lastInfo && timeInfo(now).date !== lastInfo.date) {
      agent.notify("new-day", this.time(now))
    } else if (now - this.#lastStep > this.#opts.idle * 1000) {
      agent.notify("user-returned", {
        idle: formatDuration(this.#lastStep, { to: now }),
        ...this.time(now),
      })
    } else if (now - this.#lastTime > this.#opts.periodic * 1000) {
      agent.notify("time", this.time(now))
    }
    this.#lastStep = now

    // Context-window pressure — denominator is `limit.context` (full
    // window), NOT `maxTokens` (per-request output cap). Notification
    // fires once per discrete level crossing (75% / 85% / 95%) so the
    // model gets at most a few escalating signals per session, not one
    // per step. Resets if pressure drops below the lowest level (e.g.
    // after compaction) so the cycle can fire again later.
    const pressure = agent.pressure
    if (pressure.level > this.#pressureLevel) {
      agent.notify("context-pressure", {
        limit: pressure.limit,
        pct: Math.round(pressure.ratio * 100),
        used: pressure.used,
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
