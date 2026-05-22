import type { Node } from "../../src/core/node.ts"

import { installLogger, Logger } from "@zaly/shared/logger"
import { afterEach, describe, expect, test, vi } from "vitest"
import { TuiReporter } from "../../src/logger/logger.ts"
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
  test("detach stops appending to the stream", () => {
    const s = fakeStream()
    const reporter = new TuiReporter({ write: () => {} })
    const logger = new Logger().attach("tui", reporter)
    reporter.attach(s)
    reporter.detach()
    logger.info("after")
    expect(s.nodes).toHaveLength(0)
  })

  test("custom factory is used", () => {
    const s = fakeStream()
    const custom = vi.fn(
      (level: string, msg: unknown[]) => new Text({ content: `[${level}] ${msg.join(" ")}` })
    )
    const reporter = new TuiReporter({ factory: custom })
    const logger = new Logger().attach("tui", reporter)
    reporter.attach(s)
    logger.warn("a", "b")
    expect(custom).toHaveBeenCalledWith("warn", ["a", "b"])
    expect(s.nodes[0]).toBeInstanceOf(Text)
  })
})

describe("Logger — no stream attached (fallback)", () => {
  test("error/fatal/warn route to stderr, rest to stdout", () => {
    const writes: { kind: string; text: string }[] = []
    const reporter = new TuiReporter({ write: (text, kind) => writes.push({ kind, text }) })
    const logger = new Logger().attach("tui", reporter)
    logger.info("i")
    logger.error("e")
    logger.warn("w")
    logger.fatal("f")
    logger.debug("d") // below minLevel by default — skipped
    expect(writes.map((w) => w.kind)).toEqual(["stdout", "stderr", "stderr", "stderr"])
  })

  test("each write ends with a newline", () => {
    const writes: string[] = []
    const reporter = new TuiReporter({ write: (text) => writes.push(text) })
    const logger = new Logger().attach("tui", reporter)
    logger.info("hi")
    expect(writes[0].endsWith("\n")).toBe(true)
  })

  test("fallback content contains the inspected body", () => {
    const writes: string[] = []
    const reporter = new TuiReporter({ write: (text) => writes.push(text) })
    const logger = new Logger().attach("tui", reporter)
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
    const reporter = new TuiReporter()
    const logger = new Logger().attach("tui", reporter)
    reporter.attach(s)
    const originalLog = console.log
    const uninstall = installLogger(logger)
    expect(console.log).not.toBe(originalLog)
    console.log("from-console")
    expect(s.nodes).toHaveLength(1)
    uninstall()
    expect(console.log).toBe(originalLog)
  })
})
