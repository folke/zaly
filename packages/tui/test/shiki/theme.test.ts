import type { GeneratedShikiTheme } from "../../src/shiki/types.ts"

import { describe, expect, test } from "vitest"
import { shiki } from "../../src/shiki/api.ts"
import { ShikiWorkerClient } from "../../src/shiki/client.ts"
import { shikiTheme } from "../../src/shiki/theme.ts"
import { openAnsi } from "../../src/style/ansi.ts"
import { resolveAnsiStyle } from "../../src/style/style.ts"
import { defaultTheme, loadTheme } from "../../src/themes/registry.ts"
import { systemTheme } from "../../src/themes/system.ts"

const system = systemTheme()

describe("highlighting selection", () => {
  test("auto preserves a theme's bundled counterpart", () => {
    expect(shikiTheme(defaultTheme)).toBe(defaultTheme.shiki)
  })

  test("auto generates for system and custom themes without a counterpart", () => {
    expect(typeof shikiTheme(system)).toBe("object")
    expect(typeof shikiTheme({ ...defaultTheme, shiki: undefined })).toBe("object")
  })

  test("explicit selections override the theme's counterpart", () => {
    expect(shikiTheme(defaultTheme, "github-light")).toBe("github-light")
    expect(shikiTheme(system, "github-light")).toBe("github-light")
    expect(shikiTheme({ ...system, shiki: "github-dark" })).toBe("github-dark")
  })

  test("generated themes resolve semantic styles including attributes", () => {
    const generated = shikiTheme(system) as GeneratedShikiTheme
    expect(generated.styles).toContainEqual(resolveAnsiStyle("syntaxString", system))
    expect(generated.styles).toContainEqual(resolveAnsiStyle("comment", system))
    expect(shikiTheme(system)).toBe(generated)
  })

  test("cache keys change with colors, attributes and source", () => {
    const client = new ShikiWorkerClient()
    const request = { code: "true", lang: "typescript", theme: shikiTheme(system) }
    const key = client.key(request)
    expect(
      client.key({ ...request, theme: shikiTheme({ ...system, syntaxBoolean: "cyan" }) })
    ).not.toBe(key)
    expect(
      client.key({ ...request, theme: shikiTheme({ ...system, comment: { italic: false } }) })
    ).not.toBe(key)
    expect(client.key({ ...request, code: "false" })).not.toBe(key)
  })
})

describe("generated highlighting", () => {
  test("keeps terminal-native ANSI colors and comment attributes", async () => {
    const result = await shiki.highlight(
      'const message = "hello"; // comment',
      "typescript",
      shikiTheme(system)
    )
    expect(result).toContain(openAnsi({ fg: "green" }))
    expect(result).toContain(openAnsi(resolveAnsiStyle("comment", system)))
    expect(result).not.toContain("38;2;")
    expect(result).not.toContain("48;2;")
  })

  test("uses resolved RGB syntax slots without replacing the code background", async () => {
    const theme = { ...system, syntaxString: "#123456" as const }
    const result = await shiki.highlight('"hello"', "typescript", shikiTheme(theme))
    expect(result).toContain(openAnsi({ fg: "#123456" }))
    expect(result).not.toContain("48;2;")
  })

  test("theme changes do not reuse previous syntax colors", async () => {
    const first = { ...system, syntaxString: "#123456" as const }
    const second = { ...system, syntaxString: "#abcdef" as const }
    const a = await shiki.highlight('"hello"', "typescript", shikiTheme(first))
    const b = await shiki.highlight('"hello"', "typescript", shikiTheme(second))
    expect(a).toContain(openAnsi({ fg: "#123456" }))
    expect(b).toContain(openAnsi({ fg: "#abcdef" }))
    expect(b).not.toContain(openAnsi({ fg: "#123456" }))
  })

  test("switching between generated and bundled themes uses the requested theme", async () => {
    const generated = await shiki.highlight('"hello"', "typescript", shikiTheme(system))
    const bundled = await shiki.highlight('"hello"', "typescript", "github-dark")
    expect(bundled).not.toBe(generated)
    expect(bundled).toContain("38;2;")
    expect(await shiki.highlight('"hello"', "typescript", shikiTheme(system))).toBe(generated)
  })

  test("themes loaded through the registry preserve auto generation", async () => {
    expect(typeof shikiTheme(await loadTheme("system"))).toBe("object")
  })
})
