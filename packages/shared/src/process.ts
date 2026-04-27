/**
 * Process-spawning primitive: a `Spawn` class that holds a child process
 * handle and exposes both buffered (`result`) and streaming (`stream()`)
 * consumption, plus direct control (`kill`, `write`).
 *
 * Used by tools that shell out (bash, lightpanda, formatter integrations)
 * and by the TUI's clipboard layer.
 *
 * Design:
 *   - Eager start: `new Spawn(cmd, args, opts)` spawns immediately.
 *   - **Buffered + streaming coexist.** stdout/stderr are accumulated
 *     internally regardless of whether anyone is streaming, so `result`
 *     always returns a complete summary even for streamed processes.
 *   - **`stream()` is broadcast.** Multiple iterators can subscribe; each
 *     gets its own copy of every event from the moment it subscribed.
 *     Late subscribers don't replay earlier chunks but always see at
 *     least the `exit` event.
 *   - Non-zero exit is **not** an error; callers branch on `code`. Spawn
 *     errors (ENOENT etc.) reject `result` and abort `stream()` iterators.
 *   - `signal` (AbortSignal), `timeout`, and `maxBuffer` overflow all
 *     terminate via SIGTERM and set `killed: true`.
 *
 * Conveniences (`spawnText`, `spawnWithInput`) wrap `Spawn` for the
 * common one-shot cases. `which` and `isSSH` are unrelated environment
 * helpers kept here for the same "things that talk to the OS" theme.
 */
import type { ChildProcess, SpawnOptions } from "node:child_process"

import { spawn as nodeSpawn } from "node:child_process"
import { delimiter, join } from "pathe"
import { platform } from "node:process"
import { safeStat } from "./utils.ts"

export interface SpawnOpts {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Piped to the child's stdin and closed. To keep stdin open for
   *  `proc.write(...)` calls, omit this and instead opt-in via
   *  `keepStdinOpen: true`. */
  stdin?: Buffer | string
  /** Keep stdin open after construction so `proc.write()` can append. */
  keepStdinOpen?: boolean
  /** Kill if the process runs longer than this (ms). */
  timeout?: number
  /** Abort signal for cancellation. */
  signal?: AbortSignal
  /** Cap on combined stdout+stderr bytes; kill on overflow. Default: no cap. */
  maxBuffer?: number
  /** Run via shell. Default false; enable when `cmd` contains metachars. */
  shell?: boolean
}

/** Why the process was killed.
 *
 *   - `"timeout"`   — `opts.timeout` fired
 *   - `"abort"`     — `opts.signal` aborted
 *   - `"maxBuffer"` — combined stdout+stderr exceeded `opts.maxBuffer`
 *   - `"manual"`    — `proc.kill()` or `proc.abort()` called by user code
 *
 * The first reason wins — if a timeout fires and the user also calls
 * `kill()` while the escalation is in flight, `killReason` stays
 * `"timeout"`. */
export type KillReason = "timeout" | "abort" | "maxBuffer" | "manual"

export interface SpawnResult {
  code: number
  /** Termination signal name, when the process was killed by one. */
  signal?: NodeJS.Signals
  stdout: Buffer
  stderr: Buffer
  /** True when terminated by timeout, abort, maxBuffer overflow, or
   *  explicit `proc.kill()` / `proc.abort()`. */
  killed: boolean
  /** Why the process was killed. Present only when `killed === true`. */
  killReason?: KillReason
}

export type SpawnEvent =
  | { type: "stdout"; data: Buffer }
  | { type: "stderr"; data: Buffer }
  | {
      type: "exit"
      code: number
      signal?: NodeJS.Signals
      killed: boolean
      killReason?: KillReason
    }

interface Subscriber {
  push: (event: SpawnEvent) => void
  finish: () => void
}

/**
 * A live child-process handle. Construct it; consume via `await
 * proc.result` (buffered) or `for await (const ev of proc.stream())`
 * (live chunks); control via `proc.kill()` / `proc.write()`.
 *
 * Both consumption modes are available simultaneously — the bash tool
 * uses this to stream output to the TUI while the agent awaits the
 * final buffered result for the model.
 */
export class Spawn {
  readonly child: ChildProcess
  readonly #stdoutChunks: Buffer[] = []
  readonly #stderrChunks: Buffer[] = []
  /** stdout + stderr chunks in arrival order — for terminal-shaped
   *  output where the consumer wants the experience of running the
   *  command at a shell prompt rather than the streams split. */
  readonly #combinedChunks: Buffer[] = []
  readonly #subscribers = new Set<Subscriber>()

  #buffered = 0
  #killed = false
  #killReason?: KillReason
  #exited = false
  #exitEvent?: SpawnEvent & { type: "exit" }
  #spawnError?: Error
  #timer?: NodeJS.Timeout
  #escalationTimer?: NodeJS.Timeout
  #onAbort?: () => void
  #resultPromise?: Promise<SpawnResult>

  /** Default delay between SIGTERM and SIGKILL when escalating via
   *  `abort()`. Tunable per-call via `abort({ delay })`. */
  static DEFAULT_ABORT_DELAY = 5000

  constructor(
    readonly cmd: string,
    readonly args: readonly string[] = [],
    readonly opts: SpawnOpts = {}
  ) {
    if (opts.signal?.aborted) throw abortError()

    const stdio: SpawnOptions["stdio"] = [
      opts.stdin === undefined && !opts.keepStdinOpen ? "ignore" : "pipe",
      "pipe",
      "pipe",
    ]
    this.child = nodeSpawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      shell: opts.shell ?? false,
      stdio,
    })

    if (opts.signal) {
      this.#onAbort = (): void => this.#escalateKill("abort")
      opts.signal.addEventListener("abort", this.#onAbort, { once: true })
    }
    if (opts.timeout !== undefined && opts.timeout > 0) {
      this.#timer = setTimeout(() => this.#escalateKill("timeout"), opts.timeout)
    }

    this.child.stdout?.on("data", (data: Buffer) => {
      this.#stdoutChunks.push(data)
      this.#combinedChunks.push(data)
      this.#emit({ data, type: "stdout" })
      if (opts.maxBuffer !== undefined) {
        this.#buffered += data.length
        if (this.#buffered > opts.maxBuffer) this.#escalateKill("maxBuffer")
      }
    })
    this.child.stderr?.on("data", (data: Buffer) => {
      this.#stderrChunks.push(data)
      this.#combinedChunks.push(data)
      this.#emit({ data, type: "stderr" })
      if (opts.maxBuffer !== undefined) {
        this.#buffered += data.length
        if (this.#buffered > opts.maxBuffer) this.#escalateKill("maxBuffer")
      }
    })

    this.child.once("error", (error) => {
      this.#spawnError = error
      this.#cleanup()
      this.#emitExit({
        code: -1,
        killReason: this.#killReason,
        killed: this.#killed,
        type: "exit",
      })
    })

    this.child.once("close", (code, signal) => {
      this.#cleanup()
      this.#emitExit({
        code: code ?? -1,
        killReason: this.#killReason,
        killed: this.#killed,
        signal: signal ?? undefined,
        type: "exit",
      })
    })

    if (opts.stdin !== undefined && this.child.stdin) {
      this.child.stdin.end(opts.stdin)
    }
  }

  // ── State ──────────────────────────────────────────────────────────

  get pid(): number | undefined {
    return this.child.pid
  }
  get exitCode(): number | undefined {
    return this.#exitEvent?.code
  }
  get signal(): NodeJS.Signals | undefined {
    return this.#exitEvent?.signal
  }
  get killed(): boolean {
    return this.#killed
  }
  get killReason(): KillReason | undefined {
    return this.#killReason
  }
  get done(): boolean {
    return this.#exited
  }

  /** Snapshot of stdout accumulated so far. Always returns the full
   *  buffer (cumulative since spawn) — for incremental "since last
   *  call" semantics, callers track their own offset and slice. */
  get stdout(): Buffer {
    return Buffer.concat(this.#stdoutChunks)
  }
  /** Snapshot of stderr accumulated so far. See `stdout`. */
  get stderr(): Buffer {
    return Buffer.concat(this.#stderrChunks)
  }
  /** Snapshot of stdout+stderr in arrival order — what the user would
   *  see running the command at a shell prompt. Loses stream-of-origin
   *  info; for that, use `stdout`/`stderr` separately. */
  get combined(): Buffer {
    return Buffer.concat(this.#combinedChunks)
  }

  // ── Result (buffered) ──────────────────────────────────────────────

  /** Promise resolving to the final `SpawnResult` once the child exits.
   *  Memoized — multiple `await proc.result` reads share one promise. */
  get result(): Promise<SpawnResult> {
    return (this.#resultPromise ??= this.#buildResultPromise())
  }

  #buildResultPromise(): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
      const finish = (): void => {
        if (this.#spawnError) {
          reject(this.#spawnError)
          return
        }
        const exit = this.#exitEvent
        resolve({
          code: exit?.code ?? -1,
          killReason: this.#killReason,
          killed: this.#killed,
          signal: exit?.signal,
          stderr: Buffer.concat(this.#stderrChunks),
          stdout: Buffer.concat(this.#stdoutChunks),
        })
      }
      if (this.#exited) {
        finish()
        return
      }
      // Subscribe a one-shot for the exit event. Don't add to the public
      // subscriber set — this is internal bookkeeping, not a stream.
      const sub: Subscriber = {
        finish,
        push: (event) => {
          if (event.type === "exit") {
            this.#subscribers.delete(sub)
            finish()
          }
        },
      }
      this.#subscribers.add(sub)
    })
  }

  // ── Stream (live) ──────────────────────────────────────────────────

  /** Async iterator of stdout/stderr chunks + a final `exit` event.
   *  Multiple concurrent `stream()` consumers each get an independent
   *  iterator — events broadcast to all of them. Late subscribers join
   *  mid-flight and will at least receive the `exit` event. */
  async *stream(): AsyncGenerator<SpawnEvent> {
    const queue: SpawnEvent[] = []
    let resolveNext: ((e: SpawnEvent | undefined) => void) | undefined
    let done = false

    const sub: Subscriber = {
      finish: () => {
        done = true
        if (resolveNext) {
          const r = resolveNext
          resolveNext = undefined
          r(undefined)
        }
      },
      push: (event) => {
        if (resolveNext) {
          const r = resolveNext
          resolveNext = undefined
          r(event)
        } else {
          queue.push(event)
        }
      },
    }

    // Late subscriber: process already exited. Replay just the exit
    // event so the iterator terminates cleanly without a hang.
    if (this.#exited) {
      if (this.#exitEvent) yield this.#exitEvent
      if (this.#spawnError) throw this.#spawnError
      return
    }

    this.#subscribers.add(sub)
    try {
      for (;;) {
        if (queue.length > 0) {
          yield queue.shift() as SpawnEvent
          continue
        }
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- mutated by closure
        if (done) break
        // oxlint-disable-next-line no-await-in-loop -- intentional: serial chunk delivery
        const next = await new Promise<SpawnEvent | undefined>((r) => {
          resolveNext = r
        })
        if (next === undefined) break
        yield next
      }
      if (this.#spawnError) throw this.#spawnError
    } finally {
      this.#subscribers.delete(sub)
    }
  }

  // ── Control ────────────────────────────────────────────────────────

  /** Send a signal to the child. Default SIGTERM. Single-shot — does
   *  not escalate to SIGKILL if the process ignores the signal. Use
   *  `abort()` when you need the process to actually die.
   *
   *  Sets `killed: true` and (if not already set) `killReason: "manual"`. */
  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    this.#sendKill("manual", signal)
  }

  /** Force the process to terminate. Sends SIGTERM first; if the
   *  process is still alive after `delay` ms, escalates to SIGKILL.
   *
   *  Use this — not `kill()` — when you don't want to leave a stray
   *  process behind (e.g. a bash command that ignores SIGTERM, a
   *  spawned shell holding child processes hostage).
   *
   *  Sets `killReason: "manual"` if not already set; internal triggers
   *  (timeout, abort signal, maxBuffer) bypass this and set their own
   *  reason. */
  abort(opts: { delay?: number } = {}): void {
    this.#escalateKill("manual", opts.delay)
  }

  /** Internal: send a single signal, recording the kill reason on the
   *  first invocation only (so timeout-then-manual-kill keeps reading
   *  as "timeout" — the cause that mattered). */
  #sendKill(reason: KillReason, signal: NodeJS.Signals): void {
    if (this.#exited) return
    this.#killed = true
    this.#killReason ??= reason
    try {
      this.child.kill(signal)
    } catch {
      /* already gone */
    }
  }

  /** Internal: SIGTERM + scheduled SIGKILL. Used by all the automatic
   *  trigger paths (timeout, abort signal, maxBuffer overflow) and by
   *  the public `abort()`. */
  #escalateKill(reason: KillReason, delay = Spawn.DEFAULT_ABORT_DELAY): void {
    if (this.#exited) return
    this.#sendKill(reason, "SIGTERM")
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- mutated by close handler
    if (this.#exited || this.#escalationTimer !== undefined) return
    this.#escalationTimer = setTimeout(() => {
      this.#escalationTimer = undefined
      if (this.#exited) return
      try {
        this.child.kill("SIGKILL")
      } catch {
        /* already gone */
      }
    }, delay)
    // Don't keep the event loop alive just for this timer — if the
    // process exits cleanly before the deadline, we don't care.
    this.#escalationTimer.unref()
  }

  /** Append data to the child's stdin. Requires `keepStdinOpen: true`
   *  (or `stdin` set in opts — but in that case stdin is already closed
   *  by the constructor). No-op after `closeStdin()` or exit. */
  write(data: Buffer | string): void {
    if (this.#exited || !this.child.stdin || this.child.stdin.writableEnded) return
    this.child.stdin.write(data)
  }

  /** Close the child's stdin. Useful when paired with `keepStdinOpen`. */
  closeStdin(): void {
    if (!this.child.stdin || this.child.stdin.writableEnded) return
    this.child.stdin.end()
  }

  // ── Internals ──────────────────────────────────────────────────────

  #emit(event: SpawnEvent): void {
    for (const sub of this.#subscribers) sub.push(event)
  }

  #emitExit(event: SpawnEvent & { type: "exit" }): void {
    if (this.#exited) return
    this.#exited = true
    this.#exitEvent = event
    this.#emit(event)
    for (const sub of this.#subscribers) sub.finish()
  }

  #cleanup(): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = undefined
    if (this.#escalationTimer) clearTimeout(this.#escalationTimer)
    this.#escalationTimer = undefined
    if (this.opts.signal && this.#onAbort) {
      this.opts.signal.removeEventListener("abort", this.#onAbort)
    }
  }
}

// ── Convenience wrappers ──────────────────────────────────────────────

/** Spawn a process and return its stdout as a UTF-8 string. Returns
 *  `undefined` on non-zero exit, empty stdout, or spawn failure — all
 *  surfaces collapse to "no usable output". */
export async function spawnText(
  cmd: string,
  args: readonly string[] = [],
  opts: SpawnOpts = {}
): Promise<string | undefined> {
  try {
    const r = await new Spawn(cmd, args, opts).result
    if (r.code !== 0) return undefined
    const text = r.stdout.toString("utf8")
    return text === "" ? undefined : text
  } catch {
    return undefined
  }
}

/** Spawn a process, pipe `input` to its stdin, and resolve to whether
 *  it exited cleanly. Common case: pipe text to a clipboard writer. */
export async function spawnWithInput(
  cmd: string,
  args: readonly string[],
  input: string
): Promise<boolean> {
  try {
    const r = await new Spawn(cmd, args, { stdin: input }).result
    return r.code === 0
  } catch {
    return false
  }
}

// ── Environment helpers ────────────────────────────────────────────────

/** PATH probe — returns the resolved absolute path of an executable,
 *  or `undefined` when not found. Truthy check works for the
 *  "is X installed?" use case (`if (which("rg")) …`); the path itself
 *  is useful for spawning the exact binary or showing the user where
 *  a tool was resolved.
 *
 *  Synchronous and avoids spawning a subprocess (no `command -v` /
 *  `where` shell-out). Iterates `PATH`, stats each candidate, and
 *  checks the executable bit on POSIX or `PATHEXT` on Windows.
 *
 *  - `cmd` containing a path separator → not searched in PATH; the
 *    given path is checked directly.
 *  - On Windows, falls through `PATHEXT` (defaults to `.COM;.EXE;.BAT;.CMD`)
 *    when `cmd` lacks an extension.
 *  - When running under Bun, defers to `Bun.which()` (native, faster). */
export function which(cmd: string): string | undefined {
  // Bun fast path — native PATH lookup without our manual stat loop.
  // `Bun.which` returns `null` when not found, `string` otherwise.
  const bun = (globalThis as { Bun?: { which?: (cmd: string) => string | null } }).Bun
  if (bun?.which) return bun.which(cmd) ?? undefined

  // Explicit path? Just check it directly — don't search PATH.
  if (cmd.includes("/") || (platform === "win32" && cmd.includes("\\"))) {
    return isExecutable(cmd) ? cmd : undefined
  }

  const pathEnv = process.env.PATH ?? ""
  if (pathEnv === "") return undefined
  const exts = pathExtensions()

  for (const dir of pathEnv.split(delimiter)) {
    if (dir === "") continue
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext)
      if (isExecutable(candidate)) return candidate
    }
  }
  return undefined
}

/** Per-platform extension list to try after the bare command name.
 *  POSIX: empty string (just the literal name). Windows: each entry of
 *  `PATHEXT`, plus an empty leading entry when `cmd` already includes
 *  a dot — so `which("foo.bar")` checks the literal first. */
function pathExtensions(): string[] {
  if (platform !== "win32") return [""]
  const raw = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD"
  return raw.split(";").filter((e) => e !== "")
}

function isExecutable(path: string): boolean {
  const s = safeStat(path)
  if (!s || !s.isFile()) return false
  // On Windows, file existence + correct extension is sufficient — the
  // OS uses extension to determine executability. On POSIX, check the
  // execute bit (any of user/group/other).
  if (platform === "win32") return true
  return (Number(s.mode) & 0o111) !== 0
}

/** True when the process looks like it's running under SSH. Native
 *  clipboard tools on the remote host write to the *remote* clipboard,
 *  which is rarely what the user wants — flip to OSC 52 instead. Other
 *  tools may also want to behave differently in remote sessions. */
export function isSSH(): boolean {
  return Boolean(process.env.SSH_TTY ?? process.env.SSH_CONNECTION ?? process.env.SSH_CLIENT)
}

function abortError(): Error {
  const e = new Error("aborted")
  e.name = "AbortError"
  return e
}
