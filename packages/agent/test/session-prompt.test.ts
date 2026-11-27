import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { expect, test } from "vitest"
import { promptCollection } from "../src/prompt/registry.ts"
import { Session } from "../src/session/session.ts"
import { mockModel } from "./helpers.ts"

test("the default prompts include the current session log path when available", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "zaly-session-prompt-"))
  const path = join(cwd, "session.jsonl")
  const session = await Session.load({ path })
  try {
    const prompts = await promptCollection()
    const model = mockModel([])
    const rendered = await prompts.render({ cwd, model, session })
    expect(rendered.find((p) => p.name === "session")).toEqual({
      name: "session",
      text: `## Session\n- path: ${path}`,
    })
    const memory = await Session.load()
    expect(await prompts.render({ cwd, model, prompts: ["session"], session: memory })).toEqual([])
  } finally {
    await session.close()
    await rm(cwd, { force: true, recursive: true })
  }
})
