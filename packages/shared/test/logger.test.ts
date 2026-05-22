import { describe, expect, test } from "vitest"
import { isLogLevel, LOG_LEVELS, BaseLogger, shouldLog } from "../src/logger.ts"

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

describe("LoggerBase", () => {
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
