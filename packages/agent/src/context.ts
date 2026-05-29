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

import { normPath, isInstance, Emitter } from "@zaly/shared"
import { LazyCache } from "@zaly/shared/cache"

type AgentContextOpts = Omit<AgentOptions, "session"> & { session: Session }

type Slots = {
  notifier: Notifier
  masker: Masker
  permissions: PermissionManager
  skills: Skills
  swarm: Swarm
}

export type AgentContextEvents = {
  model: { model?: Model; prev?: Model }
  reasoning: { effort: ReasoningEffort; prev?: ReasoningEffort }
  session: { session: Session; prev?: Session }
  cwd: { cwd: string; prev?: string }
  skills: { skills: Skills }
}

export class AgentContext extends Emitter<AgentContextEvents> {
  #agent?: Agent
  #opts: AgentOptions
  #model?: Model
  #session: Session
  #reasoning: ReasoningEffort
  #cwd: string
  #cache = new LazyCache<Slots>()

  #prompt = new Map<string, string>()
  #tools = new Map<string, Tool>()

  $prompt: (string | { template: AnyPrompt })[]
  $tools: (Tool | AnyTool)[]

  constructor(opts: AgentContextOpts) {
    super()
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
    this.onEmitError = (error) => this.#opts.logger?.child("context").error(error)

    this.on("model", async ({ model }) => {
      if (model) await this.session.update({ modelId: model.id })
    })
      .on("reasoning", async ({ effort }) => {
        await this.session.update({ reasoning: effort })
      })
      .on("cwd", ({ cwd }) => {
        this.#tools = new Map() // reset tools to force reload with new cwd
        this.#prompt = new Map() // reset prompts to force reload with new cwd
        this.#cache.forget("permissions") // reset permissions to force reload with new cwd
        void this.session.update({ cwd })
      })
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
    if (agent.started) throw new Error("cannot attach agent that has already started")
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

  set cwd(c: string) {
    if (c === this.#cwd) return
    const prev = this.#cwd
    this.#cwd = normPath(c)
    void this.emit("cwd", { cwd: this.#cwd, prev })
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
    if (r === this.#reasoning) return
    const prev = this.#reasoning
    this.#reasoning = r
    void this.emit("reasoning", { effort: r, prev })
  }

  get session(): Session {
    return this.#session
  }

  async useSession(s: Session): Promise<void> {
    if (s === this.#session) return
    const prev = this.#session
    this.#session = s
    const modelId = s.settings.modelId
    if (modelId && modelId !== this.model?.id) {
      const { loadModel } = await import("@zaly/ai")
      this.model = await loadModel(modelId)
    }
    this.cwd = s.settings.cwd ?? this.cwd
    this.reasoning = s.settings.reasoning ?? this.reasoning
    await this.emit("session", { prev, session: s })
    if (this.#agent?.started)
      await s.start({
        cwd: this.cwd,
        modelId: this.model?.id,
        reasoning: this.reasoning,
      })
  }

  get model() {
    return this.#model
  }

  set model(m: Model | undefined) {
    if (m === this.#model) return
    const prev = this.#model
    this.#model = m
    void this.emit("model", { model: m, prev })
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
    return spec
      .map((p) => (typeof p === "string" ? p : this.#prompt.get(p.template)!))
      .filter((text) => text.trim() !== "")
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
        const ret = await Skills.load(opts)
        await this.emitSerial("skills", { skills: ret })
        return ret
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

  async masker(): Promise<Masker | undefined> {
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
