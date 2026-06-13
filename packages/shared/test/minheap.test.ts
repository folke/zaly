import { describe, expect, test } from "vitest"
import { MinHeap, TopK } from "../src/minheap.ts"

describe("MinHeap", () => {
  test("pushes and pops smallest-first", () => {
    const heap = new MinHeap<number>((a, b) => a - b)
    for (const n of [5, 1, 4, 2, 3]) heap.push(n)
    expect(heap.size).toBe(5)
    expect(heap.peek()).toBe(1)
    expect([heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop()]).toEqual([
      1,
      2,
      3,
      4,
      5,
      undefined,
    ])
    expect(heap.empty).toBe(true)
  })

  test("replace swaps root and restores heap order", () => {
    const heap = new MinHeap<number>((a, b) => a - b)
    for (const n of [3, 4, 5]) heap.push(n)
    expect(heap.replace(1)).toBe(3)
    expect([heap.pop(), heap.pop(), heap.pop()]).toEqual([1, 4, 5])
  })

  test("sorted caches until mutation", () => {
    const heap = new MinHeap<number>((a, b) => a - b)
    for (const n of [3, 1, 2]) heap.push(n)
    const first = heap.sorted()
    expect(first).toEqual([1, 2, 3])
    expect(heap.sorted()).toBe(first)
    heap.push(0)
    expect(heap.sorted()).toEqual([0, 1, 2, 3])
    expect(heap.sorted()).not.toBe(first)
  })
})

describe("TopK", () => {
  test("keeps largest k items sorted best-first", () => {
    const top = new TopK<number>(3, (a, b) => a - b)
    const results = [5, 1, 9, 2, 7, 3].map((n) => top.add(n))
    expect(results.map((r) => r.added)).toEqual([true, true, true, true, true, false])
    expect(top.size).toBe(3)
    expect(top.peek()).toBe(5)
    expect(top.sorted()).toEqual([9, 7, 5])
  })

  test("returns evicted item", () => {
    const top = new TopK<number>(2, (a, b) => a - b)
    top.add(1)
    top.add(2)
    expect(top.add(3)).toEqual({ added: true, evicted: 1 })
    expect(top.add(0)).toEqual({ added: false })
  })

  test("rejects invalid capacity", () => {
    expect(() => new TopK(0, (a: number, b: number) => a - b)).toThrow(RangeError)
  })
})
