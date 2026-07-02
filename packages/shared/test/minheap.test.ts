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

  test("replace on an empty heap pushes and returns undefined", () => {
    const heap = new MinHeap<number>((a, b) => a - b)
    expect(heap.replace(2)).toBeUndefined()
    expect(heap.peek()).toBe(2)
  })

  test("clear empties heap and invalidates sorted cache", () => {
    const heap = new MinHeap<number>((a, b) => a - b)
    heap.push(2)
    heap.push(1)
    expect(heap.sorted()).toEqual([1, 2])
    heap.clear()
    expect(heap.empty).toBe(true)
    expect(heap.size).toBe(0)
    expect(heap.peek()).toBeUndefined()
    expect(heap.toArray()).toEqual([])
    expect(heap.sorted()).toEqual([])
  })

  test("toArray returns heap storage copy and custom sorted is not cached", () => {
    const heap = new MinHeap<number>((a, b) => a - b)
    for (const n of [3, 1, 2]) heap.push(n)
    const arr = heap.toArray()
    arr.length = 0
    expect(heap.size).toBe(3)
    expect(heap.sorted((a, b) => b - a)).toEqual([3, 2, 1])
    expect(heap.sorted((a, b) => b - a)).not.toBe(heap.sorted((a, b) => b - a))
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
    expect(top.capacity).toBe(3)
    expect(top.full).toBe(true)
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

  test("clear empties kept items and invalidates sorted cache", () => {
    const top = new TopK<number>(2, (a, b) => a - b)
    top.add(1)
    top.add(2)
    const sorted = top.sorted()
    expect(top.sorted()).toBe(sorted)
    top.clear()
    expect(top.size).toBe(0)
    expect(top.full).toBe(false)
    expect(top.peek()).toBeUndefined()
    expect(top.toArray()).toEqual([])
    expect(top.sorted()).toEqual([])
    expect(top.sorted()).not.toBe(sorted)
  })

  test("rejects invalid capacity", () => {
    expect(() => new TopK(0, (a: number, b: number) => a - b)).toThrow(RangeError)
    expect(() => new TopK(1.5, (a: number, b: number) => a - b)).toThrow(RangeError)
  })
})
