import type { Agent } from "@zaly/agent"
import type { Usage } from "@zaly/ai"
import type { Setter } from "@zaly/tui"
import type { Config } from "../config.ts"
import type { LoadedSession } from "./session.ts"

/** Default tool list when `--tools` isn't passed. Mirrors the previous
 *  hard-coded set; can be narrowed per-run via `--tools a,b,c`. */
const DEFAULT_TOOLS = [
  "bash",
  "edit",
  "fetch",
  "read",
  "search",
  "subagent",
  "agent_send",
  "agent_spawn",
  "task_list",
  "task_poll",
  "task_stop",
  "wakeup",
  "write",
] as const

/**
 * Build a fresh Agent from a resolved `Config` and a pre-loaded
 * session. Pre-loading the session lets the TUI paint replay history
 * before the agent's model + auth resolution finishes (Phase B). The
 * model id is resolved against the session here (not in `resolveConfig`)
 * because the session has to be loaded async first.
 */
export async function buildAgent(config: Config, preloaded: LoadedSession): Promise<Agent> {
  const { createAgent } = await import("@zaly/agent")
  const { loadModel } = await import("@zaly/ai")
  const { resolveModelId } = await import("./model.ts")
  const modelId = await resolveModelId(config, preloaded)
  const model = await loadModel(modelId, { apiKey: config.apiKey })

  const tools = config.tools ?? [...DEFAULT_TOOLS]
  const reasoning = config.reasoning ? { effort: config.reasoning } : undefined

  return createAgent({
    messages: preloaded.messages,
    model,
    permissions: config.yolo ? { preset: "yolo" } : undefined,
    request: { reasoning },
    session: preloaded.session,
    tools,
  })
}

export interface AgentSignals {
  setBusy: Setter<boolean>
  setStatus: Setter<string>
  setUsage: Setter<Usage>
}

/**
 * Wire an Agent to the App's UI signals. Returns a dispose function
 * that detaches every handler.
 *
 * `busy` and `status` are driven from the agent's authoritative state
 * machine (`agent.on("status")`), covering submit (`streaming`), tool
 * runs (`running-tools`), `/compact` (`compacting`), and abort
 * (`paused`) uniformly. `usage` refreshes on `step-end` since
 * `agent.usage` reflects the last response by then.
 */
export function wireAgent(agent: Agent, signals: AgentSignals): () => void {
  const onStepEnd = (): void => {
    signals.setUsage(agent.usage)
  }
  const onStatus = ({ status }: { status: string }): void => {
    const busy = status !== "idle" && status !== "paused"
    signals.setBusy(busy)
    signals.setStatus(status === "idle" ? "ready" : status)
  }
  const onStop = ({ reason }: { reason: string }): void => {
    if (reason !== "error") return
    signals.setStatus("error")
    const err = agent.lastError
    if (err) console.error(`${err.name}: ${err.message}`)
  }

  agent.on("step-end", onStepEnd)
  agent.on("status", onStatus)
  agent.on("stop", onStop)

  // Seed usage from the tail of any resumed conversation.
  const last = agent.messages.at(-1)
  const usage = last?.role === "assistant" ? last.meta?.usage : undefined
  if (usage) signals.setUsage(usage)

  return () => {
    agent.off("step-end", onStepEnd)
    agent.off("status", onStatus)
    agent.off("stop", onStop)
  }
}
