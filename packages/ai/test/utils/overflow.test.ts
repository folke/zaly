import { describe, expect, test } from "vitest"
import { isContextOverflow } from "../../src/utils/overflow.ts"

describe("isContextOverflow — message patterns", () => {
  test("Anthropic: prompt is too long", () => {
    expect(
      isContextOverflow({ message: "prompt is too long: 250000 tokens > 200000 maximum" })
    ).toBe(true)
  })

  test("Anthropic: request_too_large", () => {
    expect(isContextOverflow({ message: "request_too_large" })).toBe(true)
  })

  test("OpenAI / OpenRouter: exceeds the context window", () => {
    expect(
      isContextOverflow({
        message: "This model's maximum context length is 128000 tokens. Your input exceeds the context window.",
      })
    ).toBe(true)
  })

  test("Google Gemini", () => {
    expect(isContextOverflow({ message: "The input token count exceeds the maximum." })).toBe(true)
  })

  test("xAI Grok", () => {
    expect(
      isContextOverflow({ message: "maximum prompt length is 131072 but request contains 150000" })
    ).toBe(true)
  })

  test("Groq", () => {
    expect(isContextOverflow({ message: "Please reduce the length of the messages." })).toBe(true)
  })

  test("Mistral", () => {
    expect(
      isContextOverflow({
        message: "Prompt contains 40000 tokens ... too large for model with 32000 maximum context length",
      })
    ).toBe(true)
  })

  test("Moonshot Kimi", () => {
    expect(
      isContextOverflow({ message: "exceeded model token limit: 128000 (requested: 145000)" })
    ).toBe(true)
  })

  test("z.ai silent-overflow finish reason surfaced as error", () => {
    expect(isContextOverflow({ message: "model_context_window_exceeded" })).toBe(true)
  })

  test("llama.cpp / Ollama / LM Studio variants", () => {
    expect(isContextOverflow({ message: "exceeds the available context size" })).toBe(true)
    expect(isContextOverflow({ message: "greater than the context length" })).toBe(true)
    expect(
      isContextOverflow({ message: "prompt too long: 200000 tokens exceeded max context length of 128000" })
    ).toBe(true)
  })

  test("rate-limit messages are excluded", () => {
    expect(isContextOverflow({ message: "rate limit exceeded, please retry" })).toBe(false)
    expect(isContextOverflow({ message: "429: Too Many Requests" })).toBe(false)
    expect(
      isContextOverflow({ message: "Throttling error: rate of calls exceeded" })
    ).toBe(false)
  })

  test("unrelated errors are not flagged", () => {
    expect(isContextOverflow({ message: "invalid api key" })).toBe(false)
    expect(isContextOverflow({ message: "model not found" })).toBe(false)
    expect(isContextOverflow({ message: "" })).toBe(false)
    expect(isContextOverflow({})).toBe(false)
  })
})

describe("isContextOverflow — silent overflow via usage", () => {
  test("flags when reported input exceeds the context limit", () => {
    expect(isContextOverflow({ contextLimit: 128_000, usageInput: 150_000 })).toBe(true)
  })

  test("does not flag when input is within the limit", () => {
    expect(isContextOverflow({ contextLimit: 128_000, usageInput: 100_000 })).toBe(false)
  })

  test("does not flag at exactly the limit", () => {
    expect(isContextOverflow({ contextLimit: 128_000, usageInput: 128_000 })).toBe(false)
  })

  test("skipped when either side is missing", () => {
    expect(isContextOverflow({ usageInput: 200_000 })).toBe(false)
    expect(isContextOverflow({ contextLimit: 128_000 })).toBe(false)
  })

  test("skipped on zero context limit", () => {
    expect(isContextOverflow({ contextLimit: 0, usageInput: 1 })).toBe(false)
  })
})

describe("isContextOverflow — combined message + usage", () => {
  test("message overflow short-circuits before usage check", () => {
    expect(
      isContextOverflow({
        contextLimit: 200_000,
        message: "prompt is too long: 250000 tokens",
        usageInput: 100,
      })
    ).toBe(true)
  })

  test("non-overflow message does not suppress silent-overflow check", () => {
    expect(
      isContextOverflow({
        contextLimit: 128_000,
        message: "this is some unrelated error",
        usageInput: 150_000,
      })
    ).toBe(true)
  })

  test("rate-limit message blocks both paths", () => {
    expect(
      isContextOverflow({
        contextLimit: 128_000,
        message: "rate limit",
        usageInput: 150_000,
      })
    ).toBe(false)
  })
})
