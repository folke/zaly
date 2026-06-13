export type Compare<T> = (a: T, b: T) => number

export class MinHeap<T> {
  readonly #compare: Compare<T>
  #items: T[] = []
  #sorted?: T[]

  constructor(compare: Compare<T>) {
    this.#compare = compare
  }

  get size(): number {
    return this.#items.length
  }

  get empty(): boolean {
    return this.#items.length === 0
  }

  clear(): void {
    this.#items = []
    this.#sorted = undefined
  }

  peek(): T | undefined {
    return this.#items[0]
  }

  push(item: T): void {
    this.#sorted = undefined
    const items = this.#items
    items.push(item)
    this.#up(items.length - 1)
  }

  pop(): T | undefined {
    const items = this.#items
    if (items.length === 0) return undefined
    this.#sorted = undefined
    const ret = items[0]
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      this.#down(0)
    }
    return ret
  }

  replace(item: T): T | undefined {
    const items = this.#items
    if (items.length === 0) {
      this.push(item)
      return undefined
    }
    this.#sorted = undefined
    const ret = items[0]
    items[0] = item
    this.#down(0)
    return ret
  }

  toArray(): T[] {
    return [...this.#items]
  }

  sorted(compare: Compare<T> = this.#compare): T[] {
    if (compare === this.#compare) return (this.#sorted ??= this.#items.toSorted(compare))
    return this.#items.toSorted(compare)
  }

  #up(index: number): void {
    const items = this.#items
    const item = items[index]
    while (index > 0) {
      const parent = (index - 1) >> 1
      const value = items[parent]
      if (this.#compare(item, value) >= 0) break
      items[index] = value
      index = parent
    }
    items[index] = item
  }

  #down(index: number): void {
    const items = this.#items
    const size = items.length
    const item = items[index]
    for (;;) {
      const left = index * 2 + 1
      if (left >= size) break
      const right = left + 1
      let child = left
      let value = items[left]
      if (right < size && this.#compare(items[right], value) < 0) {
        child = right
        value = items[right]
      }
      if (this.#compare(value, item) >= 0) break
      items[index] = value
      index = child
    }
    items[index] = item
  }
}

export class TopK<T> {
  readonly #capacity: number
  readonly #compare: Compare<T>
  readonly #heap: MinHeap<T>
  #sorted?: T[]

  constructor(capacity: number, compare: Compare<T>) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("TopK capacity must be a positive integer")
    }
    this.#capacity = capacity
    this.#compare = compare
    this.#heap = new MinHeap(compare)
  }

  get capacity(): number {
    return this.#capacity
  }

  get size(): number {
    return this.#heap.size
  }

  get full(): boolean {
    return this.#heap.size >= this.#capacity
  }

  clear(): void {
    this.#heap.clear()
    this.#sorted = undefined
  }

  /** Worst item currently kept. */
  peek(): T | undefined {
    return this.#heap.peek()
  }

  /** Add an item if it belongs in the top K. Returns the evicted item when full. */
  add(item: T): { added: boolean; evicted?: T } {
    if (this.#heap.size < this.#capacity) {
      this.#sorted = undefined
      this.#heap.push(item)
      return { added: true }
    }
    const worst = this.#heap.peek()!
    if (this.#compare(item, worst) <= 0) return { added: false }
    this.#sorted = undefined
    return { added: true, evicted: this.#heap.replace(item) }
  }

  toArray(): T[] {
    return this.#heap.toArray()
  }

  /** Kept items sorted best-first. */
  sorted(): T[] {
    return (this.#sorted ??= this.#heap.sorted((a, b) => this.#compare(b, a)))
  }
}
