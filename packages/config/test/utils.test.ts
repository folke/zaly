import { afterEach, describe, expect, test } from "vitest"
import { settingsReviver, settingsReviverIssues } from "../src/reviver.ts"
import { merge } from "../src/utils.ts"

let envRestore: Record<string, string | undefined> = {}
afterEach(() => {
  for (const [key, value] of Object.entries(envRestore)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  envRestore = {}
})

function setEnv(key: string, value: string | undefined) {
  if (!(key in envRestore)) envRestore[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

describe("merge", () => {
  test("deep merges objects while keeping higher-precedence arrays", () => {
    expect(
      merge(
        {},
        { tools: ["read"], ui: { collapsedTools: ["read"], listHeight: 5 } },
        { tools: ["bash", "edit"], ui: { collapsedTools: ["bash"] } }
      )
    ).toEqual({
      tools: ["read"],
      ui: { collapsedTools: ["read"], listHeight: 5 },
    })
  })
})

describe("settingsReviver", () => {
  test("expands env variables in strings and leaves non-strings untouched", () => {
    setEnv("ZALY_TEST_TOKEN", "secret")
    const bracedToken = ["$", "{ZALY_TEST_TOKEN}"].join("")
    expect(settingsReviver("key", `$ZALY_TEST_TOKEN/${bracedToken}/x`)).toBe("secret/secret/x")
    expect(settingsReviver("key", 42)).toBe(42)
    expect(settingsReviver("key", "plain")).toBe("plain")
  })

  test("collects missing env issues with nested object and array paths", () => {
    setEnv("SET_TOKEN", "ok")
    setEnv("MISSING_TOKEN", undefined)
    const missing = "$MISSING_TOKEN"
    const missingBraced = ["$", "{MISSING_TOKEN}"].join("")
    const settings = {
      model: "$SET_TOKEN",
      plugins: [missing],
      ui: { theme: missingBraced },
    }

    expect(settingsReviverIssues(settings)).toEqual([
      {
        msg: "env var `$MISSING_TOKEN` is not set",
        path: "settings.plugins[0]",
        type: "env",
        value: missing,
      },
      {
        msg: `env var \`${missingBraced}\` is not set`,
        path: "settings.ui.theme",
        type: "env",
        value: missingBraced,
      },
    ])
  })
})
