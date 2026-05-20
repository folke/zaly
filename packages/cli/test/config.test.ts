import type { ArgsDef } from "citty"
import type { CliArgs } from "../src/cli.ts"

import { parseArgs } from "citty"
import { describe, expect, test } from "vitest"
import { Cli, mainCommand } from "../src/cli.ts"
import { Context } from "../src/context.ts"

async function resolveConfig(args: string[]) {
  const cli = new Cli()
  const cmd = mainCommand(cli)
  const argsDef = (await (typeof cmd.args === "function" ? cmd.args() : cmd.args)) as ArgsDef
  const parsed = parseArgs(args, argsDef)
  return new Context(parsed as unknown as CliArgs).flags
}

const base = ["--cwd", "/tmp/zaly-test"]

describe("resolveConfig", () => {
  test("normalises cwd", async () => {
    const cfg = await resolveConfig(["--cwd", "/tmp/zaly-test/"])
    expect(cfg.cwd).toBe("/tmp/zaly-test")
  })

  test("--thinking is an alias for --reasoning", async () => {
    const a = await resolveConfig([...base, "--reasoning", "high"])
    const b = await resolveConfig([...base, "--thinking", "low"])
    expect(a.reasoning).toBe("high")
    expect(b.reasoning).toBe("low")
  })

  test("yolo defaults to false; --yolo coerces to true", async () => {
    const defaults = await resolveConfig(base)
    const explicit = await resolveConfig([...base, "--yolo"])
    expect(defaults.yolo).toBeFalsy()
    expect(explicit.yolo).toBe(true)
  })

  describe("--tools parsing", () => {
    test("undefined → undefined (caller falls back to defaults)", async () => {
      const cfg = await resolveConfig(base)
      expect(cfg.tools).toBeUndefined()
    })

    test("comma-separated values get split + trimmed", async () => {
      const cfg = await resolveConfig([...base, "--tools", "read, write,exec "])
      expect(cfg.tools).toEqual(["read", "write", "exec"])
    })

    test("empty / whitespace-only input collapses to undefined", async () => {
      const empty = await resolveConfig([...base, "--tools", ""])
      const whitespace = await resolveConfig([...base, "--tools", " , ,  "])
      expect(empty.tools).toBeUndefined()
      expect(whitespace.tools).toBeUndefined()
    })
  })

  test("api-key + model + theme pass through verbatim", async () => {
    const cfg = await resolveConfig([
      ...base,
      "--api-key",
      "sk-...",
      "--model",
      "claude-opus-4-7",
      "--theme",
      "tokyonight",
    ])
    expect(cfg.apiKey).toBe("sk-...")
    expect(cfg.model).toBe("claude-opus-4-7")
    expect(cfg.theme).toBe("tokyonight")
  })
})
