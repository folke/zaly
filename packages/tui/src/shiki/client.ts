import type { ShikiJob, ShikiOpts, ShikiRequest, ShikiResult } from "./types.ts"

import { hash } from "@zaly/shared"
import { hasColors } from "@zaly/shared/env"
import { isShikiLang } from "../schemas/gen/shiki.ts"

function isJob(s: ShikiJob | ShikiResult): s is ShikiJob {
  return "key" in s && "lang" in s
}

const MAX_CACHE_SIZE = 100
const MAX_RUNNING = 2

export class ShikiWorkerClient {
  #id = 0
  #cache = new Map<string, ShikiJob>()
  #queue = new Map<number, ShikiJob>()
  #running = new Map<number, ShikiJob>()
  #results: ShikiResult[] = []
  #worker?: Worker
  // oxlint-disable-next-line no-unused-private-class-members
  #updateScheduled: Promise<void> | undefined = undefined

  key(req: ShikiRequest): string {
    return req.key ?? hash(`${req.lang}:${req.code}:${req.theme ?? "default"}`)
  }

  toJob(req: ShikiRequest): ShikiJob | ShikiResult {
    const id = ++this.#id
    const key = this.key(req)
    if (!hasColors) return { error: "terminal does not support colors", id, key, value: req.code }
    if (!isShikiLang(req.lang))
      return { error: `unsupported language: ${req.lang}`, id, key, value: req.code }
    const cached = this.#cache.get(key)
    if (cached) {
      this.#cache.delete(key)
      this.#cache.set(key, cached) // bump to end of LRU
      return cached
    }
    while (this.#cache.size > MAX_CACHE_SIZE) this.#cache.delete(this.#cache.keys().next().value!)
    const ret: ShikiJob = { ...req, id, key, lang: req.lang, ...Promise.withResolvers() }
    this.#cache.set(key, ret)
    return ret
  }

  highlight(code: string, lang: string, opts: ShikiOpts = {}): Promise<ShikiResult> {
    const req: ShikiRequest = { code, lang, signal: opts.signal, theme: opts.theme }
    const job = this.toJob(req)
    if (!isJob(job)) return Promise.resolve(job)
    if (!job.scheduled) {
      this.#queue.set(job.id, job)
      job.signal?.addEventListener("abort", () => this.update(), { once: true })
      this.update()
    }
    return job.promise
  }

  dispose(): void {
    const error = new Error("Shiki worker disposed")
    this.#rejectAll(error)
  }

  #request(job: ShikiJob): void {
    job.scheduled = true
    this.#running.set(job.id, job)
    const worker = (this.#worker ??= this.#createWorker())
    const { signal: _s, promise: _prom, resolve: _res, reject: _rej, ...msg } = job
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(msg)
  }

  #createWorker(): Worker {
    const worker = new Worker(new URL("worker.ts", import.meta.url), { type: "module" })
    worker.unref()
    worker.addEventListener("message", (event: MessageEvent<ShikiResult>) => {
      this.#running.delete(event.data.id)
      this.#results.push(event.data)
      this.update()
    })
    worker.addEventListener("error", (event) => {
      this.#rejectAll(event.error ?? new Error(event.message))
    })
    return worker
  }

  update() {
    this.#updateScheduled ??= this.#update().finally(() => {
      this.#updateScheduled = undefined
    })
  }

  async #update() {
    // Resolve pending results
    while (this.#results.length) {
      const result = this.#results.shift()!
      const job = this.#queue.get(result.id)
      if (job) {
        if (result.error) job.reject(new Error(result.error))
        else job.resolve(result)

        // oxlint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setImmediate(resolve)) // yield to event loop between batches
        this.#queue.delete(job.id)
      }
    }

    // Clean up aborted jobs
    for (const job of this.#queue.values()) {
      if (job.signal?.aborted && !job.scheduled) {
        job.reject(new Error("Job aborted"))
        this.#queue.delete(job.id)
        this.#cache.delete(job.key)
      }
    }

    if (this.#running.size >= MAX_RUNNING || this.#queue.size === 0) return

    // Schedule new jobs up to concurrency limit, prioritizing the most recently requested ones (LIFO)
    const todo = [...this.#queue.values()]
      .filter((j) => !j.scheduled)
      .slice(-(MAX_RUNNING - this.#running.size))
    for (const job of todo) this.#request(job)
  }

  #rejectAll(error: unknown): void {
    for (const { reject } of this.#queue.values()) reject(error)
    this.#cache.clear()
    this.#queue.clear()
    this.#running.clear()
    this.#results = []
    this.#worker?.terminate()
    this.#worker = undefined
  }
}

export const shikiWorker = new ShikiWorkerClient()
