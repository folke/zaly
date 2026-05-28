import type {
  ShikiJob,
  ShikiRequest,
  ShikiResult,
  ShikiTheme,
  ShikiWorkerRequest,
  ShikiWorkerResponse,
} from "./types.ts"

import { hash } from "@zaly/shared"
import { hasColors } from "@zaly/shared/env"
import { isShikiLang } from "../schemas/gen/shiki.ts"

function isJob(s: ShikiJob | ShikiResult): s is ShikiJob {
  return "key" in s && "lang" in s
}

export class ShikiWorkerClient {
  #id = 0
  #inflight = new Map<string, Promise<ShikiResult>>()
  #pending = new Map<
    number,
    {
      reject: (error: unknown) => void
      resolve: (results: ShikiResult[]) => void
    }
  >()
  #worker?: Worker
  #completed: (() => void)[] = []
  // oxlint-disable-next-line no-unused-private-class-members
  #flushScheduled: Promise<void> | undefined = undefined

  key(req: ShikiRequest): string {
    return req.key ?? hash(`${req.lang}:${req.code}:${req.theme ?? "default"}`)
  }

  toJob(req: ShikiRequest): ShikiJob | ShikiResult {
    const key = this.key(req)
    if (!hasColors) return { error: "terminal does not support colors", key, value: req.code }
    if (!isShikiLang(req.lang))
      return { error: `unsupported language: ${req.lang}`, key, value: req.code }
    return { ...req, key, lang: req.lang }
  }

  highlight(code: string, lang: string, theme?: ShikiTheme): Promise<ShikiResult>
  highlight(req: ShikiRequest): Promise<ShikiResult>
  highlight(
    reqOrCode: ShikiRequest | string,
    lang?: string,
    theme?: ShikiTheme
  ): Promise<ShikiResult> {
    const req: ShikiRequest =
      typeof reqOrCode === "string"
        ? { code: reqOrCode, lang: lang ?? "plaintext", theme }
        : reqOrCode

    const job = this.toJob(req)

    if (!isJob(job)) return Promise.resolve(job)

    const inflight = this.#inflight.get(job.key)
    if (inflight) return inflight

    const promise = this.#request([job]).then(
      (results) => results[0] ?? { error: "empty result", key: job.key }
    )
    this.#inflight.set(job.key, promise)
    void promise.finally(() => this.#inflight.delete(job.key))
    return promise
  }

  async highlightMany(reqs: ShikiRequest[]): Promise<ShikiResult[]> {
    const ret = await Promise.all(reqs.map((req) => this.highlight(req)))
    return ret
  }

  dispose(): void {
    const error = new Error("Shiki worker disposed")
    for (const { reject } of this.#pending.values()) reject(error)
    this.#pending.clear()
    this.#inflight.clear()
    this.#worker?.terminate()
    this.#worker = undefined
  }

  #request(jobs: ShikiJob[]): Promise<ShikiResult[]> {
    const worker = (this.#worker ??= this.#createWorker())
    const id = ++this.#id
    const request: ShikiWorkerRequest = { id, jobs }
    const promise = new Promise<ShikiResult[]>((resolve, reject) => {
      this.#pending.set(id, { reject, resolve })
    })
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(request)
    return promise
  }

  #createWorker(): Worker {
    const worker = new Worker(new URL("worker.ts", import.meta.url), { type: "module" })
    worker.addEventListener("message", (event: MessageEvent<ShikiWorkerResponse>) => {
      const pending = this.#pending.get(event.data.id)
      if (!pending) return
      this.#pending.delete(event.data.id)
      this.#completed.push(() => pending.resolve(event.data.results))
      this.#flushScheduled ??= this.#flush().finally(() => {
        this.#flushScheduled = undefined
      })
    })
    worker.addEventListener("error", (event) => {
      this.#rejectAll(event.error ?? new Error(event.message))
    })
    return worker
  }

  async #flush() {
    while (this.#completed.length) {
      const next = this.#completed.shift()
      next?.()
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setImmediate(resolve)) // yield to event loop between batches
    }
  }

  #rejectAll(error: unknown): void {
    for (const { reject } of this.#pending.values()) reject(error)
    this.#pending.clear()
    this.#inflight.clear()
    this.#worker?.terminate()
    this.#worker = undefined
  }
}

export const shikiWorker = new ShikiWorkerClient()
