import type { Model, ReasoningEffort, Tool } from "@zaly/ai"
import type { Agent } from "./agent.ts"
import type { AgentStatus } from "./events.ts"
import type { Masker } from "./masker.ts"
import type { Notifier } from "./notify.ts"
import type { PermissionManager } from "./permissions/manager.ts"
import type { AnyPrompt } from "./prompt/registry.ts"
import type { Session } from "./session/session.ts"
import type { Skills } from "./skills.ts"
import type { Swarm } from "./swarm.ts"
import type { AnyTool } from "./tools/registry.ts"
import type { AgentOptions } from "./types.ts"

import { normPath } from "@zaly/shared"

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
const isInstance = <T>(v: unknown): v is T =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) !== Object.prototype

type AgentContextOpts = Omit<AgentOptions, "session"> & { session: Session }

export class AgentContext {
  #agent?: Agent
  #opts: AgentOptions
  #model: Model
  #session: Session
  #cwd: string
  #skills?: Skills
  #notifier?: Notifier
  #masker?: Masker
  #permissions?: PermissionManager
  #swarm?: Swarm
  #reasoning: ReasoningEffort

  #prompt = new Map<string, string>()
  #tools = new Map<string, Tool>()

  $prompt: (string | { template: AnyPrompt })[]
  $tools: (Tool | AnyTool)[]

  constructor(opts: AgentContextOpts) {
    this.#opts = opts
    this.#model = opts.model
    this.#cwd = normPath(opts.cwd)
    this.#reasoning = opts.request?.reasoning?.effort ?? "medium"
    this.#session = opts.session

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

  get model(): Model {
    return this.#model
  }

  set model(m: Model) {
    this.#model = m
    void this.#session.update({ modelId: m.id })
  }

  async tools(): Promise<Tool[]> {
    const spec = this.$tools
    const missing = spec
      .filter((t): t is string => typeof t === "string")
      .filter((t) => !this.#tools.has(t))
    if (missing.length > 0) {
      const toolInit = { cwd: this.cwd, model: this.model }
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
      const promptCtx = { cwd: this.cwd, model: this.model }
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
    this.#swarm ??= this.#opts.swarm
    if (this.#swarm) return this.#swarm
    const { Swarm } = await import("./swarm.ts")
    this.#swarm = new Swarm()
    return this.#swarm
  }

  async skills(): Promise<Skills | undefined> {
    if (this.#skills) return this.#skills
    const spec = this.#opts.skills
    if (spec === undefined) return
    if (isInstance<Skills>(spec)) this.#skills = spec
    else {
      const { Skills } = await import("./skills.ts")
      this.#skills = await Skills.load({ paths: spec })
    }
    return this.#skills
  }

  private async notifier(): Promise<Notifier | undefined> {
    if (this.#notifier) return this.#notifier
    const spec = this.#opts.notify ?? true
    if (spec === false) return
    if (isInstance<Notifier>(spec)) this.#notifier = spec
    else {
      const { Notifier } = await import("./notify.ts")
      this.#notifier = new Notifier(typeof spec === "object" ? spec : {})
    }
    return this.#notifier
  }

  private async masker(): Promise<Masker | undefined> {
    if (this.#masker) return this.#masker
    const spec = this.#opts.mask ?? false
    if (spec === false) return
    if (isInstance<Masker>(spec)) this.#masker = spec
    else {
      const { Masker } = await import("./masker.ts")
      this.#masker = new Masker(typeof spec === "object" ? spec : {})
    }
    return this.#masker
  }

  async permissions(): Promise<PermissionManager> {
    if (this.#permissions) return this.#permissions
    const spec = this.#opts.permissions ?? {}
    if (isInstance<PermissionManager>(spec)) this.#permissions = spec
    else {
      const { PermissionManager } = await import("./permissions/manager.ts")
      this.#permissions = new PermissionManager({ ...spec, cwd: this.cwd })
    }
    return this.#permissions
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
