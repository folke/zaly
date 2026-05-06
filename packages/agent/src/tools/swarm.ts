import type { MetaPart, TextPart } from "@zaly/ai"

import { defineTool, AiError } from "@zaly/ai"
import { Type } from "typebox"

/**
 * Swarm tools — `agent_spawn` and `agent_send`.
 *
 * Both require `ctx.agent` (the running agent, set by the harness)
 * and `ctx.swarm` (the swarm registry, set when the agent was
 * constructed with one). They throw `MISSING_TOOL_CONTEXT` cleanly
 * otherwise so the model sees a useful error rather than a silent
 * no-op.
 *
 * Lifecycle: `agent_spawn` returns immediately with a small ack — no
 * streamable, no grace race. The spawned subagent runs in the
 * background; its outward messages flow back to the parent through
 * the swarm's auto-forward (a `<agent>` system message lands in the
 * parent's queue at each natural step-end). The orchestrator decides
 * what to do next when it sees those.
 *
 * `agent_send` is the back-channel: the orchestrator addresses a
 * subagent by name and the message lands as a `role: "user"` inject
 * (the orchestrator IS the user from the child's perspective).
 */

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const agentSpawnTool = defineTool({
  name: "agent_spawn",
  desc:
    "Spawn a subagent under your supervision. The new agent inherits " +
    "your model, permissions, and tools (cwd, skill catalog, etc.). " +
    "It runs in the background; its outward messages arrive in your " +
    "queue as system messages tagged `<agent>` whenever it reaches a " +
    "natural stop. Use `agent_send` to follow up.",
  parallel: true,
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    name: Type.String({
      description:
        'Short identifier for inter-agent addressing — e.g. `"reviewer"`, ' +
        '`"researcher"`. Other agents reference this subagent by name. ' +
        "The swarm auto-suffixes (`reviewer-2`, `reviewer-3`, ...) on " +
        "collision, so feel free to reuse role names.",
      minLength: 1,
    }),
    desc: Type.String({
      description:
        "One-line description of what this subagent is doing. Surfaces " +
        "in agent listings so you (and humans observing) can keep track.",
    }),
    prompt: Type.String({
      description:
        "System prompt for the subagent — defines its role and " +
        "constraints. Spell out what it needs to know; the subagent " +
        "does NOT inherit your prompt.",
    }),
    task: Type.Optional(
      Type.String({
        description:
          "Initial task for the subagent, sent as its first user " +
          "message. Omit to spawn an idle subagent that will do " +
          "nothing until you `agent_send` to it.",
      })
    ),
  }),

  async call(args, ctx): Promise<(MetaPart | TextPart)[]> {
    if (!ctx.agent) {
      throw new AiError({
        code: "MISSING_TOOL_CONTEXT",
        message:
          "agent_spawn requires an Agent reference on the context (set up by the agent harness).",
      })
    }
    if (!ctx.swarm) {
      throw new AiError({
        code: "MISSING_TOOL_CONTEXT",
        message:
          "agent_spawn requires a Swarm registry. Construct the root agent with " +
          "`Agent.load({ swarm: new Swarm(), ... })` to enable subagent orchestration.",
      })
    }
    const entry = await ctx.swarm.spawn(ctx.agent, {
      desc: args.desc,
      name: args.name,
      prompt: args.prompt,
      task: args.task,
    })
    return [
      {
        data: { desc: entry.desc, name: entry.name },
        tag: "agent",
        type: "meta",
      },
      { text: `spawned subagent "${entry.name}".`, type: "text" },
    ]
  },
})

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const agentSendTool = defineTool({
  name: "agent_send",
  desc:
    "Send a message to a subagent by name. The receiver sees it as a " +
    "user message and runs (resuming if idle). Their reply will arrive " +
    "in your queue as a system message at their next natural stop. " +
    "Use this to steer a subagent mid-task or to follow up on a report.",
  parallel: true,
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    to: Type.String({
      description:
        "Name of the recipient subagent (the `name` it was given when " +
        "spawned, including any auto-suffix). Must be a subagent in " +
        "your swarm.",
      minLength: 1,
    }),
    content: Type.String({
      description: "Message body — what you want the subagent to do or know.",
      minLength: 1,
    }),
  }),

  call(args, ctx): string {
    if (!ctx.agent) {
      throw new AiError({
        code: "MISSING_TOOL_CONTEXT",
        message: "agent_send requires an Agent reference on the context.",
      })
    }
    if (!ctx.swarm) {
      throw new AiError({
        code: "MISSING_TOOL_CONTEXT",
        message: "agent_send requires a Swarm registry on the context.",
      })
    }
    const target = ctx.swarm.get(args.to)
    if (!target) {
      const known = ctx.swarm.entries
        .map((e) => e.name)
        .filter((n) => n !== ctx.swarm?.find(ctx.agent!)?.name)
      throw new AiError({
        code: "UNKNOWN_AGENT",
        data: { available: known, to: args.to },
        message:
          known.length === 0
            ? `no agent named "${args.to}". No subagents are currently in the swarm.`
            : `no agent named "${args.to}". Available: ${known.join(", ")}.`,
      })
    }
    ctx.swarm.send(ctx.agent, target.agent, args.content)
    return `sent to ${target.name}.`
  },
})
