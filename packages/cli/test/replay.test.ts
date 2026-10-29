import type { Message } from "@zaly/ai"
import type { Node } from "@zaly/tui"
import type { App } from "../src/app/app.ts"

import { MemoryStore, Session } from "@zaly/agent/session"
import { stripAnsi } from "@zaly/shared/ansi"
import { createCtx } from "@zaly/tui"
import { fileUrl } from "@zaly/tui/ansi"
import { resolve } from "pathe"
import { expect, test } from "vitest"
import { replay } from "../src/app/replay.ts"

test.each([18, 19, 20])("replay preserves edit results with %i later messages", async (later) => {
  const messages: Message[] = [
    {
      id: "edit-call",
      role: "assistant",
      content: [
        { type: "tool-call", id: "edit", name: "edit", params: { path: "file.txt", edits: [] } },
      ],
    },
    {
      id: "edit-result",
      role: "tool",
      content: [
        {
          type: "tool-result",
          id: "edit",
          name: "edit",
          content: [{ type: "text", text: "ok" }],
          isError: false,
          meta: { path: "file.txt", original: "before edit\n", content: "after edit\n" },
        },
      ],
    },
    ...Array.from({ length: later }, (_, i): Message => ({
      id: `user-${i}`,
      role: "user",
      content: i === 0 ? "and comments if needed" : `Later message ${i}`,
    })),
  ]
  const nodes: Node[] = []
  const app = {
    $: { ui: { reasoning: false, collapsedTools: [] } },
    ctx: { flags: {} },
    renderer: {
      render: async () => {},
      stream: {
        append: (create: () => Node) => {
          const node = create()
          nodes.push(node)
          return node
        },
        waitIdle: async () => {},
      },
    },
  } as unknown as App

  const session = await Session.load({ store: new MemoryStore() })
  for (const message of messages) await session.add(message)
  await replay(session, app)
  const ctx = await createCtx({ width: 100 })
  const rows = await Promise.all(
    nodes.map(async (node) => {
      const rendered = await node.render(ctx)
      return rendered.join("\n")
    })
  )
  const output = stripAnsi(rows.join("\n"))
  expect(output).toContain("before edit")
  expect(output).toContain("after edit")
  expect(nodes.every((node) => !node.state.sticky)).toBe(true)
})

test("completed tail tools stay sticky and expanded until replay releases them", async () => {
  const session = await Session.load({ store: new MemoryStore() })
  for (let i = 0; i < 25; i++) await session.add({ role: "user", content: `Earlier ${i}` })
  await session.add({
    role: "assistant",
    content: [
      {
        type: "tool-call",
        id: "write",
        name: "write",
        params: { path: "file.txt", content: "finished body\n" },
      },
    ],
  })
  await session.add({
    role: "tool",
    content: [
      {
        type: "tool-result",
        id: "write",
        name: "write",
        content: "ok",
        meta: { path: "file.txt", original: "" },
      },
    ],
  })
  const nodes: Node[] = []
  const frames: { sticky: boolean; output: string }[] = []
  const ctx = await createCtx({ width: 100 })
  const app = {
    $: { ui: { reasoning: false, collapsedTools: [] } },
    ctx: { flags: {} },
    renderer: {
      render: async () => {
        for (const node of nodes) {
          const rows = await node.render(ctx)
          const output = stripAnsi(rows.join("\n"))
          if (output.includes('write("file.txt")'))
            frames.push({ sticky: !!node.state.sticky, output })
        }
      },
      stream: {
        append: (create: () => Node) => {
          const node = create()
          nodes.push(node)
          return node
        },
        waitIdle: async () => {},
      },
    },
  } as unknown as App
  await replay(session, app)
  expect(frames).toHaveLength(2)
  expect(frames[0].sticky).toBe(true)
  expect(frames[0].output).toContain("finished body")
  expect(frames[1].sticky).toBe(false)
  expect(frames[1].output).toContain("finished body")
})

test("replay uses each message's historical cwd before an agent is initialized", async () => {
  const first = resolve("first-project")
  const second = resolve("second-project")
  const session = await Session.load({ store: new MemoryStore() })
  await session.start({ cwd: first })
  await session.add({ role: "assistant", content: "[first](README.md)" })
  await session.update({ cwd: second })
  await session.add({ role: "assistant", content: "[second](README.md)" })
  const nodes: Node[] = []
  const app = {
    $: { ui: { reasoning: false, collapsedTools: [] } },
    ctx: { flags: { cwd: resolve("unrelated-project") } },
    renderer: {
      render: async () => {},
      stream: {
        append: (create: () => Node) => {
          const node = create()
          nodes.push(node)
          return node
        },
        waitIdle: async () => {},
      },
    },
  } as unknown as App
  await replay(session, app)
  const ctx = await createCtx({ width: 100 })
  const firstRows = await nodes[0].render(ctx)
  const secondRows = await nodes[1].render(ctx)
  expect(firstRows.join("\n")).toContain(fileUrl("README.md", first))
  expect(secondRows.join("\n")).toContain(fileUrl("README.md", second))
})
