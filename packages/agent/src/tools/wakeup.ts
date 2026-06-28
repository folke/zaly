import type { Agent } from "../agent.ts"

import { defineTool, AiError } from "@zaly/ai"
import { Type } from "typebox"

/**
 * Schedule a future wake-up of the agent loop.
 *
 * Behavior:
 *  - If `delayMs` elapses without anything else waking the loop, the
 *    agent receives a system message containing the wakeup id and the
 *    optional `hint`. The loop ticks; the model decides what to do next.
 *  - If task completion / heartbeat / user message wakes the loop first,
 *    the wakeup is auto-cancelled. Any cancelled wakeups carry their
 *    `hint`s forward as a system message tagged `status="cancelled"` so
 *    the model still sees what it scheduled — the timing context is just
 *    explicit ("I scheduled this; it didn't fire on its own").
 *
 * Use cases:
 *  - Watch an external (non-task) process: "wake me in 60s to re-fetch
 *    the build status URL."
 *  - Poll-style fallback for long-running tasks the model cares about
 *    finishing: "wake me in 30s in case the build hasn't completed yet."
 *  - "Take a moment" patterns: "wake me in 5min to reflect on whether
 *    this approach is right."
 *
 * No companion `wakeup_cancel` tool exists — by the time the model has
 * a turn to call cancel, the wakeup has either fired or been auto-
 * cancelled for it. The only useful state transition is "fire," and that
 * the harness handles automatically.
 */
export interface WakeupContext {
  /** The agent that scheduled the wakeup — provided via ToolContext
   *  augmentation so the tool can call `scheduleWakeup` without a
   *  cross-package dep on `Agent`. */
  agent?: Agent
}

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const wakeupTool = defineTool({
  name: "wakeup",
  desc:
    "Schedule a one-shot wake-up of the agent loop. If `delayMs` elapses " +
    "without anything else waking the loop (task completion, heartbeat, " +
    "user message), you'll receive a system message with the optional " +
    "`hint`. If something else wakes the loop first, the wakeup is " +
    'cancelled — its hint still surfaces (with `status="cancelled"`) so ' +
    "your reminder doesn't evaporate. Useful for polling external state " +
    "or scheduling a return to a thought.",
  parallel: true,
  params: Type.Object({
    delayMs: Type.Integer({
      description: "How long to wait before waking up, in milliseconds. Minimum 1.",
      minimum: 1,
    }),
    hint: Type.Optional(
      Type.String({
        description:
          "Short text the wakeup carries — what you wanted to remember " +
          "to do at this point. Surfaces in the system message whether " +
          "the wakeup fires on its own timer or gets cancelled by another " +
          "event. Keep it concise; treat it as a TODO line, not prose.",
      })
    ),
  }),

  call(args, ctx) {
    if (!ctx.agent) {
      throw new AiError({
        code: "MISSING_TOOL_CONTEXT",
        message: "wakeup requires an Agent reference on the context (set up by the agent harness).",
      })
    }
    const id = ctx.agent.scheduleWakeup({ delayMs: args.delayMs, hint: args.hint })
    const when = new Date(Date.now() + args.delayMs).toISOString()
    return `wakeup ${id} scheduled for ${when}`
  },
})
