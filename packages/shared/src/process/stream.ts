import { createWriteStream } from "node:fs"

export type Stream<T> = {
  add(chunk: Buffer): void
  finish(): void
  close?(): Promise<void>
  readonly result: T
  readonly done: boolean
}

export type BaseStreamOpts<T> = {
  transform: (chunk: Buffer) => T
  concat: (chunks: T[]) => T
}

export abstract class BaseStream<T> implements Stream<T> {
  protected chunks: T[] = []
  #done = false

  protected abstract onAdd(chunk: Buffer): T
  protected abstract onResult(chunks: T[]): T
  protected onFinish = () => {}

  add(chunk: Buffer): void {
    this.chunks.push(this.onAdd(chunk))
  }

  finish() {
    if (this.#done) return
    this.#done = true
    this.onFinish()
  }

  get result(): T {
    if (this.chunks.length === 0) return this.onResult([])
    if (this.chunks.length === 1) return this.chunks[0]
    // Collapse to a 1-tuple to cache the concat result. Subsequent
    // reads return the cached buffer in O(1); next add() pushes a
    // chunk, so length goes back to 2 and we re-concat once.
    this.chunks = [this.onResult(this.chunks)]
    return this.chunks[0]
  }

  get done(): boolean {
    return this.#done
  }
}

export class BufferStream extends BaseStream<Buffer> {
  protected onAdd(chunk: Buffer): Buffer {
    return chunk
  }

  protected onResult(chunks: Buffer[]): Buffer {
    return Buffer.concat(chunks)
  }
}

export class TextStream extends BaseStream<string> {
  #decoder = new TextDecoder()

  onAdd(chunk: Buffer): string {
    return this.#decoder.decode(chunk, { stream: true })
  }

  onResult(chunks: string[]): string {
    return chunks.join("")
  }

  override onFinish = () => this.chunks.push(this.#decoder.decode()) // flush any remaining bytes
}

export type ProxyStreamOptions<T, X> = {
  add?: (chunk: Buffer) => void
  finish?: () => void
  close?: () => Promise<void>
  result?: (innerResult: T) => X
}

export class ProxyStream<T, X = T> implements Stream<X> {
  #opts: ProxyStreamOptions<T, X>
  #stream: Stream<T>
  #done = false

  constructor(stream: Stream<T>, opts: ProxyStreamOptions<T, X> = {}) {
    this.#stream = stream
    this.#opts = opts
  }

  add(chunk: Buffer): void {
    this.#stream.add(chunk)
    this.#opts.add?.(chunk)
  }

  finish() {
    if (this.#done) return
    this.#done = true
    if (!this.#stream.done) this.#stream.finish()
    this.#opts.finish?.()
  }

  async close(): Promise<void> {
    this.finish()
    await this.#stream.close?.()
    await this.#opts.close?.()
  }

  get result(): X {
    return this.#opts.result?.(this.#stream.result) ?? (this.#stream.result as unknown as X)
  }

  get done(): boolean {
    return this.#done
  }
}

export function tailedStream<T>(stream: Stream<T>, path: string): Stream<T> {
  const writer = createWriteStream(path, { flags: "a" })
  writer.on("error", () => {})
  let closePromise: Promise<void> | undefined
  return new ProxyStream<T>(stream, {
    add: (chunk) => writer.write(chunk),
    close: async () => closePromise,
    finish: () => {
      closePromise = new Promise<void>((r) => writer.end(() => r()))
    },
  })
}

/**
 * Buffered tee — collect raw chunks in memory and only start writing to
 * a file when `startTailing(path)` is called. At that point the buffered
 * chunks are flushed to the file and subsequent `add()` calls go to both
 * the inner stream and the file.
 *
 * Useful when "do we need a log file?" is decided dynamically (e.g.
 * "only if output exceeds inline cap"). Avoids the cost of writing a
 * file for every short-lived spawn.
 *
 * Memory cost until `startTailing` is called: the full raw byte stream
 * (in addition to whatever the inner stream is accumulating). Once
 * `startTailing` flushes, the secondary buffer is released. Don't pair
 * with an unbounded source if you don't intend to call `startTailing`.
 */
export function bufferedTailStream<T>(stream: Stream<T>): {
  stream: Stream<T>
  startTailing: (path: string) => void
} {
  let writer: ReturnType<typeof createWriteStream> | undefined
  let buffer: Buffer[] | undefined = []
  let closePromise: Promise<void> | undefined

  const proxy = new ProxyStream<T>(stream, {
    add: (chunk) => {
      if (writer) writer.write(chunk)
      else buffer?.push(chunk)
    },
    close: async () => closePromise,
    finish: () => {
      if (writer) closePromise = new Promise<void>((r) => writer!.end(() => r()))
    },
  })

  return {
    startTailing: (path: string) => {
      if (writer) return // already tailing
      writer = createWriteStream(path, { flags: "a" })
      writer.on("error", () => {})
      if (buffer) {
        for (const chunk of buffer) writer.write(chunk)
        buffer = undefined // release the replay buffer
      }
    },
    stream: proxy,
  }
}

export function transformStream<T, X>(stream: Stream<T>, transform: (chunk: T) => X): Stream<X> {
  let cached = false
  let innerResult: T
  let transformed: X
  return new ProxyStream<T, X>(stream, {
    result: (result) => {
      if (cached && result === innerResult) return transformed
      cached = true
      innerResult = result
      transformed = transform(result)
      return transformed
    },
  })
}
