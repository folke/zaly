/**
 * End-to-end permission wiring: `ctx.need`, the `tool` scope handler,
 * Tasks-level auto-check, and the `AgentOptions.allow` ask escalation.
 *
 * These tests drive the agent through a real run with a mock model so
 * the agent's internal `#toolContext()` (where `ctx.need` is wired) is
 * exercised in the same path production uses.
 */
import type { StreamEvent, Tool } from "@zaly/ai"
import type { Agent } from "../src/agent.ts"

import { defineTool } from "@zaly/ai"
import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { toolHandler } from "../src/permissions/handlers/tool.ts"
import { PermissionManager } from "../src/permissions/manager.ts"
import { bashTool } from "../src/tools/bash.ts"
import { findTool } from "../src/tools/find.ts"
import { loadAgent, mockModel } from "./helpers.ts"

const noopTool: Tool = defineTool({
  call: () => "ok",
  name: "noop",
  parallel: true,
  params: Type.Object({}),
})

/** Two-script model: turn 1 calls the named tool, turn 2 stops naturally. */
const callThenStop = (toolName: string): StreamEvent[][] => [
  [
    { id: "c1", name: toolName, params: {}, type: "tool-call" },
    { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
  ],
  [
    { delta: "done", type: "text-delta" },
    { finishReason: "stop", type: "finish", usage: { input: 1, output: 1 } },
  ],
]

const lastToolPart = (agent: Agent) => {
  for (let i = agent.messages.length - 1; i >= 0; i--) {
    const m = agent.messages[i]
    if (m.role === "tool") return m.content[0]
  }
  return undefined
}

const runWithTimeout = async (agent: Agent, ms = 2000) => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`agent.run() did not settle within ${ms}ms`)), ms)
  )
  return await Promise.race([agent.run(), timeout])
}

const validate = (input: string, rules: { pattern: string; policy: "allow" | "deny" | "ask" }[]) =>
  toolHandler.validate(input, {
    cwd: "/x",
    rules: rules.map((r) => ({ ...r, scope: "tool" as const })),
    scope: "tool",
    validate: () => ({ verdict: "allow" }),
    workspaces: ["/x"],
  })

describe("toolHandler — direct", () => {
  test("default verdict is allow when no rule matches", () => {
    expect(validate("any-tool", [])).toEqual({ verdict: "allow" })
  })

  test("exact-name deny", () => {
    expect(validate("bash", [{ pattern: "bash", policy: "deny" }]).verdict).toBe("deny")
  })

  test("exact-name ask surfaces a rule suggestion", () => {
    const r = validate("bash", [{ pattern: "bash", policy: "ask" }])
    expect(r.verdict).toBe("ask")
    if (r.verdict === "allow") throw new Error("type narrow")
    expect(r.suggestions?.[0]).toMatchObject({ kind: "rule", scope: "tool", pattern: "bash" })
  })

  test("glob match (`fetch:*`)", () => {
    expect(validate("fetch:example.com", [{ pattern: "fetch:*", policy: "deny" }]).verdict).toBe(
      "deny"
    )
    expect(validate("read", [{ pattern: "fetch:*", policy: "deny" }]).verdict).toBe("allow")
  })

  test("first matching rule wins", () => {
    expect(
      validate("bash", [
        { pattern: "*", policy: "allow" },
        { pattern: "bash", policy: "deny" },
      ]).verdict
    ).toBe("allow")
    expect(
      validate("bash", [
        { pattern: "bash", policy: "ask" },
        { pattern: "*", policy: "allow" },
      ]).verdict
    ).toBe("ask")
  })
})

describe("PermissionManager — handler registry includes tool scope", () => {
  test("tool scope resolves via the registered handler", () => {
    const m = new PermissionManager({ cwd: "/x" })
    expect(() => m.validate("tool", "anything")).not.toThrow()
    expect(m.validate("tool", "anything").verdict).toBe("allow")
  })
})

describe("Tasks auto-check on tool dispatch", () => {
  test("denied tool short-circuits before the tool body runs", async () => {
    let called = false
    const watcher: Tool = defineTool({
      call: () => {
        called = true
        return "ran"
      },
      name: "watch",
      parallel: true,
      params: Type.Object({}),
    })
    const agent = await loadAgent({
      model: mockModel(callThenStop("watch")),
      permissions: { rules: [{ pattern: "watch", policy: "deny", scope: "tool" }] },
      tools: [watcher],
    })
    await agent.run()
    expect(called).toBe(false)
    const part = lastToolPart(agent)
    if (!part) throw new Error("expected tool-result")
    expect(part.isError).toBe(true)
    expect(part.error?.code).toBe("PERMISSION_DENIED")
  })

  test("allowed tool runs normally", async () => {
    const agent = await loadAgent({
      model: mockModel(callThenStop("noop")),
      permissions: { rules: [{ pattern: "noop", policy: "allow", scope: "tool" }] },
      tools: [noopTool],
    })
    await agent.run()
    const part = lastToolPart(agent)
    if (!part) throw new Error("expected tool-result")
    expect(part.isError).toBe(false)
  })
})

describe("real tools do not leave the agent stuck in running-tools", () => {
  test("bash ask without allow callback commits PERMISSION_DENIED and stops", async () => {
    const agent = await loadAgent({
      model: mockModel([
        [
          {
            id: "bash-1",
            name: "bash",
            params: { command: "ls", description: "list files", max_lines: 20, timeout: 1000 },
            type: "tool-call",
          },
          { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
        ],
        [{ finishReason: "stop", type: "finish", usage: { input: 1, output: 1 } }],
      ]),
      permissions: {},
      tools: [bashTool],
    })

    const statuses: string[] = []
    agent.on("status", ({ status }) => statuses.push(status))

    await runWithTimeout(agent)

    expect(agent.status).toBe("idle")
    expect(statuses).toContain("running-tools")
    const part = lastToolPart(agent)
    if (!part) throw new Error("expected tool-result")
    expect(part.isError).toBe(true)
    expect(part.error?.code).toBe("PERMISSION_DENIED")
  })

  test("bash with permissive preset commits a tool result and stops", async () => {
    const agent = await loadAgent({
      model: mockModel([
        [
          {
            id: "bash-1",
            name: "bash",
            params: { command: "ls", description: "list files", max_lines: 20, timeout: 1000 },
            type: "tool-call",
          },
          { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
        ],
        [{ finishReason: "stop", type: "finish", usage: { input: 1, output: 1 } }],
      ]),
      permissions: { preset: "permissive" },
      tools: [bashTool],
    })

    await runWithTimeout(agent)

    expect(agent.status).toBe("idle")
    const part = lastToolPart(agent)
    if (!part) throw new Error("expected tool-result")
    expect(part.isError).toBe(false)
  })

  test("find with default permissions commits a tool result and stops", async () => {
    const agent = await loadAgent({
      model: mockModel(callThenStop("find")),
      permissions: {},
      tools: [findTool],
    })

    await runWithTimeout(agent)

    expect(agent.status).toBe("idle")
    const part = lastToolPart(agent)
    if (!part) throw new Error("expected tool-result")
    expect(part.isError).toBe(false)
  })
})

describe("AgentOptions.allow — ask escalation", () => {
  test("ask without allow callback → deny", async () => {
    const agent = await loadAgent({
      model: mockModel(callThenStop("noop")),
      permissions: { rules: [{ pattern: "noop", policy: "ask", scope: "tool" }] },
      tools: [noopTool],
    })
    await agent.run()
    const part = lastToolPart(agent)
    if (!part) throw new Error("expected tool-result")
    expect(part.isError).toBe(true)
    expect(part.error?.code).toBe("PERMISSION_DENIED")
  })

  test("ask + allow returns true → tool runs", async () => {
    let toolRan = false
    const watch: Tool = defineTool({
      call: () => {
        toolRan = true
        return "ran"
      },
      name: "watch-ask",
      parallel: true,
      params: Type.Object({}),
    })
    const agent = await loadAgent({
      allow: async () => true,
      model: mockModel(callThenStop("watch-ask")),
      permissions: { rules: [{ pattern: "watch-ask", policy: "ask", scope: "tool" }] },
      tools: [watch],
    })
    await agent.run()
    expect(toolRan).toBe(true)
  })

  test("ask + allow returns false → deny", async () => {
    let toolRan = false
    const watch: Tool = defineTool({
      call: () => {
        toolRan = true
        return "ran"
      },
      name: "watch-deny",
      parallel: true,
      params: Type.Object({}),
    })
    const agent = await loadAgent({
      allow: async () => false,
      model: mockModel(callThenStop("watch-deny")),
      permissions: { rules: [{ pattern: "watch-deny", policy: "ask", scope: "tool" }] },
      tools: [watch],
    })
    await agent.run()
    expect(toolRan).toBe(false)
    const part = lastToolPart(agent)
    if (!part) throw new Error("expected tool-result")
    expect(part.error?.code).toBe("PERMISSION_DENIED")
  })

  test("allow callback receives scope, input, reason, suggestions", async () => {
    const seen: { scope?: string; input?: string; reason?: string; suggestions?: unknown } = {}
    const agent = await loadAgent({
      allow: async (req) => {
        seen.scope = req.scope
        seen.input = req.input
        seen.reason = req.reason
        seen.suggestions = req.suggestions
        return true
      },
      model: mockModel(callThenStop("noop")),
      permissions: { rules: [{ pattern: "noop", policy: "ask", scope: "tool" }] },
      tools: [noopTool],
    })
    await agent.run()
    expect(seen.scope).toBe("tool")
    expect(seen.input).toBe("noop")
    expect(seen.reason).toMatch(/confirmation/)
    expect(Array.isArray(seen.suggestions)).toBe(true)
  })
})
