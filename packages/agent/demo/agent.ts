/**
 * End-to-end interactive demo: streaming agent with the full built-in
 * tool catalog. Reads prompts from a REPL until you exit.
 *
 * Run from the repo root so `.env` is picked up:
 *
 *   bun packages/agent/demo/agent.ts
 *
 * Each line is sent to the agent; conversation history persists across
 * turns. Type `exit`, `quit`, `/q`, or hit Ctrl-D to leave. Ctrl-C
 * aborts the current run; a second Ctrl-C exits. Type `/reset` to
 * dispose the current session and start a fresh agent (useful when
 * the agent gets stuck in an error loop).
 *
 * Env:
 *   MODEL                 override the default model id
 *   ANTHROPIC_API_KEY     for anthropic/* (default)
 *   OPENAI_API_KEY        for openai/*
 *   OPENROUTER_API_KEY    for openrouter/*
 *   CLAUDE_SESSION        path to a Claude Code session .jsonl;
 *                         loads the active chain so the next user
 *                         message continues that conversation.
 *                         `/reset` drops it.
 *
 * Permissions: uses the `yolo` preset so all tools auto-allow — fine
 * for a sandbox demo, NOT what you'd run against arbitrary user code.
 * Switch to `permissive` or `readonly` to feel the actual policy.
 */
import { loadModel } from "@zaly/ai"
import { createInterface } from "node:readline/promises"
import { Agent } from "../src/agent.ts"
import { loadClaudeSession } from "../src/session/claude.ts"
import {
  bashTool,
  editTool,
  fetchTool,
  readTool,
  searchTool,
  taskStopTool,
  taskListTool,
  taskPollTool,
  wakeupTool,
  writeTool,
  subagentTool,
} from "../src/tools/index.ts"

const id = process.env.MODEL ?? "anthropic/claude-sonnet-4-6"
const model = await loadModel(id)

console.log(`→ ${model.id}`)
console.log(
  `  context ${model.spec.limit.context}` +
    ` · output ${model.spec.limit.output}` +
    ` · reasoning ${model.spec.reasoning ? "yes" : "no"}\n`
)

let mode: "reasoning" | "text" | undefined

const resetMode = (): void => {
  if (mode === "reasoning") process.stdout.write("\x1b[0m")
  if (mode !== undefined) process.stdout.write("\n")
  mode = undefined
}

// Load a Claude Code session at startup if `CLAUDE_SESSION` points at a
// .jsonl file. The first `buildAgent()` consumes it; `/reset` clears the
// reference so subsequent rebuilds start fresh.
const claudePath = process.env.CLAUDE_SESSION
let pendingClaude: Awaited<ReturnType<typeof loadClaudeSession>> | undefined
if (claudePath) {
  pendingClaude = await loadClaudeSession(claudePath)
  console.log(
    `\x1b[2m· loaded ${pendingClaude.messages.length} messages from ${claudePath} ·\x1b[0m\n`
  )
}

function buildAgent(): Agent {
  // Pass the loaded Claude session through (consumed once); the Agent's
  // own `start()` is idempotent so the loaded session-start is preserved.
  const session = pendingClaude
  pendingClaude = undefined

  const a = new Agent({
    model,
    permissions: { preset: "yolo" },
    prompt: [
      "You are a concise coding assistant.",
      "Use the available tools to answer questions about the project.",
      "Prefer fewer tool calls; batch independent reads in one turn when possible.",
    ],
    session,
    tools: [
      bashTool,
      editTool,
      fetchTool,
      readTool,
      searchTool,
      taskStopTool,
      taskListTool,
      taskPollTool,
      wakeupTool,
      writeTool,
      subagentTool,
    ],
  })

  a.on("stream-event", ({ event }) => {
    if (event.type === "reasoning-delta" && typeof event.delta === "string" && event.delta !== "") {
      if (mode !== "reasoning") {
        process.stdout.write("\n\x1b[2m· thinking ·\x1b[0m\n\x1b[2m")
        mode = "reasoning"
      }
      process.stdout.write(event.delta)
    }
    if (event.type === "text-delta" && typeof event.delta === "string" && event.delta !== "") {
      if (mode === "reasoning") process.stdout.write("\x1b[0m\n\n")
      mode = "text"
      process.stdout.write(event.delta)
    }
  })

  a.on("tool-call", ({ call }) => {
    resetMode()
    // Pull description out separately — it's intent ("why"), the rest is
    // the actual operation ("what"). Render on its own dim line above
    // the params so the user reads intent first, command second.
    const params = call.params as Record<string, unknown>
    const description = typeof params.description === "string" ? params.description : undefined
    const rest: Record<string, unknown> = { ...params }
    if (description) delete rest.description

    process.stdout.write(`\x1b[36m→ ${call.name}\x1b[0m\n`)
    if (description) process.stdout.write(`  \x1b[2m${description}\x1b[0m\n`)
    const json = JSON.stringify(rest)
    if (json !== "{}") {
      const preview = json.length > 200 ? `${json.slice(0, 197)}...` : json
      process.stdout.write(`  ${preview}\n`)
    }
  })

  a.on("tool-result", ({ call, result }) => {
    const icon = result.isError ? "\x1b[31m✗" : "\x1b[32m✓"
    let preview: string
    if (typeof result.content === "string") {
      preview = result.content.length > 200 ? `${result.content.slice(0, 197)}...` : result.content
    } else {
      const totalLen = result.content.reduce(
        (n, p) => n + (p.type === "text" ? p.text.length : 0),
        0
      )
      preview = `[${result.content.length} parts, ${totalLen} chars]`
    }
    const indented = preview.replaceAll(/^/gm, "  ")
    process.stdout.write(`${icon} ${call.name}\x1b[0m\n${indented}\n`)
  })

  a.on("step-end", ({ outcome }) => {
    resetMode()
    if (outcome !== "tool-calls") {
      process.stdout.write(`\n\x1b[2m[${outcome}]\x1b[0m\n`)
    }
  })

  // Debug: dump every committed message as JSON. Useful for diagnosing
  // streaming artefacts. Remove once stabilised.
  a.session.on("node", (e) => {
    if (e.node.type !== "message") return
    resetMode()
    const json = JSON.stringify(e.node.message, undefined, 2)
    process.stdout.write(`\n\x1b[2m── message [${e.node.message.role}] ──\x1b[0m\n${json}\n`)
  })

  a.on("stop", ({ reason, usage }) => {
    resetMode()
    const parts = [`stop: ${reason}`, `in ${usage.input}`, `out ${usage.output}`]
    if (usage.cacheRead) parts.push(`cache-read ${usage.cacheRead}`)
    if (usage.cacheWrite) parts.push(`cache-write ${usage.cacheWrite}`)
    process.stdout.write(`\n\x1b[2m[${parts.join(" · ")}]\x1b[0m\n`)
    // Surface the actual exception when the agent stopped with an error,
    // including the full stack — otherwise debugging stuck sessions is
    // a guessing game.
    if (reason === "error" && a.lastError) {
      const err = a.lastError
      process.stdout.write(`\x1b[31m${err.name}: ${err.message}\x1b[0m\n`)
      if (err.stack) process.stdout.write(`\x1b[2m${err.stack}\x1b[0m\n`)
      process.stdout.write(`\x1b[2m(type /reset to start a fresh session)\x1b[0m\n`)
    }
  })

  return a
}

let agent = buildAgent()

// ── REPL ─────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout })

// Ctrl-C: first press aborts the in-flight run; second press (within the
// same idle window) exits.
let pendingExit = false
const onSigint = (): void => {
  if (agent.status === "streaming" || agent.status === "running-tools") {
    process.stdout.write("\n\x1b[33m^C aborting current run…\x1b[0m\n")
    agent.abort()
    return
  }
  if (pendingExit) {
    process.stdout.write("\n\x1b[2m^C goodbye\x1b[0m\n")
    void cleanup().then(() => process.exit(0))
    return
  }
  pendingExit = true
  process.stdout.write("\n\x1b[2m(press Ctrl-C again to exit)\x1b[0m\n")
  setTimeout(() => {
    pendingExit = false
  }, 1500)
}
process.on("SIGINT", onSigint)

const cleanup = async (): Promise<void> => {
  rl.close()
  await agent.dispose()
}

console.log(
  `\x1b[2mInteractive — type a prompt and press enter. ` +
    `Ctrl-C to abort, Ctrl-D / "exit" to quit. /reset for fresh session.\x1b[0m\n`
)

for (;;) {
  // A wakeup (or task-done inject) may fire while we're blocked on
  // readline. The agent calls `run()` internally but we're not awaiting
  // it — the run floats, output prints, but the REPL never drains it.
  // Fix: any time the agent transitions from idle to streaming without
  // us having sent a message, re-attach by awaiting the existing run
  // promise before going back to the prompt.
  let input: string
  try {
    const inputPromise = rl.question("\x1b[36m›\x1b[0m ")
    // Race the prompt against an agent wake-up. If the agent starts
    // running on its own (wakeup / task-done), await it first, then
    // loop back and re-show the prompt.
    const agentStarted = new Promise<void>((resolve) => {
      const handler = ({ status }: { status: string }): void => {
        if (status === "streaming") {
          agent.off("status", handler)
          resolve()
        }
      }
      agent.on("status", handler)
    })
    const winner = await Promise.race([
      inputPromise.then((v) => ({ tag: "input", value: v }) as const),
      agentStarted.then(() => ({ tag: "agent" }) as const),
    ])
    if (winner.tag === "agent") {
      // Agent woke itself (wakeup / task-done). Wait for it to finish,
      // then loop back to show the prompt.
      rl.write("", { ctrl: true, name: "u" }) // clear partial input
      process.stdout.write("\n")
      await agent.waitIdle()
      continue
    }
    input = winner.value.trim()
  } catch {
    break
  }
  if (input === "") continue
  if (/^(exit|quit|\/q)$/i.test(input)) break
  if (/^\/reset$/i.test(input)) {
    process.stdout.write("\x1b[2m· disposing agent and starting fresh ·\x1b[0m\n")
    await agent.dispose()
    agent = buildAgent()
    continue
  }

  agent.send({ content: input, role: "user" })
  // `waitIdle` over `await agent.run()`: tolerates concurrent
  // harness-driven runs (wakeup / task-done) — the user's send may
  // queue into an already-running cycle, and waitIdle awaits whichever
  // promise the loop is on.
  await agent.waitIdle()
}

await cleanup()
