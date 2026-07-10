import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { loadClaudeSession } from "../src/session/claude.ts"

let dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { force: true, recursive: true })
  dirs = []
})

function fixture(records: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), "zaly-claude-session-"))
  dirs.push(dir)
  const path = join(dir, "session.jsonl")
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n"), "utf8")
  return path
}

describe("loadClaudeSession", () => {
  test("imports the active Claude chain into zaly messages", async () => {
    const path = fixture([
      {
        message: { content: "before compact", role: "user" },
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "user",
        uuid: "old-user",
      },
      {
        isCompactSummary: true,
        message: { content: "summary", role: "user" },
        parentUuid: "old-user",
        timestamp: "2026-01-01T00:01:00.000Z",
        type: "user",
        uuid: "summary",
      },
      { parentUuid: "summary", type: "attachment", uuid: "attachment" },
      {
        message: {
          content: [
            { text: "look", type: "text" },
            { signature: "sig", thinking: "hidden", type: "thinking" },
            { id: "tool-1", input: { file_path: "a.ts" }, name: "Read", type: "tool_use" },
          ],
          role: "assistant",
          usage: {
            cache_creation_input_tokens: 3,
            cache_read_input_tokens: 2,
            input_tokens: 10,
            output_tokens: 4,
          },
        },
        parentUuid: "attachment",
        timestamp: "2026-01-01T00:02:00.000Z",
        type: "assistant",
        uuid: "assistant-read",
      },
      {
        message: {
          content: [
            {
              content: [
                { text: "file contents", type: "text" },
                { source: { data: "abc", media_type: "image/png", type: "base64" }, type: "image" },
              ],
              tool_use_id: "tool-1",
              type: "tool_result",
            },
          ],
          role: "user",
        },
        parentUuid: "assistant-read",
        timestamp: "2026-01-01T00:03:00.000Z",
        toolUseResult: {
          file: {
            content: "file contents",
            filePath: "a.ts",
            numLines: 3,
            startLine: 1,
            totalLines: 3,
          },
          type: "text",
        },
        type: "user",
        uuid: "tool-result",
      },
      {
        message: { content: "done", role: "assistant" },
        parentUuid: "tool-result",
        timestamp: "2026-01-01T00:04:00.000Z",
        type: "assistant",
        uuid: "done",
      },
      {
        isSidechain: true,
        message: { content: "ignored sidechain", role: "assistant" },
        parentUuid: "done",
        type: "assistant",
        uuid: "sidechain",
      },
    ])

    const { messages } = await loadClaudeSession(path)

    expect(messages.map((message) => [message.id, message.role])).toEqual([
      ["summary", "user"],
      ["assistant-read", "assistant"],
      ["tool-result", "tool"],
      ["done", "assistant"],
    ])
    expect(messages[0]).toMatchObject({
      content: "summary",
      ts: Date.parse("2026-01-01T00:01:00.000Z"),
    })
    expect(messages[1]).toMatchObject({
      meta: { usage: { cacheRead: 2, cacheWrite: 3, input: 10, output: 4 } },
    })
    expect(messages[1].content).toEqual([
      { text: "look", type: "text" },
      { id: "tool-1", name: "read", params: { path: "a.ts" }, type: "tool-call" },
    ])
    expect(messages[2].content).toEqual([
      {
        content: [
          { text: "file contents", type: "text" },
          { mime: "image/png", source: { data: "abc", type: "base64" }, type: "image" },
        ],
        id: "tool-1",
        isError: false,
        meta: { full: true, kind: "read", limit: 3, mtime: 0, offset: 1, path: "a.ts" },
        name: "read",
        type: "tool-result",
      },
    ])
  })

  test("walk all imports sidechain-free records and de-duplicates repeated tool ids", async () => {
    const path = fixture([
      {
        message: {
          content: [{ id: "dup", input: { command: "echo" }, name: "Bash", type: "tool_use" }],
          role: "assistant",
        },
        type: "assistant",
        uuid: "a1",
      },
      {
        message: {
          content: [{ content: "one", tool_use_id: "dup", type: "tool_result" }],
          role: "user",
        },
        type: "user",
        uuid: "t1",
      },
      {
        message: {
          content: [{ id: "dup", input: { command: "echo" }, name: "Bash", type: "tool_use" }],
          role: "assistant",
        },
        type: "assistant",
        uuid: "a2",
      },
      {
        message: {
          content: [{ content: "two", is_error: true, tool_use_id: "dup", type: "tool_result" }],
          role: "user",
        },
        type: "user",
        uuid: "t2",
      },
      {
        isSidechain: true,
        message: { content: "ignored", role: "user" },
        type: "user",
        uuid: "side",
      },
    ])

    const { messages } = await loadClaudeSession(path, { walk: "all" })

    expect(messages).toHaveLength(4)
    expect(messages[0].content).toEqual([
      { id: "dup", name: "bash", params: { command: "echo" }, type: "tool-call" },
    ])
    expect(messages[1].content).toEqual([
      { content: "one", id: "dup", isError: false, name: "bash", type: "tool-result" },
    ])
    expect(messages[2].content).toEqual([
      { id: "dup-1", name: "bash", params: { command: "echo" }, type: "tool-call" },
    ])
    expect(messages[3].content).toEqual([
      { content: "two", id: "dup-1", isError: true, name: "bash", type: "tool-result" },
    ])
  })

  test("returns an empty import for sessions without messages", async () => {
    await expect(loadClaudeSession(fixture([{ type: "summary", uuid: "s" }]))).resolves.toEqual({
      messages: [],
    })
  })
})
