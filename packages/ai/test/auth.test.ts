import type { ModelSpec, ProviderInfo } from "../src/types.ts"

import { describe, expect, test } from "vitest"
import { chainAuth, envAuth, hasAuth } from "../src/auth/index.ts"

const baseSpec: ModelSpec = {
  attachment: false,
  id: "x",
  limit: { context: 1000, output: 100 },
  modalities: { input: ["text"], output: ["text"] },
  name: "x",
  provider: "x",
  reasoning: false,
}

const withEnv = (envs: string[]): ModelSpec => ({
  ...baseSpec,
  providerInfo: { doc: "", env: envs, id: "x", models: {}, name: "x", npm: "x" } as ProviderInfo,
})

describe("envAuth", () => {
  test("returns the first non-empty env value as apiKey", async () => {
    const k = "ZALY_TEST_AUTH_PRIMARY"
    const before = process.env[k]
    process.env[k] = "secret"
    try {
      expect(await envAuth.getAuth(withEnv([k]))).toEqual({ apiKey: "secret" })
    } finally {
      if (before === undefined) delete process.env[k]
      else process.env[k] = before
    }
  })

  test("walks env list in order, skipping unset / empty values", async () => {
    const a = "ZALY_TEST_AUTH_A"
    const b = "ZALY_TEST_AUTH_B"
    delete process.env[a]
    process.env[b] = "second"
    try {
      expect(await envAuth.getAuth(withEnv([a, b]))).toEqual({ apiKey: "second" })
      process.env[a] = "" // empty also skipped
      expect(await envAuth.getAuth(withEnv([a, b]))).toEqual({ apiKey: "second" })
    } finally {
      delete process.env[a]
      delete process.env[b]
    }
  })

  test("returns undefined when nothing matches", async () => {
    const k = "ZALY_TEST_AUTH_MISSING_XYZ"
    delete process.env[k]
    expect(await envAuth.getAuth(withEnv([k]))).toBeUndefined()
  })

  test("returns undefined when providerInfo.env is absent", async () => {
    expect(await envAuth.getAuth(baseSpec)).toBeUndefined()
  })
})

describe("chainAuth", () => {
  test("first provider wins; later ones not consulted", async () => {
    const calls: string[] = []
    const p1 = {
      getAuth: () => {
        calls.push("p1")
        return { apiKey: "from-p1" }
      },
    }
    const p2 = {
      getAuth: () => {
        calls.push("p2")
        return { apiKey: "from-p2" }
      },
    }
    expect(await chainAuth(p1, p2).getAuth(baseSpec)).toEqual({ apiKey: "from-p1" })
    expect(calls).toEqual(["p1"])
  })

  test("falls through to next provider when one returns undefined", async () => {
    const p1 = { getAuth: () => undefined }
    const p2 = { getAuth: async () => ({ apiKey: "fallback" }) }
    expect(await chainAuth(p1, p2).getAuth(baseSpec)).toEqual({ apiKey: "fallback" })
  })

  test("returns undefined when every provider returns undefined", async () => {
    const p = { getAuth: () => undefined }
    expect(await chainAuth(p, p).getAuth(baseSpec)).toBeUndefined()
  })
})

describe("hasAuth", () => {
  test("true when credentials resolve", async () => {
    expect(await hasAuth(baseSpec, { getAuth: () => ({ apiKey: "k" }) })).toBe(true)
  })
  test("false when credentials don't resolve", async () => {
    expect(await hasAuth(baseSpec, { getAuth: () => undefined })).toBe(false)
  })
  test("defaults to envAuth", async () => {
    const k = "ZALY_TEST_HAS_AUTH"
    process.env[k] = "x"
    try {
      expect(await hasAuth(withEnv([k]))).toBe(true)
    } finally {
      delete process.env[k]
    }
  })
})
