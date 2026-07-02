import { describe, expect, test, vi } from "vitest"
import {
  BaseLogger,
  consoleSink,
  installLogger,
  isLogLevel,
  Logger,
  LOG_LEVELS,
  shouldLog,
} from "../src/logger.ts"

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

  test("detach removes a sink from the root", () => {
    const calls: unknown[] = []
    const root = new Logger({ name: "root" })
    const child = root.child("child")
    child.attach("test", (entry) => calls.push(entry))
    child.detach("test")
    root.warn("skip")
    expect(calls).toHaveLength(0)
    expect(root.sinks.size).toBe(0)
  })

  test("level setter controls filtering", () => {
    const calls: unknown[] = []
    const logger = new Logger({ name: "root" }, { level: "fatal" })
    logger.attach("test", (entry) => calls.push(entry))
    logger.warn("skip")
    logger.level = "warn"
    logger.warn("keep")
    expect(logger.level).toBe("warn")
    expect(calls).toHaveLength(1)
  })

  test("meta returns a defensive copy", () => {
    const logger = new Logger({ name: "root", value: 1 })
    const meta = logger.meta as { name: string; value: number }
    meta.value = 2
    expect(logger.meta).toEqual({ name: "root", value: 1 })
  })

  test("parent and root expose logger hierarchy", () => {
    const root = new Logger({ name: "root" })
    const child = root.child("child")
    expect(child.parent).toBe(root)
    expect(child.root).toBe(root)
    expect(root.parent).toBeUndefined()
    expect(root.root).toBe(root)
  })

  test("supports reporter sinks", () => {
    const calls: unknown[] = []
    const logger = new Logger({ name: "root" })
    logger.attach("reporter", { $log: (entry) => calls.push(entry) })
    logger.error("boom")
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ level: "error", msg: ["boom"] })
  })

  test("try returns values and logs sync failures", () => {
    const calls: unknown[] = []
    const logger = new Logger({ name: "root" })
    logger.attach("test", (entry) => calls.push(entry))
    expect(logger.try(() => 42)).toBe(42)
    expect(logger.try(() => {
      throw new Error("boom")
    }, "child")).toBeUndefined()
    expect(calls[0]).toMatchObject({ level: "error", meta: { name: "root:child" } })
  })

  test("try returns undefined and logs async failures", async () => {
    const calls: unknown[] = []
    const logger = new Logger({ name: "root" })
    logger.attach("test", (entry) => calls.push(entry))
    await expect(logger.try(async () => {
      throw new Error("async boom")
    })).resolves.toBeUndefined()
    expect(calls[0]).toMatchObject({ level: "error" })
  })

  test("track rethrows sync and async failures", async () => {
    const logger = new Logger({ name: "root" })
    logger.attach("test", () => {})
    expect(() => logger.track(() => {
      throw new Error("sync")
    })).toThrow("sync")
    await expect(logger.track(async () => {
      throw new Error("async")
    })).rejects.toThrow("async")
  })
})

describe("consoleSink", () => {
  test("maps custom levels to console methods", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      consoleSink({ level: "success", meta: { name: "test" }, msg: ["ok"], ts: 1 })
      consoleSink({ level: "cancel", meta: { name: "test" }, msg: ["no"], ts: 1 })
      consoleSink({ level: "fatal", meta: { name: "test" }, msg: ["bad"], ts: 1 })
      expect(info).toHaveBeenCalledWith("ok", { meta: { name: "test" } })
      expect(warn).toHaveBeenCalledWith("no", { meta: { name: "test" } })
      expect(error).toHaveBeenCalledWith("bad", { meta: { name: "test" } })
    } finally {
      info.mockRestore()
      warn.mockRestore()
      error.mockRestore()
    }
  })
})

describe("installLogger", () => {
  test("patches and restores console methods", () => {
    const calls: unknown[][] = []
    const logger = new (class extends BaseLogger {
      $log(level: string, ...msg: unknown[]) {
        calls.push([level, ...msg])
      }
    })()

    const original = console.info
    const restore = installLogger(logger)
    try {
      console.info("hello")
      expect(calls).toEqual([["info", "hello"]])
    } finally {
      restore()
    }
    expect(console.info).toBe(original)
  })
})
