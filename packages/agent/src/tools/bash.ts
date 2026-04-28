import type { MetaPart, Streamable, TextPart, ToolResult } from "@zaly/ai"

import { defineTool, formatToolError, ToolError } from "@zaly/ai"
import { Spawn } from "@zaly/shared"
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { appendFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { Type } from "typebox"
import { summarizeOutput } from "../utils/output.ts"

/**
 * Run a bash command and capture its output.
 *
 * Lifecycle is fully owned by the Tasks harness:
 *
 *  - The tool returns a `Streamable` immediately. Tasks races its `done`
 *    against a grace window. Sub-grace commands appear synchronous to the
 *    model; longer ones promote to a background task and the model gets
 *    a partial snapshot now plus a system-message completion later.
 *  - `task_wait` lets the model block on a still-running bash; `task_kill`
 *    aborts one. (No more bash_wait / bash_kill — the generic surface
 *    covers it.)
 *  - `timeout` is now a real kill deadline. The Spawn aborts itself when
 *    it elapses; the streamable's `done` resolves with `killReason: "timeout"`
 *    in the snapshot. Defaults to 10 minutes (long enough for builds, tests,
 *    installs); pass shorter for tighter deadlines.
 *
 * Output truncation — large outputs are summarised inline as head + tail
 * (~100 lines each) and the full bytes are written to a per-spawn log
 * file under `tmpdir()/zaly-bash/`. The response surfaces
 * `truncated.fullOutputPath`; the model can `read({ path })` to dig deeper.
 *
 * Binary output — refused. Bash isn't an image-extraction tool;
 * pointing it at `cat image.png` returns a `BINARY_OUTPUT` error
 * advising the read tool instead.
 *
 * Cancellation — `ctx.signal` (agent abort) propagates to the spawn.
 * `task_kill(id)` calls the streamable's `abort()`, which aborts the spawn.
 */
const DEFAULT_TIMEOUT_MS = 600_000 // 10 min — real kill deadline
const DEFAULT_MAX_BUFFER = 5 * 1024 * 1024 // 5 MB

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const bashTool = defineTool({
  name: "bash",
  desc:
    "Run a bash command. Returns its output once the command exits, or a " +
    "partial snapshot if the command is still running after the harness's " +
    "grace window — in that case the eventual result arrives as a system " +
    "message. Use `task_wait` to block on a long-running shell, `task_kill` " +
    "to terminate one. `timeout` is a real kill deadline (default 10 min).",
  params: Type.Object({
    command: Type.String({ description: "The shell command to run, evaluated by `bash -c`." }),
    description: Type.String({
      description:
        "Short, human-readable description of what this command does. " +
        "Shown to the user in the TUI alongside the command. Keep it under " +
        "~10 words. Don't restate the command itself — describe the intent " +
        '(e.g. "check the test suite passes", not "run bun test").',
    }),
    timeout: Type.Optional(
      Type.Integer({
        description: `Kill deadline in ms. Default ${DEFAULT_TIMEOUT_MS} (10 min). The process IS killed when this elapses (SIGTERM → SIGKILL).`,
        minimum: 1,
      })
    ),
  }),

  call(args, ctx): Streamable {
    const cwd = ctx.cwd ?? process.cwd()
    const timeout = args.timeout ?? DEFAULT_TIMEOUT_MS
    const startedAt = Date.now()
    const logPath = allocateLogPath()

    const proc = new Spawn("bash", ["-c", args.command], {
      cwd,
      maxBuffer: DEFAULT_MAX_BUFFER,
      signal: ctx.signal,
      timeout,
    })

    // Tail to the log file in arrival order. Best-effort — disk pressure
    // shouldn't kill the spawn, just stop growing the log.
    void tailToFile(proc, logPath)

    const cursor = { combined: 0 }

    return {
      abort: () => {
        if (!proc.done) proc.abort({ delay: 5000 })
      },
      done: proc.result.then(
        () => undefined,
        () => undefined
      ),
      // Non-consuming check used by heartbeats: is there incremental
      // output the model hasn't seen since the last `poll()`? Lets the
      // heartbeat flag this task with `*new*` without advancing the
      // cursor (which would consume the bytes for any later poll).
      hasNew: () => proc.combined.length > cursor.combined,
      poll: () => snapshot({ cursor, logPath, proc, startedAt }),
    }
  },
})

// ── Internals ─────────────────────────────────────────────────────────

interface SnapshotOpts {
  proc: Spawn
  startedAt: number
  logPath: string
  cursor: { combined: number }
}

/** Build the current `ToolResult` snapshot for a running or exited bash
 *  command. Slices incremental output since the last poll, summarises
 *  it head+tail, and stamps a `<bash>` MetaPart with status info. */
function snapshot({ proc, startedAt, logPath, cursor }: SnapshotOpts): ToolResult & {
  running: boolean
} {
  // Slice incremental combined output since the cursor and advance.
  const buf = proc.combined.subarray(cursor.combined)
  cursor.combined += buf.length

  const summary = summarizeOutput(buf, { logPath })

  if ("binary" in summary) {
    return {
      ...formatBinaryError(summary.bytes, logPath),
      running: false,
    }
  }

  const status: "exited" | "running" = proc.done ? "exited" : "running"
  const meta: Record<string, unknown> = {
    durationMs: Date.now() - startedAt,
    status,
  }
  if (status === "exited") {
    meta.code = proc.exitCode ?? -1
    if (proc.killReason) meta.killReason = proc.killReason
  }
  if (summary.truncated) {
    meta.truncated = { fullOutputPath: logPath, totalLines: summary.totalLines }
  }

  const parts: (MetaPart | TextPart)[] = [{ data: meta, tag: "bash", type: "meta" }]
  if (summary.text !== "") parts.push({ text: summary.text, type: "text" })

  return {
    content: parts,
    isError: false,
    running: !proc.done,
  }
}

/** Build a ToolResult for the binary-output error case. Routes through
 *  `formatToolError` so the result picks up the standard `<error>` MetaPart
 *  + formatted text body — same shape as any other tool error. The `read`
 *  hint in the message points at the on-disk log so the model can pipe
 *  it through a text-converting command if it actually needs the bytes. */
function formatBinaryError(bytes: number, logPath: string): ToolResult {
  return formatToolError(
    new ToolError({
      code: "BINARY_OUTPUT",
      data: { bytes, logPath },
      message:
        `bash command produced binary output (${bytes} bytes). ` +
        `bash is not an image-extraction tool — use \`read\` on ${logPath} ` +
        `if you need to inspect the bytes, or pipe through a text-converting ` +
        `command (xxd, base64, file, etc.) and re-run.`,
    })
  )
}

/** Allocate a log path under a session-scoped tmp dir. The dir is shared
 *  across bash calls in the same process (cheap mkdir is idempotent), so
 *  cleanup is the agent harness's concern at the OS level — we don't
 *  delete files ourselves. */
let sessionDir: string | undefined
function allocateLogPath(): string {
  if (sessionDir === undefined) {
    sessionDir = join(tmpdir(), `zaly-bash-${shortId(8)}`)
    mkdirSync(sessionDir, { recursive: true })
  }
  const path = join(sessionDir, `bash-${shortId(6)}.log`)
  // Touch the file so a concurrent reader can stat it before output lands.
  writeFileSync(path, "")
  return path
}

async function tailToFile(proc: Spawn, logPath: string): Promise<void> {
  try {
    for await (const event of proc.stream()) {
      if (event.type === "stdout" || event.type === "stderr") {
        await appendFile(logPath, event.data).catch(() => undefined)
      }
    }
  } catch {
    /* stream rejected (spawn ENOENT etc.) — log just stops growing */
  }
}

function shortId(len: number): string {
  return createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, len)
}
