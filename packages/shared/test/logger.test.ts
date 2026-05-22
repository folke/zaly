import { describe, expect, test } from "vitest"
import { isLogLevel, LOG_LEVELS, BaseLogger, Logger, shouldLog } from "../src/logger.ts"

describe("LOG_LEVELS", () => {
  test("contains all expected levels minus prompt", () => {
    expect(LOG_LEVELS).toEqual([
      "trace",
      "debug",
      "log",
      "info",
      "success",
      "cancel",
      "warn",
      "error",
      "fatal",
    ])
  })

  test("does not contain prompt", () => {
    expect((LOG_LEVELS as readonly string[]).includes("prompt")).toBe(false)
  })
})

describe("isLogLevel", () => {
  test("true for known levels", () => {
    expect(isLogLevel("error")).toBe(true)
    expect(isLogLevel("trace")).toBe(true)
  })

  test("false for unknown strings (including 'prompt')", () => {
    expect(isLogLevel("prompt")).toBe(false)
    expect(isLogLevel("xyz")).toBe(false)
  })
})

describe("shouldLog", () => {
  test("default minLevel is 'log' (admits log/info/success/cancel/warn/error/fatal)", () => {
    expect(shouldLog("trace")).toBe(false)
    expect(shouldLog("debug")).toBe(false)
    expect(shouldLog("log")).toBe(true)
    expect(shouldLog("info")).toBe(true)
    expect(shouldLog("warn")).toBe(true)
    expect(shouldLog("error")).toBe(true)
  })

  test("respects explicit minLevel", () => {
    expect(shouldLog("info", "warn")).toBe(false)
    expect(shouldLog("warn", "warn")).toBe(true)
    expect(shouldLog("fatal", "warn")).toBe(true)
  })

  test("unknown levels always pass through", () => {
    expect(shouldLog("custom", "fatal")).toBe(true)
  })
})

describe("BaseLogger", () => {
  test("wires all level methods to _log", () => {
    const calls: [string, unknown[]][] = []
    class L extends BaseLogger {
      $log(level: string, ...msg: unknown[]) {
        calls.push([level, msg])
      }
    }
    const l = new L()
    l.trace("t")
    l.debug("d")
    l.log("lg")
    l.info("i")
    l.success("s")
    l.cancel("c")
    l.warn("w")
    l.error("e")
    l.fatal("f")
    expect(calls.map((c) => c[0])).toEqual([
      "trace",
      "debug",
      "log",
      "info",
      "success",
      "cancel",
      "warn",
      "error",
      "fatal",
    ])
    expect(calls.map((c) => c[1])).toEqual([
      ["t"],
      ["d"],
      ["lg"],
      ["i"],
      ["s"],
      ["c"],
      ["w"],
      ["e"],
      ["f"],
    ])
  })

  test("forwards all args", () => {
    const calls: unknown[][] = []
    class L extends BaseLogger {
      $log(_level: string, ...msg: unknown[]) {
        calls.push(msg)
      }
    }
    const l = new L()
    l.info("hello %s", "world", { n: 1 })
    expect(calls[0]).toEqual(["hello %s", "world", { n: 1 }])
  })
})

describe("Logger", () => {
  test("attaching a sink through a child attaches to the root", () => {
    const calls: unknown[] = []
    const root = new Logger({ name: "root" })
    const child = root.child("child")

    child.attach("test", (entry) => calls.push(entry))
    child.info("hello")

    expect(calls).toHaveLength(1)
    expect(root.sinks.size).toBe(1)
    expect(child.sinks.size).toBe(0)
  })

  test("child entries include merged metadata and colon-scoped name", () => {
    const calls: unknown[] = []
    const root = new Logger({ app: "zaly", name: "root" })
    const child = root.child({ component: "agent", name: "child" })

    root.attach("test", (entry) => calls.push(entry))
    child.warn("hello")

    expect(calls[0]).toMatchObject({
      level: "warn",
      meta: { app: "zaly", component: "agent", name: "root:child" },
      msg: ["hello"],
    })
  })

  test("children inherit the current parent level", () => {
    const calls: unknown[] = []
    const root = new Logger({ name: "root" }, { level: "warn" })
    const child = root.child("child")

    root.attach("test", (entry) => calls.push(entry))
    child.info("skip")
    child.warn("keep")

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ level: "warn", msg: ["keep"] })
  })

  test("child level can override parent level", () => {
    const calls: unknown[] = []
    const root = new Logger({ name: "root" }, { level: "fatal" })
    const child = root.child("child", { level: "trace" })

    root.attach("test", (entry) => calls.push(entry))
    child.debug("keep")

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ level: "debug", msg: ["keep"] })
  })
})
