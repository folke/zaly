import type { Message, Usage } from "@zaly/ai"

import { describe, expect, test } from "vitest"
import { messageTail } from "../src/compaction/utils.ts"
import { Session } from "../src/session/index.ts"

const u = (text: string): Message => ({ content: text, role: "user" })
const a = (text: string): Message => ({ content: text, role: "assistant" })

class TestSession extends Session {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {
    super()
  }
}

/** Build a started session and seed a script of `[message, usage?]`
 *  pairs. The usage is attached as `MessageMeta` so it lands on the
 *  message node and `tailMessages` can find it via `session.node()`. */
function build(script: readonly (readonly [Message, Usage?])[]): {
  session: Session
  messages: Message[]
} {
  const session = new TestSession()
  session.start()
  for (const [m, usage] of script) session.add(m, usage ? { usage } : undefined)
  return { messages: [...session.messages], session }
}

const usage = (input: number, output = 0, extra: Partial<Usage> = {}): Usage => ({
  input,
  output,
  ...extra,
})

describe("tailMessages", () => {
  test("empty session returns empty tail", () => {
    const { session } = build([])
    expect(messageTail({ messages: session.messages, session }, { keepTokens: 1000 })).toEqual([])
  })

  test("messages with no usage are queued and never flushed", () => {
    // Without an assistant turn carrying usage, the queue can't flush.
    const { session } = build([[u("hi")], [u("again")]])
    expect(messageTail({ messages: session.messages, session }, { keepTokens: 1000 })).toEqual([])
  })

  test("newest assistant always admitted (delta = 0 by definition)", () => {
    // Even with budget 0, the very last assistant turn comes through —
    // there's nothing newer to compare it to, so its delta is 0.
    const { session, messages } = build([[a("greeting"), usage(50, 10)]])
    expect(messageTail({ messages: session.messages, session }, { keepTokens: 0 })).toEqual(
      messages
    )
  })

  test("leading user without later assistant is dropped (queue never flushes)", () => {
    // Going backward: a1 flushes immediately (queue empty), then q1 gets
    // queued but no further assistant follows to flush it. q1 is lost.
    const { session, messages } = build([[u("q1")], [a("a1"), usage(50, 10)]])
    const tail = messageTail({ messages: session.messages, session }, { keepTokens: 1000 })
    expect(tail).toEqual([messages[1]]) // a1 only
  })

  test("budget allows entire post-first-user chain", () => {
    // Walking back: a3 (free), a2 (delta=70), a1 (delta=70). Total 140.
    // Leading u("q1") gets stranded after a1 flushes — that's the documented
    // behavior of the queue.
    const { session, messages } = build([
      [u("q1")],
      [a("a1"), usage(50, 10)], // current = 60
      [u("q2")],
      [a("a2"), usage(110, 20)], // current = 130
      [u("q3")],
      [a("a3"), usage(180, 20)], // current = 200
    ])
    const tail = messageTail({ messages: session.messages, session }, { keepTokens: 1000 })
    expect(tail).toEqual(messages.slice(1)) // drop the very first user
  })

  test("budget cuts mid-chain on growth boundary", () => {
    // current values: a1=60, a2=130, a3=200.
    // Walk: a3 free, a2 delta=70 (admits a2 + q3 from queue), a1 delta=70 → break.
    // q2 was queued waiting for a1's flush — it's dropped along with a1.
    const { session, messages } = build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(110, 20)],
      [u("q3")],
      [a("a3"), usage(180, 20)],
    ])
    const tail = messageTail({ messages: session.messages, session }, { keepTokens: 100 })
    expect(tail).toEqual(messages.slice(3)) // a2, q3, a3
  })

  test("multiple users between assistants ride along together", () => {
    // Three users between a1 and a2 — when a2's flush triggers (last in walk),
    // wait: a2 is newest, flushes immediately at index 0. The middle users
    // queue up and get attached when we walk back to a1.
    const { session, messages } = build([
      [a("a1"), usage(40, 10)], // current = 50
      [u("q2-a")],
      [u("q2-b")],
      [u("q2-c")],
      [a("a2"), usage(120, 20)], // current = 140
    ])
    // Full budget: a2 + (a1 + queued users) = everything.
    expect(messageTail({ messages: session.messages, session }, { keepTokens: 1000 })).toEqual(messages)
    // Tight budget: only a2 (delta=0), a1 step rejected (delta=90 > 50).
    // The three middle users stay in the queue and get dropped on break.
    expect(messageTail({ messages: session.messages, session }, { keepTokens: 50 })).toEqual([
      messages[4],
    ])
  })

  test("masker-style shrink — clamp prevents under-charge of newer growth", () => {
    // a2 simulates a post-masker turn: usage shrunk vs a1.
    // a1 current = 50+10+200(cacheRead) = 260
    // a2 current = 60+20 = 80
    // a3 current = 180+20 = 200
    // Walk: a3 free; a2 delta = max(0, 200-80) = 120; a1 delta = max(0, 80-260) = 0.
    // Budget 50: a3 in, a2 rejected (120 > 50). Tail = [q3, a3].
    const { session, messages } = build([
      [u("q1")],
      [a("a1"), usage(50, 10, { cacheRead: 200 })],
      [u("q2")],
      [a("a2"), usage(60, 20)],
      [u("q3")],
      [a("a3"), usage(180, 20)],
    ])
    const tail = messageTail({ messages: session.messages, session }, { keepTokens: 50 })
    expect(tail).toEqual(messages.slice(5)) // a3 only — q3 stranded by break
  })

  test("masker-style shrink — clamp does not let walk consume infinite history", () => {
    // After the masker event, walking further back must measure growth
    // against the OLDER (larger) baseline, not the post-masker one. The
    // unconditional `last = current` re-establishes the baseline so older
    // turns charge real deltas.
    // a1 current = 200, a2 current = 60 (masker), a3 current = 80, a4 current = 100
    // Walk: a4 free, a3 delta=20, a2 delta=max(0,80-60)=20, a1 delta=max(0,60-200)=0
    // Budget 30 admits a4+a3 (20), rejects a2 (20+20=40>30).
    const { session, messages } = build([
      [u("q1")],
      [a("a1"), usage(50, 50, { cacheRead: 100 })], // 200
      [u("q2")],
      [a("a2"), usage(40, 20)], // 60 — post-masker
      [u("q3")],
      [a("a3"), usage(60, 20)], // 80
      [u("q4")],
      [a("a4"), usage(80, 20)], // 100
    ])
    const tail = messageTail({ messages: session.messages, session }, { keepTokens: 30 })
    // a4 free + a3 (delta 20). q4 rides along via a3's flush. a2 step
    // (delta 20 again, used would be 40 > 30) breaks. Crucially, the
    // pre-masker a1 is NEVER reached — the clamp protects the budget.
    expect(tail).toEqual(messages.slice(5))
  })

  test("cache fields contribute to current — high cacheRead inflates the delta", () => {
    // a1 current = 60, a2 current = 70+20+500+100 = 690.
    // Walk: a2 free, a1 delta = 690-60 = 630.
    // Budget 100 keeps only a2.
    const { session, messages } = build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(70, 20, { cacheRead: 500, cacheWrite: 100 })],
    ])
    const tail = messageTail({ messages: session.messages, session }, { keepTokens: 100 })
    expect(tail).toEqual([messages[3]]) // a2 only (q2 stays queued, drops on break)
  })

  test("opts.messages overrides session.messages — used for masked agent view", () => {
    // The session has full content; the agent passes a transformed view
    // (e.g. masked tool results). tailMessages walks the override but
    // looks up usage by id from the session DAG.
    const { session, messages } = build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(110, 20)],
    ])
    // Build a parallel view that keeps the same ids — the walk uses ids
    // to look up usage from the session DAG. Returned objects must be
    // the override instances, not session.messages instances.
    const masked: Message[] = messages.map((m) => structuredClone(m))
    const tail = messageTail({ messages: masked, session }, { keepTokens: 1000 })
    expect(tail).toEqual(masked.slice(1))
    expect(tail.every((m, i) => m === masked[i + 1])).toBe(true)
  })

  test("default budget kicks in when maxTokens is omitted (20k)", () => {
    // Tiny session well under default — everything (post-leading-user) returned.
    const { session, messages } = build([
      [u("q1")],
      [a("a1"), usage(100, 50)],
      [u("q2")],
      [a("a2"), usage(200, 50)],
    ])
    expect(messageTail({ messages: session.messages, session }, {})).toEqual(messages.slice(1))
  })
})
