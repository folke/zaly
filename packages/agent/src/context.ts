import type { Model, ReasoningEffort, Tool } from "@zaly/ai"
import type { Agent } from "./agent.ts"
import type { AgentStatus } from "./events.ts"
import type { Masker, MaskOptions } from "./masker.ts"
import type { Notifier, NotifyOptions } from "./notify.ts"
import type { PermissionManager, PermissionOptions } from "./permissions/manager.ts"
import type { AnyPrompt } from "./prompt/registry.ts"
import type { Session } from "./session/session.ts"
import type { Skills, SkillsOptions } from "./skills.ts"
import type { Swarm } from "./swarm.ts"
import type { AnyTool } from "./tools/registry.ts"
import type { AgentOptions } from "./types.ts"

import { normPath, isInstance } from "@zaly/shared"
import { LazyCache } from "@zaly/shared/cache"

type AgentContextOpts = Omit<AgentOptions, "session"> & { session: Session }

type Slots = {
  notifier: Notifier
  masker: Masker
  permissions: PermissionManager
  skills: Skills
  swarm: Swarm
}

export class AgentContext {
  #agent?: Agent
  #opts: AgentOptions
  #model?: Model
  #session: Session
  #cwd: string
  #reasoning: ReasoningEffort
  #cache = new LazyCache<Slots>()

  #prompt = new Map<string, string>()
  #tools = new Map<string, Tool>()

  $prompt: (string | { template: AnyPrompt })[]
  $tools: (Tool | AnyTool)[]

  constructor(opts: AgentContextOpts) {
    this.#opts = opts
    this.#cwd = normPath(opts.cwd)
    this.#reasoning = opts.request?.reasoning?.effort ?? "medium"
    this.#session = opts.session
    this.#model = opts.model

    this.$prompt = opts.prompt ?? [
      { template: "agent" },
      { template: "env" },
      { template: "model" },
      { template: "AGENTS.md" },
      { template: "MEMORY.md" },
    ]

    this.$tools = opts.tools ?? []
  }

  private async start() {
    const [masker, notifier] = await Promise.all([this.masker(), this.notifier()])

    if (!this.model) throw new Error("model is required to start agent session")

    if (masker) masker.attach(this.agent)
    if (notifier) notifier.attach(this.agent)

    await this.session.start({
      cwd: this.cwd,
      modelId: this.model.id,
      reasoning: this.reasoning,
    })
    // oxlint-disable-next-line no-await-in-loop
    for (const m of this.#opts.messages ?? []) await this.session.add(m)
  }

  attach(agent: Agent) {
    if (this.#agent === agent) return
    if (this.#agent) throw new Error("agent already attached to context")
    this.#agent = agent
    agent.once("start", () => this.start())
  }

  get messages() {
    return this.session.messages
  }

  get status(): AgentStatus | undefined {
    return this.#agent?.status
  }

  get opts() {
    return this.#opts
  }

  get cwd() {
    return this.#cwd
  }

  get signal() {
    return this.#agent?.signal
  }

  get agent() {
    if (!this.#agent) throw new Error("agent not attached to context")
    return this.#agent
  }

  get reasoning() {
    return this.#reasoning
  }

  set reasoning(r: ReasoningEffort) {
    this.#reasoning = r
    void this.#session.update({ reasoning: r })
  }

  get session(): Session {
    return this.#session
  }

  set session(s: Session) {
    this.#session = s
  }

  get model() {
    return this.#model
  }

  set model(m: Model | undefined) {
    this.#model = m
    if (m) void this.#session.update({ modelId: m.id })
  }

  async tools(): Promise<Tool[]> {
    const spec = this.$tools
    const missing = spec
      .filter((t): t is string => typeof t === "string")
      .filter((t) => !this.#tools.has(t))
    if (missing.length > 0) {
      const model = this.model
      if (!model) throw new Error("model must be loaded to load tools")
      const toolInit = { cwd: this.cwd, model }
      const { toolRegistry } = await import("./tools/registry.ts")
      await Promise.all(
        missing.map(async (t) => {
          this.#tools.set(t, await toolRegistry.load(t, toolInit))
        })
      )
    }
    const ret = spec.map((t) => (typeof t === "string" ? this.#tools.get(t)! : t))
    const skills = await this.skills()
    if (skills?.tool) ret.push(skills.tool)
    return ret
  }

  async prompt(): Promise<string[]> {
    const spec = this.$prompt
    const missing = spec
      .filter((p): p is { template: string } => typeof p === "object")
      .map((p) => p.template)
      .filter((p) => !this.#prompt.has(p))
    if (missing.length > 0) {
      const model = this.model
      if (!model) throw new Error("model must be loaded to load prompts")
      const promptCtx = { cwd: this.cwd, model }
      const { promptRegistry } = await import("./prompt/registry.ts")
      await Promise.all(
        missing.map(async (p) => {
          this.#prompt.set(p, await promptRegistry.load(p, promptCtx))
        })
      )
    }
    return spec.map((p) => (typeof p === "string" ? p : this.#prompt.get(p.template)!))
  }

  async swarm() {
    return this.#cache.need(
      "swarm",
      async () => {
        const { Swarm } = await import("./swarm.ts")
        return new Swarm()
      },
      this.#opts.swarm
    )
  }

  async skills(): Promise<Skills | undefined> {
    return this.#cache.want(
      "skills",
      async (opts?: SkillsOptions) => {
        const { Skills } = await import("./skills.ts")
        return await Skills.load(opts)
      },
      this.#opts.skills
    )
  }

  private async notifier(): Promise<Notifier | undefined> {
    return this.#cache.want(
      "notifier",
      async (opts?: NotifyOptions) => {
        const { Notifier } = await import("./notify.ts")
        return new Notifier(opts)
      },
      this.#opts.notify
    )
  }

  private async masker(): Promise<Masker | undefined> {
    return this.#cache.want(
      "masker",
      async (opts?: MaskOptions) => {
        const { Masker } = await import("./masker.ts")
        return new Masker(opts)
      },
      this.#opts.mask
    )
  }

  async permissions(): Promise<PermissionManager> {
    return this.#cache.need(
      "permissions",
      async (opts?: PermissionOptions) => {
        const { PermissionManager } = await import("./permissions/manager.ts")
        return new PermissionManager({ ...opts, cwd: this.cwd })
      },
      this.#opts.permissions
    )
  }
}

async function loadSession(spec?: AgentOptions["session"]): Promise<Session> {
  if (isInstance<Session>(spec)) return spec
  else {
    const { Session } = await import("./session/session.ts")
    return await Session.load({ ...spec })
  }
}

export async function createAgentContext(opts: AgentOptions): Promise<AgentContext> {
  const session = await loadSession(opts.session)
  return new AgentContext({ ...opts, session })
}

export async function createAgent(opts: AgentOptions): Promise<Agent> {
  const [{ Agent }, ctx] = await Promise.all([import("./agent.ts"), createAgentContext(opts)])
  return new Agent(ctx)
}
