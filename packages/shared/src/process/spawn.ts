/**
 * Process-spawning primitive: a `Spawn` class that holds a child process
 * handle and exposes its buffered output via `result`, plus direct
 * control (`kill`, `abort`, `write`).
 *
 * Used by tools that shell out (bash, lightpanda, formatter integrations)
 * and by the TUI's clipboard layer.
 *
 * Design:
 *   - Eager start: `new Spawn(cmd, args, opts)` spawns immediately.
 *   - **Caller owns output buffering** via `opts.stdout` / `opts.stderr`
 *     (any `Stream<T>` impl). Defaults to `BufferStream` for raw bytes;
 *     pass `TextStream` for decoded text, or wrap with `TailedStream` /
 *     `MuxStream` to fan out (e.g. tee to a log file).
 *   - `proc.stdout` / `proc.stderr` expose the running stream result;
 *     `proc.result` resolves to the final state when the child exits.
 *   - Non-zero exit is **not** an error; callers branch on `code`. Spawn
 *     errors (ENOENT etc.) reject `result`.
 *   - `signal` (AbortSignal), `timeout`, and `maxBuffer` overflow all
 *     terminate via SIGTERM and set `killed: true`.
 *
 * Conveniences (`spawnText`, `spawnWithInput`) wrap `Spawn` for the
 * common one-shot cases. `which` and `isSSH` are unrelated environment
 * helpers kept here for the same "things that talk to the OS" theme.
 */
import type { ChildProcess, SpawnOptions } from "node:child_process"
import type { Stream } from "./stream.ts"

import { spawn as nodeSpawn } from "node:child_process"
import { BufferStream, TextStream } from "./stream.ts"

export interface SpawnOpts<O = Buffer, E = Buffer> {
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdout?: Stream<O>
  stderr?: Stream<E>
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

export interface SpawnResult<O = Buffer, E = Buffer> {
  code: number
  /** Termination signal name, when the process was killed by one. */
  signal?: NodeJS.Signals
  stdout: O
  stderr: E
  /** True when terminated by timeout, abort, maxBuffer overflow, or
   *  explicit `proc.kill()` / `proc.abort()`. */
  killed: boolean
  /** Why the process was killed. Present only when `killed === true`. */
  killReason?: KillReason
}

/**
 * A live child-process handle. Construct it; consume via `await
 * proc.result`; control via `proc.kill()` / `proc.abort()` /
 * `proc.write()`. For incremental output, read `proc.stdout` /
 * `proc.stderr` (the running result of the underlying `Stream<T>`).
 */
export class Spawn<O = Buffer, E = Buffer> {
  readonly child: ChildProcess
  readonly #stdout: Stream<O>
  readonly #stderr: Stream<E>

  #buffered = 0
  #killed = false
  #killReason?: KillReason
  #exited = false
  #exitInfo?: { code: number; signal?: NodeJS.Signals }
  #spawnError?: Error
  #timer?: NodeJS.Timeout
  #escalationTimer?: NodeJS.Timeout
  #onAbort?: () => void
  #resultPromise?: Promise<SpawnResult<O, E>>
  #resolveResult?: () => void

  /** Default delay between SIGTERM and SIGKILL when escalating via
   *  `abort()`. Tunable per-call via `abort({ delay })`. */
  static DEFAULT_ABORT_DELAY = 5000

  constructor(
    readonly cmd: string,
    readonly args: readonly string[] = [],
    readonly opts: SpawnOpts<O, E> = {}
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

    this.#stdout = opts.stdout ?? (new BufferStream() as unknown as Stream<O>)
    this.#stderr = opts.stderr ?? (new BufferStream() as unknown as Stream<E>)

    if (opts.signal) {
      this.#onAbort = (): void => this.#escalateKill("abort")
      opts.signal.addEventListener("abort", this.#onAbort, { once: true })
    }
    if (opts.timeout !== undefined && opts.timeout > 0) {
      this.#timer = setTimeout(() => this.#escalateKill("timeout"), opts.timeout)
    }

    this.child.stdout?.on("data", (data: Buffer) => {
      this.#stdout.add(data)
      if (opts.maxBuffer !== undefined) {
        this.#buffered += data.length
        if (this.#buffered > opts.maxBuffer) this.#escalateKill("maxBuffer")
      }
    })
    this.child.stderr?.on("data", (data: Buffer) => {
      this.#stderr.add(data)
      if (opts.maxBuffer !== undefined) {
        this.#buffered += data.length
        if (this.#buffered > opts.maxBuffer) this.#escalateKill("maxBuffer")
      }
    })

    this.child.once("error", (error) => {
      this.#spawnError = error
      this.#cleanup()
      this.#finalize({ code: -1 })
    })

    this.child.once("close", (code, signal) => {
      this.#cleanup()
      this.#finalize({ code: code ?? -1, signal: signal ?? undefined })
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
    return this.#exitInfo?.code
  }
  get signal(): NodeJS.Signals | undefined {
    return this.#exitInfo?.signal
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
  get stdout(): O {
    return this.#stdout.result
  }
  /** Snapshot of stderr accumulated so far. See `stdout`. */
  get stderr(): E {
    return this.#stderr.result
  }

  // ── Result (buffered) ──────────────────────────────────────────────

  /** Promise resolving to the final `SpawnResult` once the child exits.
   *  Memoized — multiple `await proc.result` reads share one promise. */
  get result(): Promise<SpawnResult<O, E>> {
    return (this.#resultPromise ??= this.#buildResultPromise())
  }

  #buildResultPromise(): Promise<SpawnResult<O, E>> {
    return new Promise((resolve, reject) => {
      const settle = (): void => {
        if (this.#spawnError) reject(this.#spawnError)
        else
          resolve({
            code: this.#exitInfo?.code ?? -1,
            killReason: this.#killReason,
            killed: this.#killed,
            signal: this.#exitInfo?.signal,
            stderr: this.#stderr.result,
            stdout: this.#stdout.result,
          })
      }
      if (this.#exited) settle()
      else this.#resolveResult = settle
    })
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

  #finalize(info: { code: number; signal?: NodeJS.Signals }): void {
    if (this.#exited) return
    this.#stdout.finish()
    this.#stderr.finish()
    this.#exited = true
    this.#exitInfo = info
    this.#resolveResult?.()
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
    const r = await new Spawn(cmd, args, { ...opts, stdout: new TextStream() }).result
    return r.code === 0 && r.stdout !== "" ? r.stdout : undefined
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

function abortError(): Error {
  const e = new Error("aborted")
  e.name = "AbortError"
  return e
}
