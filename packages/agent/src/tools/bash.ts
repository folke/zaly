import type { MetaPart, Streamable, TextPart, ToolResult } from "@zaly/ai"

import { AiError, defineTool, toErrorResult } from "@zaly/ai"
import { bufferedTailStream, normPath, randomHash, Spawn, TextStream } from "@zaly/shared"
import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { Type } from "typebox"
import { summarizeOutput } from "../utils/output.ts"

export type BashTool = typeof bashTool

/**
 * Run a bash command and capture its output.
 *
 * Lifecycle is fully owned by the Tasks harness:
 *
 *  - The tool returns a `Streamable` immediately. Tasks races its `done`
 *    against a grace window. Sub-grace commands appear synchronous to the
 *    model; longer ones promote to a background task and the model gets
 *    a partial snapshot now plus a system-message completion later.
 *  - `task_wait` lets the model block on a still-running bash; `task_stop`
 *    aborts one. (No more bash_wait / bash_kill — the generic surface
 *    covers it.)
 *  - `timeout` is now a real kill deadline. The Spawn aborts itself when
 *    it elapses; the streamable's `done` resolves with `killReason: "timeout"`
 *    in the snapshot. Defaults to 10 minutes (long enough for builds, tests,
 *    installs); pass shorter for tighter deadlines.
 *
 * Output truncation — large outputs are summarised inline as head + tail
 * (split from `max_lines`). Only when truncation actually fires does
 * the tool flush the captured bytes to a per-spawn log file under
 * `tmpdir()/zaly-bash/` and surface `truncated.fullOutputPath`; small
 * outputs that fit inline never touch disk. The model can `read({ path })`
 * the surfaced log to inspect the full bytes.
 *
 * Binary output — refused. Bash isn't an image-extraction tool;
 * pointing it at `cat image.png` returns a `BINARY_OUTPUT` error
 * advising the read tool instead.
 *
 * Cancellation — `ctx.signal` (agent abort) propagates to the spawn.
 * `task_stop(id)` calls the streamable's `abort()`, which aborts the spawn.
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
    "message. Use `task_wait` to block on a long-running shell, `task_stop` " +
    "to terminate one. `timeout` is a real kill deadline.",
  params: Type.Object({
    command: Type.String({ description: "The shell command to run, evaluated by `bash -c`." }),
    description: Type.String({
      description:
        "Short, human-readable description of what this command does. " +
        "Shown to the user in the TUI alongside the command. Keep it under " +
        "~10 words. Don't restate the command itself — describe the intent " +
        '(e.g. "check the test suite passes", not "run bun test").',
    }),
    max_lines: Type.Integer({
      default: 200,
      description:
        "Cap on lines kept inline in the result. Split as head + tail " +
        "(half each). Lower for commands you only need pass/fail on " +
        "(`max_lines: 20`); raise when middle output matters. Output " +
        "above the cap is elided in the inline result, but the full " +
        "log is always written to disk and surfaced as " +
        "`truncated.fullOutputPath` — `read` it if you need to dig deeper.",
      minimum: 10,
    }),
    timeout: Type.Integer({
      default: DEFAULT_TIMEOUT_MS,
      description:
        "Kill deadline in ms. The process IS killed when this elapses (SIGTERM → SIGKILL).",
      minimum: 1,
    }),
  }),

  async call(args, ctx): Promise<Streamable> {
    // Permission gate. The bash handler validates the parsed command
    // (segments, redirects, sensitive paths) and composes file-scope
    // checks for any redirect targets via `ctx.validate`.
    await ctx.need?.("bash", args.command)
    const cwd = normPath(ctx.cwd)
    const timeout = args.timeout
    const startedAt = Date.now()
    const half = Math.floor(args.max_lines / 2)

    // Buffer in memory; only flip to disk if a snapshot reports the
    // output exceeded the inline cap.
    const { stream, startTailing } = bufferedTailStream(new TextStream())
    const logState: { path?: string } = {}
    const ensureLog = (): string => {
      if (!logState.path) {
        logState.path = allocateLogPath()
        startTailing(logState.path)
      }
      return logState.path
    }

    const proc = new Spawn("bash", ["-c", args.command], {
      cwd,
      maxBuffer: DEFAULT_MAX_BUFFER,
      signal: ctx.signal,
      stderr: stream,
      stdout: stream,
      timeout,
    })

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
      hasNew: () => proc.stdout.length > cursor.combined,
      poll: () => snapshot({ cursor, ensureLog, head: half, proc, startedAt, tail: half }),
    }
  },
})

// ── Internals ─────────────────────────────────────────────────────────

interface SnapshotOpts {
  proc: Spawn<string, string>
  startedAt: number
  /** Lazily allocate the log path on first call — flips
   *  bufferedTailStream into tailing mode so subsequent chunks land on
   *  disk too. Idempotent. */
  ensureLog: () => string
  head: number
  tail: number
  cursor: { combined: number }
}

/** Build the current `ToolResult` snapshot for a running or exited bash
 *  command. Slices incremental output since the last poll, summarises
 *  it head+tail, and stamps a `<bash>` MetaPart with status info. */
function snapshot({
  proc,
  startedAt,
  ensureLog,
  head,
  tail,
  cursor,
}: SnapshotOpts): ToolResult & { running: boolean } {
  // Slice incremental combined output since the cursor and advance.
  const buf = proc.stdout.slice(cursor.combined)
  cursor.combined += buf.length

  // Pass `logPath` to summarizeOutput only when truncation actually
  // happens — at which point ensureLog() materializes the file and
  // bufferedTailStream replays the buffered bytes to disk.
  const summary = summarizeOutput(buf, { head, tail })

  if ("binary" in summary) {
    return {
      ...formatBinaryError(summary.bytes, ensureLog()),
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
    const path = ensureLog()
    meta.truncated = { fullOutputPath: path, totalLines: summary.totalLines }
    // Re-summarize with the path so the elision marker can point at it.
    const withPath = summarizeOutput(buf, { head, logPath: path, tail })
    if (!("binary" in withPath)) summary.text = withPath.text
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
 *  `toErrorResult` so the result picks up the standard `<error>` MetaPart
 *  + formatted text body — same shape as any other tool error. The `read`
 *  hint in the message points at the on-disk log so the model can pipe
 *  it through a text-converting command if it actually needs the bytes. */
function formatBinaryError(bytes: number, logPath: string): ToolResult {
  return toErrorResult(
    new AiError({
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
 *  delete files ourselves. The file itself is created lazily by the
 *  writer when bufferedTailStream flushes; no need to touch it here. */
let sessionDir: string | undefined
function allocateLogPath(): string {
  if (sessionDir === undefined) {
    sessionDir = join(tmpdir(), `zaly-bash-${randomHash()}`)
    mkdirSync(sessionDir, { recursive: true })
  }
  return join(sessionDir, `bash-${randomHash()}.log`)
}
