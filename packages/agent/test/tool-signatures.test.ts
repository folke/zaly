import { loadCatalog, loadModel } from "@zaly/ai"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { expect, test } from "vitest"
import { readTool } from "../src/tools/read.ts"
import { loadAgent, mockModel } from "./helpers.ts"

test("automatic file reads use Google's bypass without persisting a fake signature", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zaly-google-signature-"))
  try {
    const path = join(dir, "README.md")
    writeFileSync(path, "Automatic file reference contents\n")
    let request: Record<string, unknown> | undefined
    const spec = mockModel([]).spec
    const catalog = await loadCatalog()
    const model = await loadModel(
      {
        id: "google/gemini-3-flash",
        api: "openai",
        model: "gemini-3-flash",
        provider: {
          ...spec.provider,
          id: "google",
          api: "openai",
          apiKey: "test",
          quirks: catalog.provider("google")!.quirks,
        },
        fetch: async (_input, init) => {
          if (typeof init?.body !== "string") throw new Error("Expected a JSON request body")
          request = JSON.parse(init.body) as Record<string, unknown>
          return new Response(
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "Read it" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
            { headers: { "content-type": "text/event-stream" } }
          )
        },
      },
      spec
    )
    const agent = await loadAgent({
      model,
      tools: [readTool],
      messages: [{ role: "user", content: "See @README.md" }],
    })
    const injected = await agent.useTool(
      "read",
      { path },
      "File references were read automatically",
      { hidden: true }
    )
    expect(injected.call.wire).toBeUndefined()
    agent.send(injected.messages, { run: false })
    await agent.step()
    const messages = request?.messages as {
      role: string
      content?: string
      tool_calls?: { extra_content?: unknown }[]
    }[]
    const assistant = messages.find((message) => message.role === "assistant")
    expect(assistant?.tool_calls?.[0].extra_content).toEqual({
      google: { thought_signature: "skip_thought_signature_validator" },
    })
    expect(
      messages.some(
        (message) =>
          message.role === "tool" && message.content?.includes("Automatic file reference contents")
      )
    ).toBe(true)
    expect(injected.call.wire).toBeUndefined()
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})
