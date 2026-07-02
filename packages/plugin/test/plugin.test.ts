import type { PluginHost } from "../src/types.ts"

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Emitter } from "@zaly/shared"
import { Type } from "typebox"
import { afterEach, describe, expect, test, vi } from "vitest"
import { getPluginLoader } from "../src/loader.ts"
import { loadPlugin, toLoader } from "../src/plugin.ts"

const staticLoader = () => "value"

let dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { force: true, recursive: true })
  dirs = []
})

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "zaly-plugin-"))
  dirs.push(dir)
  return dir
}

function moduleFile(source: string, name = "plugin.mjs") {
  const dir = tmp()
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, source, "utf8")
  return path
}

type FakeHost = PluginHost & {
  $agentNotify: ReturnType<typeof vi.fn>
  $cleanup: ReturnType<typeof vi.fn>[]
  $notify: ReturnType<typeof vi.fn>
}

function host(): FakeHost {
  const cleanup: ReturnType<typeof vi.fn>[] = []
  const agentNotify = vi.fn()
  const notify = vi.fn((msg: string, opts: unknown) => ({ msg, opts }))
  return {
    $agentNotify: agentNotify,
    $cleanup: cleanup,
    $notify: notify,
    ctx: {
      agent: {
        compact: vi.fn(async () => {}),
        contextSize: 42,
        lastStop: { reason: "done" },
        messages: [{ content: "hello", role: "user" }],
        notify: agentNotify,
        send: vi.fn(),
        stop: vi.fn(),
        usage: { input: 1, output: 2 },
        waitIdle: vi.fn(async () => ({ phase: "idle" })),
      },
      cwd: "/repo",
      model: { id: "mock/model" },
      on: vi.fn(),
      reasoning: "medium",
      session: {},
      status: { phase: "idle" },
    },
    loadTheme: vi.fn(async () => ({ name: "loaded" })),
    log: { info: vi.fn() } as never,
    logger: {
      child: vi.fn(() => ({ child: vi.fn(), error: vi.fn(), info: vi.fn() })),
      error: vi.fn(),
      info: vi.fn(),
    } as never,
    model: {
      active: undefined,
      list: vi.fn(async () => [{ id: "mock/model" }]),
      load: vi.fn(async (opts) => ({ id: opts.id ?? "loaded/model" })),
      register: vi.fn(() => {
        const off = vi.fn()
        cleanup.push(off)
        return off
      }),
    } as never,
    notify,
    pick: vi.fn(async (opts) => opts.items?.[0]),
    prompt: vi.fn(async () => "answer"),
    prompts: {
      active: ["base"],
      list: vi.fn(() => [{ name: "base", text: "prompt" }]),
      register: vi.fn(() => {
        const off = vi.fn()
        cleanup.push(off)
        return off
      }),
      render: vi.fn(async () => [{ name: "base", text: "rendered" }]),
    } as never,
    renderer: {
      actions: {
        register: vi.fn(() => {
          const off = vi.fn()
          cleanup.push(off)
          return off
        }),
      },
      bind: vi.fn(() => {
        const off = vi.fn()
        cleanup.push(off)
        return off
      }),
      theme: { name: "default" },
    } as never,
    tools: {
      active: ["read"],
      list: vi.fn(() => ["read"]),
      load: vi.fn(async () => []),
      register: vi.fn(() => {
        const off = vi.fn()
        cleanup.push(off)
        return off
      }),
    } as never,
  } as unknown as FakeHost
}

describe("toLoader", () => {
  test("returns functions unchanged and wraps values in a loader", () => {
    expect(toLoader(staticLoader)).toBe(staticLoader)
    expect(toLoader({ ok: true })()).toEqual({ ok: true })
  })
})

describe("getPluginLoader", () => {
  test("loads default function exports", async () => {
    const path = moduleFile("export default function plugin() {}")
    const loader = await getPluginLoader(path)
    expect(loader).toBeTypeOf("function")
  })

  test("rejects modules without a default function", async () => {
    const path = moduleFile("export default { name: 'not-a-function' }")
    await expect(getPluginLoader(path)).rejects.toThrow("does not export a default function")
  })
})

describe("loadPlugin", () => {
  test("loads a plugin, exposes API helpers, and disposes cleanup handlers LIFO", async () => {
    const path = moduleFile(`
      export default function plugin(api) {
        api.agent.notify('loaded', { ok: true })
        api.ui.bind({ key: 'x', action: 'test' })
        api.ui.registerActions({ name: 'act', perform() {} })
        api.ui.notify('hello')
      }
    `)
    const h = host()

    const result = await loadPlugin(path, h)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error

    expect(result.plugin.name).toBe("plugin")
    expect(result.plugin.running).toBe(true)
    expect(h.$agentNotify).toHaveBeenCalledWith("loaded", { ok: true })
    expect(h.$notify).toHaveBeenCalledWith("hello", { title: "Plugin plugin" })
    expect(result.plugin.api).toBe(result.plugin.api)
    expect(result.plugin.api.agent.cwd).toBe("/repo")
    expect(result.plugin.api.agent.contextSize).toBe(42)
    expect(result.plugin.api.agent.messages).toEqual([{ content: "hello", role: "user" }])
    expect(result.plugin.api.agent.usage).toEqual({ input: 1, output: 2 })
    expect(result.plugin.api.agent.status).toEqual({ phase: "idle" })
    expect(result.plugin.api.agent.lastStop).toEqual({ reason: "done" })
    expect(result.plugin.api.ui.theme).toEqual({ name: "default" })
    result.plugin.api.ui.theme = { name: "custom" } as never
    expect(h.renderer.theme).toEqual({ name: "custom" })

    await result.plugin.dispose()
    expect(result.plugin.running).toBe(false)
    expect(h.$cleanup.toReversed().every((fn) => fn.mock.calls.length === 1)).toBe(true)
    expect(() => result.plugin.api).toThrow("is not loaded")
  })

  test("returns an error result and disposes when plugin execution fails", async () => {
    const path = moduleFile("export default function plugin() { throw new Error('boom') }")
    const result = await loadPlugin(path, host())

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected plugin load failure")
    expect(result.error.message).toBe("boom")
    expect(result.plugin.running).toBe(false)
  })

  test("uses parent directory name for index plugins", async () => {
    const dir = tmp()
    const path = join(dir, "demo", "index.mjs")
    mkdirSync(join(dir, "demo"), { recursive: true })
    writeFileSync(path, "export default function plugin() {}", "utf8")

    const result = await loadPlugin(path, host())
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    expect(result.plugin.name).toBe("demo")
  })
})

describe("PluginApi", () => {
  async function loadApi() {
    const h = host()
    const result = await loadPlugin(moduleFile("export default function plugin() {}"), h)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    return { api: result.plugin.api, plugin: result.plugin, pluginHost: h }
  }

  test("agent API normalizes sends and delegates control methods", async () => {
    const { api, pluginHost } = await loadApi()
    const agent = pluginHost.ctx.agent as any

    api.agent.send("hello", { mode: "append", run: false })
    expect(agent.send).toHaveBeenLastCalledWith([{ content: "hello", role: "user" }], {
      mode: "append",
      run: false,
    })

    api.agent.send([{ text: "part", type: "text" }])
    expect(agent.send).toHaveBeenLastCalledWith(
      [{ content: [{ text: "part", type: "text" }], role: "user" }],
      {}
    )

    const message = { content: "assistant", role: "assistant" } as const
    api.agent.send(message)
    expect(agent.send).toHaveBeenLastCalledWith([message], {})

    api.agent.notify("custom", { ok: true })
    expect(agent.notify).toHaveBeenCalledWith("custom", { ok: true })
    api.agent.stop({ reason: "stop" })
    expect(agent.stop).toHaveBeenCalledWith({ reason: "stop" })
    await expect(api.agent.waitIdle(100)).resolves.toEqual({ phase: "idle" })
    await expect(api.agent.compact()).resolves.toBeUndefined()
  })

  test("model, prompt, tool, and ui APIs delegate and register cleanup", async () => {
    const { api, plugin, pluginHost } = await loadApi()

    expect(api.model.active).toBeUndefined()
    api.model.active = { id: "active/model" } as never
    expect(pluginHost.model.active).toEqual({ id: "active/model" })
    await expect(api.model.list({})).resolves.toEqual([{ id: "mock/model" }])
    await expect(api.model.load({ id: "loaded/model" })).resolves.toEqual({ id: "loaded/model" })
    api.model.register({ id: "provider", name: "Provider", models: [] } as never)

    expect(api.prompts.active).toEqual(["base"])
    api.prompts.active = ["custom"]
    expect(pluginHost.prompts.active).toEqual(["custom"])
    await expect(api.prompts.render(["custom"])).resolves.toEqual([{ name: "base", text: "rendered" }])
    expect(api.prompts.list()).toEqual([{ name: "base", text: "prompt" }])
    api.prompts.register({ name: "p", text: "prompt" })

    expect(api.tools.active).toEqual(["read"])
    api.tools.active = ["bash"] as never
    expect(pluginHost.tools.active).toEqual(["bash"])
    await expect(api.tools.load(["bash"] as never)).resolves.toEqual([])
    expect(api.tools.list()).toEqual(["read"])
    const tool = api.tools.register({
      call: () => "ok",
      desc: "test tool",
      name: "test",
      params: Type.Object({}),
    })
    expect(tool.name).toBe("test")

    await expect(api.ui.pick({ items: [{ text: "one" }] })).resolves.toEqual({ text: "one" })
    await expect(api.ui.loadTheme("loaded")).resolves.toEqual({ name: "loaded" })
    expect(api.log).toBe(plugin.logger)
    expect(api.signal.aborted).toBe(false)

    await plugin.dispose()
    expect(pluginHost.$cleanup.every((fn) => fn.mock.calls.length === 1)).toBe(true)
  })

  test("prompt rendering returns empty when no model is active", async () => {
    const { api, pluginHost } = await loadApi()
    ;(pluginHost.ctx as any).model = undefined
    await expect(api.prompts.render()).resolves.toEqual([])
  })

  test("events API forwards agent and context events and supports listener removal", async () => {
    const h = host()
    const agent = Object.assign(new Emitter(), h.ctx.agent)
    const { on: _on, ...ctxProps } = h.ctx as any
    const ctx = Object.assign(new Emitter(), ctxProps, { agent })
    h.ctx = ctx as never
    const result = await loadPlugin(moduleFile("export default function plugin() {}"), h)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error

    const api = result.plugin.api
    const any = vi.fn()
    const status = vi.fn()
    const once = vi.fn()
    const session = vi.fn((event) => event.abort("nope"))

    api.events.onAny(any).on("agent:status", status).once("agent:start", once).on("session", session)
    await (agent as any).emit("status", { status: { phase: "busy" } })
    await (agent as any).emit("start")
    await (agent as any).emit("start")

    expect(any).toHaveBeenCalledWith(expect.objectContaining({ type: "agent:status" }), api)
    expect(status).toHaveBeenCalledWith(
      expect.objectContaining({ status: { phase: "busy" }, type: "agent:status" }),
      api
    )
    expect(once).toHaveBeenCalledTimes(1)

    await (ctx as any).emitSerial("session", { session: {} })
    expect(session).toHaveBeenCalledWith(
      expect.objectContaining({ abort: expect.any(Function), signal: expect.any(AbortSignal), type: "session" }),
      api
    )

    api.events.off("agent:status", status).offAny(any)
    await (agent as any).emit("status", { status: { phase: "idle" } })
    expect(status).toHaveBeenCalledTimes(1)
    expect(any).toHaveBeenCalledTimes(4)
  })
})
