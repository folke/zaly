import type { Message } from "@zaly/ai"
import type { MaskOptions } from "../src/masker.ts"
import type { FileMeta } from "../src/tools/read.ts"
import type { ContextPressure } from "../src/types.ts"

import { describe, expect, it } from "vitest"
import { Masker } from "../src/masker.ts"

/** Test helper: disable the `minChars` floor so tiny mock content
 *  ("first ls", "ok", …) still qualifies for masking. */
function mask(opts: MaskOptions = {}): Masker {
  return new Masker({ minChars: 0, ...opts })
}

/** Pressure value for tests. Level 1 → masker triggers a decide pass.
 *  We bump straight to a non-zero level so every test that calls
 *  `apply` exercises the full flow. */
const P: ContextPressure = { level: 1, limit: 200_000, ratio: 0.8, used: 160_000 }

function call(id: string, name: string, params: unknown): Message<"assistant"> {
  return {
    content: [{ id, name, params, type: "tool-call" }],
    role: "assistant",
  }
}

interface ResultOpts {
  meta?: object
  isError?: boolean
}
function result(id: string, name: string, text: string, opts: ResultOpts = {}): Message<"tool"> {
  return {
    content: [
      {
        content: [{ text, type: "text" }],
        id,
        isError: opts.isError,
        meta: opts.meta,
        name,
        type: "tool-result",
      },
    ],
    role: "tool",
  }
}

function fileMeta(path: string, kind: "read" | "write" | "edit", full?: boolean): FileMeta {
  return { full, kind, mtime: 0, path }
}

function user(text: string): Message<"user"> {
  return { content: text, role: "user" }
}

/** Stamp positional ids onto each message — masker keys per-part
 *  decisions off `Message.id`, which the session would normally fill
 *  in. Tests build messages by hand, so this helper does it for us. */
function withIds(messages: readonly Message[]): Message[] {
  return messages.map((m, i) => ({ ...m, id: `m${i}` }))
}

function firstText(m: Message): string | undefined {
  if (m.role !== "tool") return
  const part = m.content[0]
  if (typeof part.content === "string") return part.content
  const text = part.content[0]
  return text.type === "text" ? text.text : undefined
}

describe("Masker — file-aware", () => {
  it("masks reads superseded by a later write", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "read", { path: "foo.ts" }),
      result("c1", "read", "v1 contents", { meta: fileMeta("foo.ts", "read", true) }),
      call("c2", "write", { path: "foo.ts", content: "v2" }),
      result("c2", "write", "ok", { meta: fileMeta("foo.ts", "write", true) }),
    ]
    const masker = mask({ files: { read: 0 } })
    const out = masker.apply(withIds(messages), P)
    expect(firstText(out[2])).toContain("[masked:")
    expect(firstText(out[4])).toBe("ok")
  })

  it("keeps current file ops untouched", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "read", { path: "foo.ts" }),
      result("c1", "read", "current contents", { meta: fileMeta("foo.ts", "read", true) }),
    ]
    const masker = mask()
    const out = masker.apply(withIds(messages), P)

    expect(masker.stamped).toBe(0)
    expect(firstText(out[2])).toBe("current contents")
  })

  it("ranged reads not subsumed by other ranged reads", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "read", { path: "foo.ts", offset: 1, limit: 100 }),
      result("c1", "read", "first hundred", { meta: fileMeta("foo.ts", "read", false) }),
      call("c2", "read", { path: "foo.ts", offset: 200, limit: 100 }),
      result("c2", "read", "next hundred", { meta: fileMeta("foo.ts", "read", false) }),
    ]
    const masker = mask()
    const out = masker.apply(withIds(messages), P)

    expect(firstText(out[2])).toBe("first hundred")
    expect(firstText(out[4])).toBe("next hundred")
  })

  it("full read subsumes earlier ranged reads", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "read", { path: "foo.ts", offset: 1, limit: 10 }),
      result("c1", "read", "small slice", { meta: fileMeta("foo.ts", "read", false) }),
      call("c2", "read", { path: "foo.ts" }),
      result("c2", "read", "whole file", { meta: fileMeta("foo.ts", "read", true) }),
    ]
    const masker = mask({ files: { read: 0 } })
    const out = masker.apply(withIds(messages), P)

    expect(firstText(out[2])).toContain("[masked:")
    expect(firstText(out[4])).toBe("whole file")
  })

  it("keeps last `keep.write` stale writes per file", () => {
    const messages: Message[] = [user("u")]
    for (let n = 1; n <= 5; n++) {
      messages.push(call(`c${n}`, "write", { content: `v${n}`, path: "foo.ts" }))
      messages.push(result(`c${n}`, "write", "ok", { meta: fileMeta("foo.ts", "write", true) }))
    }
    // 5 writes total. With keep.write: 3, the last (current) is never
    // masked; the prior 4 are all stale, of which the most recent 3
    // stay → only the very first write should be masked.
    const masker = mask({ files: { write: 3 } })
    const out = masker.apply(withIds(messages), P)

    expect(firstText(out[2])).toContain("[masked:")
    expect(firstText(out[4])).toBe("ok")
    expect(firstText(out[6])).toBe("ok")
    expect(firstText(out[8])).toBe("ok")
    expect(firstText(out[10])).toBe("ok")
  })

  it("per-path scoping: 5 writes across 2 files don't spill", () => {
    const messages: Message[] = [
      user("u"),
      call("a1", "write", { content: "x", path: "a.ts" }),
      result("a1", "write", "ok", { meta: fileMeta("a.ts", "write", true) }),
      call("a2", "write", { content: "x", path: "a.ts" }),
      result("a2", "write", "ok", { meta: fileMeta("a.ts", "write", true) }),
      call("b1", "write", { content: "x", path: "b.ts" }),
      result("b1", "write", "ok", { meta: fileMeta("b.ts", "write", true) }),
      call("b2", "write", { content: "x", path: "b.ts" }),
      result("b2", "write", "ok", { meta: fileMeta("b.ts", "write", true) }),
    ]
    // Each path: 1 stale write + 1 current. With keep.write: 3, none
    // should be masked.
    const masker = mask()
    const out = masker.apply(withIds(messages), P)
    expect(masker.stamped).toBe(0)
    for (const i of [2, 4, 6, 8]) expect(firstText(out[i])).toBe("ok")
  })
})

describe("Masker — dedupe", () => {
  it("dedups bash with same params, keeping the most recent", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "bash", { command: "ls" }),
      result("c1", "bash", "first ls"),
      call("c2", "bash", { command: "ls" }),
      result("c2", "bash", "second ls"),
    ]
    const masker = mask()
    const out = masker.apply(withIds(messages), P)

    expect(firstText(out[2])).toContain("[masked:")
    expect(firstText(out[4])).toBe("second ls")
  })

  it("`*` default is dedupe:true", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "search", { q: "foo" }),
      result("c1", "search", "first"),
      call("c2", "search", { q: "foo" }),
      result("c2", "search", "second"),
    ]
    const masker = mask()
    const out = masker.apply(withIds(messages), P)
    expect(firstText(out[2])).toContain("[masked:")
    expect(firstText(out[4])).toBe("second")
  })

  it("string[] dedupe projects to listed top-level keys", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "fetch", { headers: { a: 1 }, url: "http://x" }),
      result("c1", "fetch", "first"),
      call("c2", "fetch", { headers: { a: 2 }, url: "http://x" }),
      result("c2", "fetch", "second"),
    ]
    // Different headers, same url. With `dedupe: ["url"]`, both share a
    // key and the first gets masked.
    const masker = mask({ tools: [{ tool: "fetch", key: (p) => String(p.url) }] })
    const out = masker.apply(withIds(messages), P)
    expect(firstText(out[2])).toContain("[masked:")
    expect(firstText(out[4])).toBe("second")
  })

  it("dedupe:false exempts a tool", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "bash", { command: "ls" }),
      result("c1", "bash", "first ls"),
      call("c2", "bash", { command: "ls" }),
      result("c2", "bash", "second ls"),
    ]
    const masker = mask({ tools: [] }) // no config for "bash" → dedupe:false
    const out = masker.apply(withIds(messages), P)
    expect(masker.stamped).toBe(0)
    expect(firstText(out[2])).toBe("first ls")
  })

  it("does not dedupe file ops (they go through file pass)", () => {
    // Two reads of foo.ts with same params — file pass keeps both
    // (none stale, no later modify), dedupe pass must skip them.
    const messages: Message[] = [
      user("u"),
      call("c1", "read", { path: "foo.ts" }),
      result("c1", "read", "first", { meta: fileMeta("foo.ts", "read", true) }),
      call("c2", "read", { path: "foo.ts" }),
      result("c2", "read", "second", { meta: fileMeta("foo.ts", "read", true) }),
    ]
    // With keep.read: 1, the stale first read is allowed to stay.
    const masker = mask({ files: { read: 1 } })
    const out = masker.apply(withIds(messages), P)
    expect(firstText(out[2])).toBe("first")
    expect(firstText(out[4])).toBe("second")
  })
})

describe("Masker — invariants", () => {
  it("never masks error results", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "bash", { command: "ls" }),
      result("c1", "bash", "first ls"),
      call("c2", "bash", { command: "ls" }),
      result("c2", "bash", "second ls", { isError: true }),
    ]
    const masker = mask()
    const out = masker.apply(withIds(messages), P)
    // c2 errored, c1 still present → c1 is the "most recent successful";
    // dedupe sees only one valid candidate so nothing gets masked.
    expect(firstText(out[2])).toBe("first ls")
    expect(firstText(out[4])).toBe("second ls")
  })

  it("stamp is durable — second pass produces identical bytes", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "bash", { command: "ls" }),
      result("c1", "bash", "first"),
      call("c2", "bash", { command: "ls" }),
      result("c2", "bash", "second"),
    ]
    const masker = mask()
    const stamped = withIds(messages)
    const a = masker.apply(stamped, P)
    const b = masker.apply(stamped, P)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("messages without `id` are passed through untouched", () => {
    const messages: Message[] = [
      user("u"),
      call("c1", "bash", { command: "ls" }),
      result("c1", "bash", "first"),
      call("c2", "bash", { command: "ls" }),
      result("c2", "bash", "second"),
    ]
    // No withIds() — the masker must not stamp anything when ids are
    // missing, since stamping requires stable identity.
    const masker = mask()
    const out = masker.apply(messages, P)
    expect(masker.stamped).toBe(0)
    expect(firstText(out[2])).toBe("first")
    expect(firstText(out[4])).toBe("second")
  })
})
