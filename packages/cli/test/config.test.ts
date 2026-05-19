import type { CliArgs } from "../src/cli.ts"

import { describe, expect, test } from "vitest"
import { resolveConfig } from "../src/config.ts"

const baseArgs = {
  _: [],
  cwd: "/tmp/zaly-test",
} as unknown as CliArgs

describe("resolveConfig", () => {
  test("normalises cwd", () => {
    const cfg = resolveConfig({ ...baseArgs, cwd: "/tmp/zaly-test/" } as CliArgs)
    expect(cfg.cwd).toBe("/tmp/zaly-test")
  })

  test("--reasoning takes precedence; --thinking is the fallback alias", () => {
    expect(
      resolveConfig({ ...baseArgs, reasoning: "high", thinking: "low" } as CliArgs).reasoning
    ).toBe("high")
    expect(resolveConfig({ ...baseArgs, thinking: "low" } as CliArgs).reasoning).toBe("low")
  })

  test("yolo defaults to false; coerces explicit true", () => {
    expect(resolveConfig(baseArgs).yolo).toBe(false)
    expect(resolveConfig({ ...baseArgs, yolo: true } as CliArgs).yolo).toBe(true)
  })

  describe("--tools parsing", () => {
    test("undefined → undefined (caller falls back to defaults)", () => {
      expect(resolveConfig(baseArgs).tools).toBeUndefined()
    })

    test("comma-separated values get split + trimmed", () => {
      const cfg = resolveConfig({ ...baseArgs, tools: "read, write,exec " } as CliArgs)
      expect(cfg.tools).toEqual(["read", "write", "exec"])
    })

    test("repeated --tools merges across occurrences", () => {
      // citty's `ParsedArgs` types `tools` as `string`, but at runtime
      // repeated `--tools` flags collapse to `string[]` — which is what
      // `parseTools` is built to handle. Cast through `unknown` to bypass
      // the static type and exercise the array path.
      const cfg = resolveConfig({
        ...baseArgs,
        tools: "read,write,exec",
      } as unknown as CliArgs)
      expect(cfg.tools).toEqual(["read", "write", "exec"])
    })

    test("empty / whitespace-only input collapses to undefined", () => {
      expect(resolveConfig({ ...baseArgs, tools: "" } as CliArgs).tools).toBeUndefined()
      expect(resolveConfig({ ...baseArgs, tools: " , ,  " } as CliArgs).tools).toBeUndefined()
    })
  })

  test("api-key + model + theme pass through verbatim", () => {
    const cfg = resolveConfig({
      ...baseArgs,
      apiKey: "sk-...",
      model: "claude-opus-4-7",
      theme: "tokyonight",
    } as unknown as CliArgs)
    expect(cfg.apiKey).toBe("sk-...")
    expect(cfg.model).toBe("claude-opus-4-7")
    expect(cfg.theme).toBe("tokyonight")
  })
})
