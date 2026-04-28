import type { Provider } from "../../src/provider.ts"

import { describe, expect, test } from "vitest"
import { loadProvider, registerProvider } from "../../src/providers/index.ts"

const fakeProvider = (id: string): Provider => ({
  id,
  // oxlint-disable-next-line require-yield
  async *stream() {
    return
  },
})

describe("loadProvider — built-ins", () => {
  test("loads anthropic", async () => {
    const p = await loadProvider("anthropic", { apiKey: "x" })
    expect(p.id).toBe("anthropic")
  })
  test("loads openai", async () => {
    const p = await loadProvider("openai", { apiKey: "x" })
    expect(p.id).toBe("openai")
  })
})

describe("loadProvider — custom registrations", () => {
  test("registerProvider exposes a new adapter family", async () => {
    registerProvider("mock-loader-test", () => Promise.resolve(fakeProvider("mock-loader-test")))
    const p = await loadProvider("mock-loader-test", {})
    expect(p.id).toBe("mock-loader-test")
  })

  test("custom registration overrides a built-in with the same name", async () => {
    registerProvider("anthropic", () => Promise.resolve(fakeProvider("anthropic-override")))
    const p = await loadProvider("anthropic", {})
    expect(p.id).toBe("anthropic-override")
    // Re-register a no-op-ish replacement to avoid leaking into other tests
    // — second registration with the same name replaces.
    registerProvider("anthropic", (opts) =>
      import("../../src/providers/anthropic.ts").then((m) => m.createAnthropic(opts))
    )
  })

  test("re-registering with the same name replaces the previous loader", async () => {
    registerProvider("mock-replace-test", () => Promise.resolve(fakeProvider("v1")))
    const v1 = await loadProvider("mock-replace-test", {})
    expect(v1.id).toBe("v1")
    registerProvider("mock-replace-test", () => Promise.resolve(fakeProvider("v2")))
    const v2 = await loadProvider("mock-replace-test", {})
    expect(v2.id).toBe("v2")
  })
})

describe("loadProvider — unknown adapter", () => {
  test("throws with a list of registered names", async () => {
    await expect(loadProvider("__definitely_not_a_provider__", {})).rejects.toThrow(
      /Unknown adapter/
    )
  })
})
