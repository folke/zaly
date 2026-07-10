import type { Logger } from "@zaly/shared/logger"
import type { AuthSecrets } from "../../src/auth/manager.ts"
import type { ModelProvider, ModelSpec, ProviderOptions } from "../../src/types.ts"

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { AuthManager, resolveApiKey } from "../../src/auth/manager.ts"

let dirs: string[] = []
let envRestore: Record<string, string | undefined> = {}

afterEach(() => {
  for (const [key, value] of Object.entries(envRestore)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  envRestore = {}
  for (const dir of dirs) rmSync(dir, { force: true, recursive: true })
  dirs = []
  vi.restoreAllMocks()
})

function setEnv(key: string, value: string | undefined) {
  if (!(key in envRestore)) envRestore[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function authPath() {
  const dir = mkdtempSync(join(tmpdir(), "zaly-ai-auth-"))
  dirs.push(dir)
  return join(dir, "auth.json")
}

function provider(overrides: Partial<ModelProvider> = {}): ModelProvider {
  return {
    api: "mock",
    id: "mock",
    models: [],
    name: "Mock Provider",
    ...overrides,
  }
}

function model(overrides: Partial<ModelSpec> = {}, p = provider()): ModelSpec {
  return {
    api: p.api ?? "mock",
    contextSize: 1000,
    id: `${p.id}/model`,
    input: ["text"],
    maxTokens: 100,
    name: `${p.id}/model`,
    output: ["text"],
    provider: p,
    reasoning: false,
    ...overrides,
  } as ModelSpec
}

describe("resolveApiKey", () => {
  test("normalizes string, object, function, and empty keys", async () => {
    await expect(resolveApiKey("key", "provider")).resolves.toEqual({
      key: "key",
      source: "provider",
    })
    const objectKey: ProviderOptions["apiKey"] = {
      headers: { A: "B" },
      key: "key",
      source: "model",
    }
    await expect(resolveApiKey(objectKey, "model")).resolves.toEqual({
      headers: { A: "B" },
      key: "key",
      source: "model",
    })
    await expect(resolveApiKey(async () => "fn-key", "model")).resolves.toEqual({
      key: "fn-key",
      source: "model",
    })
    await expect(resolveApiKey(undefined, "model")).resolves.toBeUndefined()
  })
})

describe("AuthManager store", () => {
  test("load creates a JSON-backed manager with empty default secrets", async () => {
    const path = authPath()
    const auth = await AuthManager.load(path)
    expect(auth.get("missing")).toBeUndefined()
    expect(existsSync(path)).toBe(false)
  })

  test("set and delete persist stored API keys", async () => {
    const path = authPath()
    const auth = await AuthManager.load(path)
    await auth.set("mock", { key: "stored", type: "api-key" })
    expect(auth.get("mock")).toEqual({ key: "stored", type: "api-key" })
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      mock: { key: "stored", type: "api-key" },
    })

    await auth.delete("mock")
    expect(auth.get("mock")).toBeUndefined()
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({})
  })

  test("set/delete/login require a JSON store", async () => {
    const auth = AuthManager.basic()
    await expect(auth.set("mock", { key: "x", type: "api-key" })).rejects.toThrow("JSON store")
    await expect(auth.delete("mock")).rejects.toThrow("JSON store")
    await expect(auth.login(provider())).rejects.toThrow("JSON store")
  })
})

describe("AuthManager resolution", () => {
  test("needAuth checks OAuth, provider apiKey, and env declarations", () => {
    const auth = AuthManager.basic()
    expect(auth.needAuth(provider())).toBe(false)
    expect(auth.needAuth(provider({ apiKey: "key" }))).toBe(true)
    expect(auth.needAuth(provider({ env: ["MOCK_KEY"] }))).toBe(true)
    expect(
      auth.needAuth(
        provider({
          oauth: {
            apiKey: () => ({ key: "oauth", source: "oauth" }),
            clientId: "client",
            name: "Mock OAuth",
            tokenUrl: "https://example.com/token",
          },
        })
      )
    ).toBe(true)
  })

  test("getAuth prefers model apiKey over store, provider apiKey, and env", async () => {
    setEnv("MOCK_KEY", "env-key")
    const path = authPath()
    const auth = await AuthManager.load(path)
    const p = provider({ apiKey: "provider-key", env: ["MOCK_KEY"] })
    await auth.set(p.id, { key: "stored-key", type: "api-key" })

    await expect(auth.getAuth(model({ apiKey: "model-key" }, p))).resolves.toEqual({
      key: "model-key",
      source: "model",
    })
  })

  test("getAuth falls back store → provider apiKey → env", async () => {
    setEnv("MOCK_KEY", "env-key")
    const path = authPath()
    const auth = await AuthManager.load(path)
    const p = provider({ apiKey: "provider-key", env: ["MOCK_KEY"] })

    await auth.set(p.id, { key: "stored-key", type: "api-key" })
    await expect(auth.getAuth(p)).resolves.toEqual({ key: "stored-key", source: "store" })

    await auth.delete(p.id)
    await expect(auth.getAuth(p)).resolves.toEqual({ key: "provider-key", source: "provider" })

    delete p.apiKey
    await expect(auth.getAuth(p)).resolves.toEqual({
      details: "MOCK_KEY",
      key: "env-key",
      source: "env",
    })
  })

  test("stored non-expired OAuth token returns key and headers without refresh", async () => {
    const path = authPath()
    const auth = await AuthManager.load(path)
    await auth.set("mock", {
      headers: { Authorization: "Bearer stored" },
      key: "stored-oauth-key",
      token: { access: "access", expires: Date.now() + 120_000, refresh: "refresh" },
      type: "oauth",
    })

    await expect(auth.getAuth(provider())).resolves.toEqual({
      headers: { Authorization: "Bearer stored" },
      key: "stored-oauth-key",
      source: "oauth",
    })
  })

  test("model apiKey object preserves headers", async () => {
    const auth = AuthManager.basic()
    const p = provider()
    const m = model(
      { apiKey: { headers: { "X-Test": "1" }, key: "model-key", source: "model" } },
      p
    )
    await expect(auth.getAuth(m)).resolves.toEqual({
      headers: { "X-Test": "1" },
      key: "model-key",
      source: "model",
    })
  })
})

describe("AuthManager secret resolution", () => {
  test("resolve expands env references and warns on missing variables", async () => {
    setEnv("TOKEN_A", "a")
    setEnv("TOKEN_B", "b")
    setEnv("MISSING_TOKEN", undefined)
    const warn = vi.fn()
    const logger = { warn } as unknown as Logger
    const auth = await AuthManager.load(authPath(), { logger })

    const secret = ["pre-$TOKEN_A-", "{TOKEN_B}"].join("$")
    await expect(auth.resolve(secret, provider())).resolves.toBe("pre-a-b")
    await expect(auth.resolve("$MISSING_TOKEN", provider())).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Missing env API key"))
  })

  test("resolve can leave env references untouched when env is disabled", async () => {
    setEnv("TOKEN_A", "a")
    const auth = await AuthManager.load(authPath(), { env: false })
    await expect(auth.resolve("$TOKEN_A", provider())).resolves.toBe("$TOKEN_A")
  })

  test("resolve runs and caches bash secrets when env resolution is disabled", async () => {
    const auth = await AuthManager.load(authPath(), { env: false })
    await expect(auth.resolve("!printf secret", provider())).resolves.toBe("secret")
    await expect(auth.resolve("!printf secret", provider())).resolves.toBe("secret")
  })

  test("resolve warns and returns undefined for empty bash output", async () => {
    const warn = vi.fn()
    const logger = { warn } as unknown as Logger
    const auth = await AuthManager.load(authPath(), { env: false, logger })
    await expect(auth.resolve("!printf ''", provider())).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Empty bash API key"))
  })
})

describe("AuthManager login", () => {
  test("login exposes API-key flow that stores trimmed keys", async () => {
    const auth = await AuthManager.load(authPath())
    const [login] = await auth.login(provider({ id: "mock", name: "Mock" }))
    const notify = vi.fn()
    const prompt = vi.fn(async () => "  key  ")

    await expect(login.login({ notify, prompt })).resolves.toEqual({ key: "key", source: "store" })
    expect(notify).toHaveBeenCalled()
    expect(auth.get("mock")).toEqual({ key: "key", type: "api-key" })
  })

  test("empty API-key login deletes stored key and returns undefined", async () => {
    const auth = await AuthManager.load(authPath())
    await auth.set("mock", { key: "old", type: "api-key" })
    const [login] = await auth.login(provider({ id: "mock", name: "Mock" }))

    await expect(login.login({ prompt: async () => "   " })).resolves.toBeUndefined()
    expect(auth.get("mock")).toBeUndefined()
  })

  test("aborted or cancelled API-key login does not modify the store", async () => {
    const auth = await AuthManager.load(authPath())
    await auth.set("mock", { key: "old", type: "api-key" })
    const [login] = await auth.login(provider({ id: "mock", name: "Mock" }))
    const ac = new AbortController()
    ac.abort()

    await expect(
      login.login({ prompt: async () => "new", signal: ac.signal })
    ).resolves.toBeUndefined()
    expect(auth.get("mock")).toEqual({ key: "old", type: "api-key" })
    await expect(login.login({ prompt: async () => undefined })).resolves.toBeUndefined()
    expect(auth.get("mock")).toEqual({ key: "old", type: "api-key" })
  })

  test("login includes OAuth methods when configured", async () => {
    const auth = await AuthManager.load(authPath())
    const logins = await auth.login(
      provider({
        oauth: {
          apiKey: () => ({ key: "oauth", source: "oauth" }),
          clientId: "client",
          name: "Mock OAuth",
          tokenUrl: "https://example.com/token",
          browser: {
            authorizeUrl: "https://example.com/authorize",
            redirectUrl: "http://localhost/callback",
            scope: "read",
          },
          device: {
            start: async () => ({
              deviceCode: "device",
              expires: Date.now() + 60_000,
              interval: 1,
              userCode: "user",
              verificationUrl: "https://example.com/device",
            }),
            poll: async () => ({ access: "access", expires: Date.now() + 60_000, ok: true }),
          },
        },
      })
    )

    expect(logins.map((login) => login.method)).toEqual([
      "oauth-browser",
      "oauth-device",
      "api-key",
    ])
  })
})

void ({} as AuthSecrets)
