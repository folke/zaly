import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

function readSchema(pkg: string, name: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../../${pkg}/assets/schemas/${name}.schema.json`, import.meta.url),
      "utf8"
    )
  )
}

test.each([
  ["tui", "theme"],
  ["tui", "shiki-language"],
  ["tui", "shiki-theme"],
  ["config", "config"],
  ["config", "models"],
  ["config", "state"],
])("published %s/%s schema has no dangling local references", (pkg, name) => {
  const schema = readSchema(pkg, name)
  const walk = (value: unknown) => {
    if (value === null || typeof value !== "object") return
    const node = value as Record<string, unknown>
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
      const target = node.$ref
        .slice(2)
        .split("/")
        .reduce((parent, token) => {
          const key = decodeURIComponent(token).replaceAll("~1", "/").replaceAll("~0", "~")
          return parent?.[key]
        }, schema)
      expect(target).toBeDefined()
    }
    for (const child of Object.values(value)) walk(child)
  }
  walk(schema)
})

test("published theme schema preserves required and optional fields", () => {
  const schema = readSchema("tui", "theme")
  expect(schema.type).toBe("object")
  expect(schema.properties.appearance.enum).toEqual(["dark", "light"])
  expect(schema.required).toContain("id")
  expect(schema.required).toContain("primary")
  expect(schema.required).not.toContain("appearance")
  expect(schema.required).not.toContain("ui")
})

test("published config and models schemas describe objects rather than tuples", () => {
  const config = readSchema("config", "config")
  const models = readSchema("config", "models")
  expect(config.type).toBe("object")
  expect(config.properties.ui.properties.mode.enum).toEqual(["fullscreen", "scrollback"])
  expect(config.items).toBeUndefined()
  expect(models.type).toBe("object")
  expect(models.additionalProperties.type).toBe("object")
  expect(models.items).toBeUndefined()
})
