import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join } from "pathe"
import { expect, test } from "vitest"

const generator = new URL("../src/schemas.ts", import.meta.url).href

test("standalone generation bundles helpers, retains diagnostics, and is deterministic", async () => {
  const root = mkdtempSync(join(tmpdir(), "zaly-schema-"))
  try {
    mkdirSync(join(root, "src/schemas/tpl"), { recursive: true })
    writeFileSync(join(root, "package.json"), '{"type":"module"}')
    const schema = {
      $defs: {
        Item: {
          additionalProperties: false,
          properties: { id: { type: "number" } },
          required: ["id"],
          type: "object",
        },
      },
      additionalProperties: false,
      properties: {
        color: { pattern: "^#[0-9a-f]{6}$", type: "string" },
        items: { items: { $ref: "#/$defs/Item" }, type: "array", uniqueItems: true },
        label: { minLength: 2, type: "string" },
      },
      required: ["color", "items", "label"],
      type: "object",
    }
    writeFileSync(
      join(root, "src/schemas/tpl/example.ts"),
      `export const schema = ${JSON.stringify(schema)}`
    )
    const generate = () =>
      execFileSync("bun", [
        "--eval",
        `import { generateSchemas } from ${JSON.stringify(generator)}; await generateSchemas(${JSON.stringify(root)})`,
      ])
    generate()
    const output = join(root, "src/schemas/gen/example.ts")
    const code = readFileSync(output, "utf8")
    const { check, validate } = await import(pathToFileURL(output).href)
    expect(check({ color: "#123abc", items: [{ id: 1 }], label: "ok" })).toBe(true)
    expect(check({ color: "#123abc", items: [{ id: 1 }], label: "😀" })).toBe(false)
    expect(() => validate({ color: "#123abc", items: [{ id: 1 }], label: "😀" })).toThrow(/label/)
    expect(check({ color: "#123abc", items: [{ id: 1 }, { id: 1 }], label: "ok" })).toBe(false)
    expect(() =>
      validate({ color: "#123abc", items: [{ id: 1 }, { id: 1 }], label: "ok" })
    ).toThrow(/duplicate/)
    expect(code).not.toMatch(/^\s*import\s/m)
    execFileSync(
      "node",
      [
        "--input-type=module",
        "--eval",
        `import { check } from ${JSON.stringify(pathToFileURL(output).href)}; if (!check({color: "#123abc", items: [{id: 1}], label: "ok"})) throw new Error("Standalone validation failed")`,
      ],
      { cwd: root }
    )
    expect(code).not.toMatch(/new Function\b/)
    expect(
      JSON.parse(readFileSync(join(root, "assets/schemas/example.schema.json"), "utf8"))
    ).toEqual(schema)
    generate()
    expect(readFileSync(output, "utf8")).toBe(code)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
