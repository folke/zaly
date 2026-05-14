import type { Message, Model, Tool } from "@zaly/ai"
import type { Agent } from "./agent.ts"
import type { Masker } from "./masker.ts"
import type { Notifier } from "./notify.ts"
import type { PermissionManager } from "./permissions/manager.ts"
import type { Session } from "./session/session.ts"
import type { Skills } from "./skills.ts"
import type { Swarm } from "./swarm.ts"
import type { AnyTool } from "./tools/registry.ts"
import type { AgentOptions } from "./types.ts"

import { normPath } from "@zaly/shared"

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
const isInstance = <T>(v: unknown): v is T =>
  typeof v === "object" && v !== null && Object.getPrototypeOf(v) !== Object.prototype

function isTools(v: (AnyTool | Tool)[]): v is Tool[] {
  return v.every((t) => typeof t !== "string")
}

export class AgentContext {
  #agent?: Agent
  #opts: AgentOptions
  #model?: Model
  #session?: Session
  #cwd: string
  #tools?: Tool[]
  #prompt?: string[]
  #skills?: Skills
  #started = false
  #notifier?: Notifier
  #masker?: Masker
  #permissions?: PermissionManager
  #swarm?: Swarm

  constructor(opts: AgentOptions) {
    this.#opts = opts
    this.#model = opts.model
    this.#cwd = normPath(opts.cwd)
    if (isInstance<Session>(opts.session)) this.#session = opts.session
  }

  assert(k: string, v: unknown): asserts v {
    if (v === undefined) throw new Error(`${k} not found in context`)
  }

  async start() {
    if (this.#started) return
    this.#started = true
    await Promise.all([
      this.loadSession(),
      this.loadTools(),
      this.loadPrompt(),
      this.loadSkills(),
      this.loadNotifier(),
      this.loadMasker(),
      this.loadPermissions(),
      this.loadSwarm(),
    ])

    if (this.#agent) this.attach()

    await this.session.update({ cwd: this.cwd, modelId: this.model.id, prompt: this.prompt })
    // oxlint-disable-next-line no-await-in-loop
    for (const m of this.#opts.messages ?? []) await this.session.add(m)
  }

  attach() {
    if (!this.started) throw new Error("agent not started yet")
    this.#notifier?.attach(this.agent)
  }

  get messages() {
    return this.session.messages
  }

  get streamMessages(): readonly Message[] {
    const ret = this.messages
    return this.#masker ? this.#masker.apply(ret, this.agent.pressure) : ret
  }

  get started() {
    return this.#started
  }

  get opts() {
    return this.#opts
  }

  get cwd() {
    return this.#cwd
  }

  get agent() {
    this.assert("agent", this.#agent)
    return this.#agent
  }

  set agent(a: Agent) {
    this.#agent = a
    if (this.started) this.attach()
  }

  get skills() {
    return this.#skills
  }

  set skills(s: Skills | undefined) {
    this.#skills = s
  }

  get session(): Session {
    this.assert("session", this.#session)
    return this.#session
  }

  set session(s: Session) {
    this.#session = s
  }

  get model(): Model {
    this.assert("model", this.#model)
    return this.#model
  }

  set model(m: Model) {
    this.#model = m
  }

  set tools(tools: Tool[]) {
    this.#tools = tools
  }

  get tools(): Tool[] {
    this.assert("tools", this.#tools)
    const ret = [...this.#tools]
    if (this.skills?.tool) ret.push(this.skills.tool)
    return ret
  }

  set prompt(prompt: string[]) {
    this.#prompt = prompt
  }

  get prompt(): string[] {
    this.assert("prompt", this.#prompt)
    return this.#prompt
  }

  get notifier() {
    return this.#notifier
  }

  get permissions() {
    this.assert("permissions", this.#permissions)
    return this.#permissions
  }

  get swarm() {
    return this.#swarm
  }

  async loadTools(opts?: AgentOptions["tools"]): Promise<Tool[]> {
    if (this.#tools && !opts) return this.tools
    const spec = opts ?? this.#opts.tools ?? []
    if (isTools(spec)) this.#tools = spec
    else {
      const toolInit = { cwd: this.cwd, model: this.model }
      const { toolRegistry } = await import("./tools/registry.ts")
      this.#tools = await Promise.all(
        spec.map((t) => Promise.resolve(typeof t === "string" ? toolRegistry.load(t, toolInit) : t))
      )
    }
    return this.tools
  }

  async loadPrompt(opts?: AgentOptions["prompt"]): Promise<string[]> {
    if (this.#prompt && !opts) return this.prompt
    const spec = opts ??
      this.#opts.prompt ?? [
        { use: "agent" },
        { use: "env" },
        { use: "model" },
        { use: "AGENTS.md" },
        { use: "MEMORY.md" },
      ]
    if (spec.every((p) => typeof p === "string")) return (this.#prompt = [...spec])
    const promptCtx = { cwd: this.cwd, model: this.model }
    const { promptRegistry } = await import("./prompt/registry.ts")
    this.#prompt = await Promise.all(
      spec.map((p) =>
        Promise.resolve(typeof p === "string" ? p : promptRegistry.load(p.use, promptCtx))
      )
    )
    return this.#prompt
  }

  async loadSession(opts?: AgentOptions["session"]): Promise<Session> {
    if (this.#session && !opts) return this.#session
    const spec = opts ?? this.#opts.session
    if (isInstance<Session>(spec)) this.session = spec
    else {
      const { Session } = await import("./session/session.ts")
      this.session = await Session.load({ cwd: this.cwd, ...spec })
    }
    return this.session
  }

  async loadSkills(opts?: AgentOptions["skills"]): Promise<Skills | undefined> {
    if (this.#skills && opts === undefined) return this.#skills
    const spec = opts ?? this.#opts.skills
    if (spec === false) return
    if (isInstance<Skills>(spec)) this.skills = spec
    else {
      const { Skills } = await import("./skills.ts")
      this.skills = await Skills.load({ cwd: this.cwd })
    }
    return this.skills
  }

  private async loadNotifier(opts?: AgentOptions["notify"]): Promise<Notifier | undefined> {
    if (this.#notifier && opts === undefined) return this.#notifier
    const spec = opts ?? this.#opts.notify ?? true
    if (spec === false) return
    if (isInstance<Notifier>(spec)) this.#notifier = spec
    else {
      const { Notifier } = await import("./notify.ts")
      this.#notifier = new Notifier(typeof spec === "object" ? spec : {})
    }
    return this.#notifier
  }

  private async loadMasker(opts?: AgentOptions["mask"]): Promise<Masker | undefined> {
    if (this.#masker && opts === undefined) return this.#masker
    const spec = opts ?? this.#opts.mask ?? false
    if (spec === false) return
    if (isInstance<Masker>(spec)) this.#masker = spec
    else {
      const { Masker } = await import("./masker.ts")
      this.#masker = new Masker(typeof spec === "object" ? spec : {})
    }
    return this.#masker
  }

  private async loadPermissions(
    opts?: AgentOptions["permissions"]
  ): Promise<PermissionManager | undefined> {
    if (this.#permissions && opts === undefined) return this.#permissions
    const spec = opts ?? this.#opts.permissions ?? {}
    if (isInstance<PermissionManager>(spec)) this.#permissions = spec
    else {
      const { PermissionManager } = await import("./permissions/manager.ts")
      this.#permissions = new PermissionManager({ ...spec, cwd: this.cwd })
    }
    return this.#permissions
  }

  private async loadSwarm() {
    this.#swarm ??= this.#opts.swarm
    if (this.#swarm) return this.#swarm
    const tools = new Set(["agent_send", "agent_spawn"])
    if (this.tools.some((t) => tools.has(t.name))) {
      const { Swarm } = await import("./swarm.ts")
      this.#swarm = new Swarm()
      return this.#swarm
    }
  }
}

export async function createAgentContext(
  opts: AgentOptions & { load?: boolean }
): Promise<AgentContext> {
  return new AgentContext(opts)
}

export async function createAgent(opts: AgentOptions): Promise<Agent> {
  const ctx = await createAgentContext({ load: false, ...opts })
  const [{ Agent }] = await Promise.all([import("./agent.ts"), ctx.loadSession()])
  return new Agent(ctx)
}
