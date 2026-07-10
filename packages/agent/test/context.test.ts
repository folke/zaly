import type { Message, Tool } from "@zaly/ai"

import { describe, expect, test } from "vitest"
import { ContextScoring } from "../src/context/scoring.ts"
import { estimatePart, formatTokenStats, tokenStats } from "../src/context/tokens.ts"

const text = (value: string) => ({ text: value, type: "text" as const })
const user = (content: Message<"user">["content"]): Message<"user"> => ({ content, role: "user" })
const assistant = (content: Message<"assistant">["content"]): Message<"assistant"> => ({
  content,
  role: "assistant",
})
const tool = (content: Message<"tool">["content"]): Message<"tool"> => ({ content, role: "tool" })

describe("tokenStats", () => {
  test("estimates text, tool calls, tool results, attachments, meta, and errors", () => {
    const stats = tokenStats(
      [
        user([
          text("hello"),
          { mime: "image/png", source: { data: "abc", type: "base64" }, type: "image" },
          { data: { ok: true }, tag: "status", type: "meta" },
        ]),
        assistant([
          { text: "thinking", type: "reasoning" },
          { id: "call-1", name: "read", params: { path: "a.txt" }, type: "tool-call" },
        ]),
        tool([
          {
            content: [text("result"), { code: "BOOM", message: "boom", type: "error" }],
            id: "call-1",
            name: "read",
            type: "tool-result",
          },
        ]),
      ],
      {
        expand: () => true,
        prompt: ["system prompt", { name: "custom", text: "prompt text" }],
        tools: [{ name: "read", params: { type: "object" } } as unknown as Tool],
      }
    )

    expect(stats.count).toBe(4)
    expect(stats.tokens).toBeGreaterThan(1500)
    expect(stats.children?.get("user")?.children?.get("image")?.tokens).toBe(1500)
    expect(
      stats.children?.get("assistant")?.children?.get("tool-call")?.children?.get("read")
    ).toMatchObject({
      count: 1,
      key: "read",
    })
    expect(
      stats.children
        ?.get("tool")
        ?.children?.get("tool-result")
        ?.children?.get("read")
        ?.children?.get("error")
    ).toMatchObject({ count: 1 })
    expect(
      stats.children?.get("system-prompt")?.children?.get("tool-schema")?.children?.get("read")
    ).toMatchObject({ count: 1 })
  })

  test("formatTokenStats sorts top-level children by token count and includes totals", () => {
    const stats = tokenStats([
      user([text("small")]),
      user([{ mime: "application/pdf", source: { data: "x", type: "base64" }, type: "pdf" }]),
    ])
    const formatted = formatTokenStats(stats)

    expect(formatted).toContain("TOTAL")
    expect(formatted).toContain("user")
    expect(formatted).toContain("8_002")
  })

  test("estimatePart throws for unknown part types", () => {
    expect(() => estimatePart({ type: "mystery" } as never)).toThrow("Unknown part type")
  })
})

describe("ContextScoring", () => {
  test("scores recency by assistant turns, not user turns", () => {
    const scoring = new ContextScoring({
      parts: [
        {
          filter: (part) => part.part.type === "text",
          halfLife: 1,
          mask: (part) => ({ ...part.part, text: "masked" }),
          key: "id",
        },
      ],
      tools: {} as never,
    })
    const messages: Message[] = [
      user([text("old user text")]),
      assistant([text("assistant one")]),
      user([text("newer user text")]),
      assistant([text("assistant two")]),
    ]

    const groups = scoring.score(messages)
    const oldUser = groups.find(
      (g) => g.parts[0].part.type === "text" && g.parts[0].part.text === "old user text"
    )
    const newerUser = groups.find(
      (g) => g.parts[0].part.type === "text" && g.parts[0].part.text === "newer user text"
    )

    expect(oldUser?.parts[0].turn).toBe(2)
    expect(newerUser?.parts[0].turn).toBe(1)
    expect(newerUser!.parts[0].score).toBeGreaterThan(oldUser!.parts[0].score)
  })

  test("groups tool calls and results by params and applies shadowing to repeated keys", () => {
    const scoring = new ContextScoring()
    const messages: Message[] = [
      assistant([{ id: "old", name: "bash", params: { command: "echo  old" }, type: "tool-call" }]),
      tool([{ content: "old result", id: "old", name: "bash", type: "tool-result" }]),
      assistant([{ id: "new", name: "bash", params: { command: "echo old" }, type: "tool-call" }]),
      tool([{ content: "new result", id: "new", name: "bash", type: "tool-result" }]),
    ]

    const groups = scoring.score(messages).filter((group) => group.key === "bash:echo old")
    expect(groups).toHaveLength(2)
    expect(
      groups[0].parts.some((part) => part.part.type === "tool-call" && part.part.id === "new")
    ).toBe(true)
    expect(
      groups[1].parts.some((part) => part.part.type === "tool-call" && part.part.id === "old")
    ).toBe(true)
    expect(groups[0].parts[0].score).toBeGreaterThan(groups[1].parts[0].score)
  })

  test("file tools group by result metadata path and keep errored results unmasked", () => {
    const scoring = new ContextScoring()
    const messages: Message[] = [
      assistant([{ id: "read-1", name: "read", params: { path: "a.txt" }, type: "tool-call" }]),
      tool([
        {
          content: "read failed",
          id: "read-1",
          isError: true,
          meta: { full: true, path: "a.txt" },
          name: "read",
          type: "tool-result",
        },
      ]),
      assistant([{ id: "write-1", name: "write", params: { path: "a.txt" }, type: "tool-call" }]),
      tool([
        {
          content: "wrote",
          id: "write-1",
          meta: { path: "a.txt" },
          name: "write",
          type: "tool-result",
        },
      ]),
    ]

    const groups = scoring.score(messages).filter((group) => group.key === "file:a.txt")
    expect(groups).toHaveLength(2)
    expect(
      groups.map((group) => group.parts.some((part) => part.part.type === "tool-result"))
    ).toEqual([true, true])
    const readResult = groups
      .flatMap((group) => group.parts)
      .find((part) => part.part.type === "tool-result" && part.part.id === "read-1")
    expect(readResult?.part).toMatchObject({ isError: true })
  })

  test("default part policies mask attachments and task system text", () => {
    const scoring = new ContextScoring()
    const groups = scoring.score([
      user([{ mime: "image/png", source: { data: "abc", type: "base64" }, type: "image" }]),
      { content: [text("task details")], meta: { kind: "task" }, role: "system" },
    ])

    expect(groups.map((group) => group.parts[0].part.type).toSorted()).toEqual(["image", "text"])
    expect(groups.every((group) => group.parts[0].score > 0)).toBe(true)
  })
})
