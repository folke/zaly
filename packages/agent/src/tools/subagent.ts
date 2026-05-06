import type { MetaPart, Streamable, TextPart, ToolResult } from "@zaly/ai"

import { defineTool, stringifyContent, AiError } from "@zaly/ai"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { Type } from "typebox"
import { uuidv7 } from "../utils/uuid.ts"

/**
 * Spawn a subagent — a fresh `Agent` instance running on the same model
 * with the same permissions, given a focused task and a curated tool
 * list (the parent's, minus the subagent tool itself when the child
 * would otherwise hit `maxDepth`).
 *
 * Returns a Streamable so the harness's existing grace-window machinery
 * promotes long-running subagents to background tasks: the parent gets a
 * placeholder, the model sees task-list / heartbeat updates, and the
 * final assistant message lands as a `task-done` system inject when the
 * child stops naturally.
 *
 * Persistence: each subagent gets its own JSONL session file under
 * `tmpdir`, keyed by id. The final `<subagent>` MetaPart references the
 * path so the parent can re-load the full conversation if it needs more
 * than the surface answer.
 *
 * Auth: the spawned `Agent` shares the parent's `PermissionManager`
 * instance — same workspaces, same rules. (We don't deep-copy yet; if a
 * subagent legitimately needs a tighter scope, that's a future option.)
 */

interface SubagentMeta {
  id: string
  depth: number
  durationMs?: number
  sessionPath: string
  /** Lifecycle state — visible to the model in the `<subagent>` MetaPart
   *  so it can tell a partial running snapshot apart from a final
   *  answer. `running` snapshots accompany text that's still streaming;
   *  `done` snapshots carry the final assistant message. */
  status: "running" | "done"
  /** Stop reason when the child has finished — `"natural"` for a clean
   *  finish, anything else surfaces in the parent's `<subagent>` block
   *  so the model can see *why* the answer might be incomplete. */
  stop?: string
  /** Aggregate token usage across the child's whole run. */
  usage?: { input: number; output: number }
}

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const subagentTool = defineTool({
  name: "subagent",
  desc:
    "Spawn a focused subagent with the same model and permissions. Use " +
    "for tasks that benefit from a clean context window: deep code " +
    "exploration, multi-step research, or anything where dragging the " +
    "intermediate steps through your own context would be expensive. The " +
    "subagent's final answer comes back as the result; full transcript is " +
    "available at the returned `sessionPath` if you need more detail.",
  parallel: true,
  params: Type.Object({
    description: Type.String({
      description:
        "Short description of what the subagent should do. Shown to the " +
        "user in the TUI. Keep under ~10 words.",
    }),
    prompt: Type.String({
      description:
        "System prompt for the subagent — defines its role and constraints. " +
        "The subagent does NOT inherit your system prompt; spell out what " +
        "it needs to know.",
    }),
    task: Type.String({
      description:
        "The actual task the subagent should perform, as if you were sending " +
        "it as a user message. Be specific about the deliverable.",
    }),
  }),

  async call(args, ctx): Promise<Streamable> {
    const parent = ctx.agent
    if (!parent) {
      throw new AiError({
        code: "MISSING_TOOL_CONTEXT",
        message:
          "subagent requires an Agent reference on the context (set up by the agent harness).",
      })
    }

    const id = uuidv7()
    const sessionPath = join(tmpdir(), `zaly-subagent-${id}.jsonl`)
    const startedAt = Date.now()

    // `parent.child(...)` handles all the inheritance — cwd, model,
    // permissions, depth + 1, tool list (incl. the loaded skill tool),
    // and the `subagent`-tool filtering at the depth cap.
    const child = await parent.child({
      prompt: [args.prompt],
      session: { path: sessionPath },
    })
    const depth = child.depth

    // Cursor over the child's running text so `poll()` returns only
    // what's new since the last call (mirrors the bash-tool pattern).
    let textBuffer = ""
    let cursor = 0
    let finalResult: ToolResult | undefined
    let stopReason: string | undefined

    child.on("stream-event", ({ event }) => {
      if (event.type === "text-delta" && typeof event.delta === "string") {
        textBuffer += event.delta
      }
    })
    child.on("stop", ({ reason }) => {
      stopReason = reason
    })

    child.send({ content: args.task, role: "user" })
    const runDone = child.run().catch((error: unknown) => {
      stopReason = "error"
      throw error
    })

    const buildMeta = (running: boolean): SubagentMeta => ({
      depth,
      durationMs: Date.now() - startedAt,
      id,
      sessionPath,
      status: running ? "running" : "done",
      stop: stopReason,
      usage: { input: child.totalUsage.input, output: child.totalUsage.output },
    })

    /** Pull the last assistant text out of the child's session — the
     *  user-visible "answer." Falls back to whatever's accumulated in the
     *  text buffer if the assistant hasn't committed a message yet. */
    const finalText = (): string => {
      for (let i = child.messages.length - 1; i >= 0; i--) {
        const m = child.messages[i]
        if (m.role !== "assistant") continue
        // Assistant content shape excludes Attachment, so it's compatible
        // with `stringifyContent` (which accepts plain Content).
        const text = stringifyContent(m.content as never).trim()
        if (text !== "") return text
      }
      return textBuffer.trim()
    }

    const buildResult = (running: boolean): ToolResult & { running: boolean } => {
      if (!running && finalResult) return { ...finalResult, running: false }

      const meta = buildMeta(running)
      // Live snapshot: emit the meta + only the *new* text since last poll
      // (advancing the cursor), matching the bash tool's increment-poll
      // semantic. The full text is reachable via the session file.
      const slice = textBuffer.slice(cursor)
      cursor = textBuffer.length

      // The generic "still running, more is coming" notice lives one
      // layer up in `Tasks.#buildPart` (added as a `<task>` MetaPart
      // trailer). Keep this snapshot focused on subagent-specific data
      // — the `<subagent>` envelope + the latest text slice.
      const parts: (MetaPart | TextPart)[] = [{ data: meta, tag: "subagent", type: "meta" }]
      if (running) {
        if (slice !== "") parts.push({ text: slice, type: "text" })
      } else {
        const answer = finalText()
        if (answer !== "") parts.push({ text: answer, type: "text" })
      }
      return { content: parts, isError: false, running }
    }

    return {
      abort: () => {
        child.abort()
      },
      done: runDone.then(
        async () => {
          // Flush + close the JSONL writer so the file is fully on disk
          // by the time the parent reads `sessionPath`.
          await child.session.close()
          finalResult = buildResult(false)
        },
        async (error: unknown) => {
          // Surface the error as a subagent result with isError: true.
          // Don't reject the `done` promise — the harness's contract is
          // "completion is a final snapshot, not a throw."
          stopReason ??= "error"
          await child.session.close().catch(() => undefined)
          const meta = buildMeta(false)
          const message = error instanceof Error ? error.message : String(error)
          finalResult = {
            content: [
              { data: meta, tag: "subagent", type: "meta" },
              { text: `subagent failed: ${message}`, type: "text" },
            ],
            isError: true,
          }
        }
      ),
      hasNew: () => textBuffer.length > cursor,
      poll: () => buildResult(child.status !== "idle" && child.status !== "paused"),
    }
  },
})

declare module "@zaly/ai" {
  interface ToolMeta {
    subagent?: SubagentMeta
  }
}
