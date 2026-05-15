import type { Node } from "../../src/core/node.ts"

import { afterEach, describe, expect, test, vi } from "vitest"
import { Logger } from "../../src/logger/logger.ts"
import { Markdown } from "../../src/widgets/markdown.ts"
import { Log } from "../../src/widgets/log.ts"
import { Text } from "../../src/widgets/text.ts"

const fakeStream = () => {
  const nodes: Node[] = []
  return {
    append<N extends Node>(node: () => N): N {
      const n = node()
      nodes.push(n)
      return n
    },
    nodes,
  }
}

describe("Logger — stream attached", () => {
  test("appends a Log node to the stream", () => {
    const s = fakeStream()
    const logger = new Logger()
    logger.attach(s)
    logger.info("hello")
    expect(s.nodes).toHaveLength(1)
    expect(s.nodes[0]).toBeInstanceOf(Log)
    expect((s.nodes[0] as Log).state.level).toBe("info")
  })

  test("string body with markdown markers becomes a Markdown child", () => {
    const s = fakeStream()
    const logger = new Logger()
    logger.attach(s)
    logger.info("**bold** text")
    const node = s.nodes[0] as Log
    expect(node.state.content).toBeInstanceOf(Markdown)
  })

  test("plain string body wraps in Text (via log widget's string path)", () => {
    const s = fakeStream()
    const logger = new Logger()
    logger.attach(s)
    logger.info("plain text")
    const node = s.nodes[0] as Log
    expect(typeof node.state.content).toBe("string")
    expect(node.state.content).toBe("plain text")
  })

  test("minLevel filters entries below threshold", () => {
    const s = fakeStream()
    const logger = new Logger({ minLevel: "warn" })
    logger.attach(s)
    logger.info("filtered")
    logger.warn("kept")
    expect(s.nodes).toHaveLength(1)
    expect((s.nodes[0] as Log).state.level).toBe("warn")
  })

  test("object bodies carry ANSI color codes from util.inspect", async () => {
    const s = fakeStream()
    const logger = new Logger()
    logger.attach(s)
    logger.info({ n: 1, s: "hi" })
    const node = s.nodes[0] as Log
    const { createCtx } = await import("../../src/core/ctx.ts")
    const rows = await node.render(createCtx({ width: 80 }))
    expect(rows.join("\n")).toMatch(/\x1b\[[0-9;]*m/)
  })

  test("Error values → message only by default", () => {
    const s = fakeStream()
    const logger = new Logger()
    logger.attach(s)
    logger.error(new Error("boom"))
    expect((s.nodes[0] as Log).state.content).toBe("boom")
  })

  test("detach stops appending to the stream", () => {
    const s = fakeStream()
    const logger = new Logger({ write: () => {} })
    logger.attach(s)
    logger.detach()
    logger.info("after")
    expect(s.nodes).toHaveLength(0)
  })

  test("custom factory is used", () => {
    const s = fakeStream()
    const custom = vi.fn(
      (level: string, msg: unknown[]) => new Text({ content: `[${level}] ${msg.join(" ")}` })
    )
    const logger = new Logger({ factory: custom })
    logger.attach(s)
    logger.warn("a", "b")
    expect(custom).toHaveBeenCalledWith("warn", ["a", "b"])
    expect(s.nodes[0]).toBeInstanceOf(Text)
  })
})

describe("Logger — no stream attached (fallback)", () => {
  test("error/fatal/warn route to stderr, rest to stdout", () => {
    const writes: { kind: string; text: string }[] = []
    const logger = new Logger({ write: (text, kind) => writes.push({ kind, text }) })
    logger.info("i")
    logger.error("e")
    logger.warn("w")
    logger.fatal("f")
    logger.debug("d") // below minLevel by default — skipped
    expect(writes.map((w) => w.kind)).toEqual(["stdout", "stderr", "stderr", "stderr"])
  })

  test("each write ends with a newline", () => {
    const writes: string[] = []
    const logger = new Logger({ write: (text) => writes.push(text) })
    logger.info("hi")
    expect(writes[0].endsWith("\n")).toBe(true)
  })

  test("fallback content contains the inspected body", () => {
    const writes: string[] = []
    const logger = new Logger({ write: (text) => writes.push(text) })
    logger.info("hello world")
    expect(writes[0]).toContain("hello world")
  })
})

describe("Logger — console install/uninstall", () => {
  const saved = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    trace: console.trace,
    warn: console.warn,
  }
  afterEach(() => {
    Object.assign(console, saved)
    // Clean the stash keys in case uninstall was skipped.
    for (const k of Object.keys(console)) {
      if (k.startsWith("__")) delete (console as unknown as Record<string, unknown>)[k]
    }
  })

  test("patches console.* to route through logger, restores on uninstall", () => {
    const s = fakeStream()
    const logger = new Logger()
    logger.attach(s)
    const originalLog = console.log
    logger.install()
    expect(console.log).not.toBe(originalLog)
    console.log("from-console")
    expect(s.nodes).toHaveLength(1)
    expect((s.nodes[0] as Log).state.level).toBe("log")

    logger.uninstall()
    expect(console.log).toBe(originalLog)
  })

  test("uninstall is safe when install was never called", () => {
    const logger = new Logger({ write: () => {} })
    expect(() => logger.uninstall()).not.toThrow()
  })
})
