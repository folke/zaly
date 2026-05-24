// oxlint-disable unicorn/no-await-expression-member
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { filesSource } from "../../../src/widgets/completions/files.ts"
import { fuzzyScore } from "../../../src/widgets/completions/fuzzy.ts"

const match = (q: string) => (s: string) => fuzzyScore(q, s)

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zaly-files-"))
  await mkdir(join(root, "src"))
  await mkdir(join(root, "src", "widgets"))
  await writeFile(join(root, "README.md"), "")
  await writeFile(join(root, "package.json"), "")
  await writeFile(join(root, "src", "index.ts"), "")
  await writeFile(join(root, "src", "widgets", "input.ts"), "")
  await writeFile(join(root, "src", "widgets", "menu.ts"), "")
  await writeFile(join(root, ".hidden"), "")
})

afterAll(async () => {
  await (await import("node:fs/promises")).rm(root, { force: true, recursive: true })
})

describe("filesSource", () => {
  test("lists cwd entries with a trailing slash on directories", async () => {
    const src = filesSource({ cwd: root })
    const items = await src.complete("", match(""))
    const values = items.map((i) => i.value)
    expect(values).toContain("src/")
    expect(values).toContain("README.md")
    expect(values).toContain("package.json")
  })

  test("default filter hides dotfiles", async () => {
    const src = filesSource({ cwd: root })
    const items = await src.complete("", match(""))
    expect(items.map((i) => i.value)).not.toContain(".hidden")
  })

  test("custom filter overrides default (keeps dotfiles)", async () => {
    const src = filesSource({ cwd: root, filter: () => true })
    const items = await src.complete("", match(""))
    expect(items.map((i) => i.value)).toContain(".hidden")
  })

  test("filter receives Dirent (isFile / isDirectory) and abs path", async () => {
    const src = filesSource({
      cwd: root,
      filter: (ent) => ent.isDirectory(),
    })
    const items = await src.complete("", match(""))
    expect(items.every((i) => i.value.endsWith("/"))).toBe(true)
  })

  test("resolves nested paths via trailing-slash segments", async () => {
    const src = filesSource({ cwd: root })
    const items = await src.complete("src/", match("src/"))
    const values = items.map((i) => i.value)
    expect(values).toContain("src/widgets/")
    expect(values).toContain("src/index.ts")
  })

  test("fuzzy-matches basenames", async () => {
    const src = filesSource({ cwd: root })
    const items = await src.complete("src/widgets/inpt", match("src/widgets/inpt"))
    expect(items.map((i) => i.value)).toContain("src/widgets/input.ts")
  })

  test("accept prepends the trigger prefix (default @) and a trailing space for files", () => {
    const src = filesSource({ cwd: root })
    const inserted = src.accept!({ value: "src/index.ts" }, "src/index.ts")
    expect(inserted).toBe("@src/index.ts ")
  })

  test("accept leaves directories without a trailing space so users can drill deeper", () => {
    const src = filesSource({ cwd: root })
    const inserted = src.accept!({ value: "src/" }, "src/")
    expect(inserted).toBe("@src/")
  })

  test("accept uses a custom prefix when configured", () => {
    const src = filesSource({ cwd: root, prefix: "#", trigger: /(?<=^|\s)#/ })
    const inserted = src.accept!({ value: "README.md" }, "README.md")
    expect(inserted).toBe("#README.md ")
  })

  test("default trigger matches @ at word boundary without eating the space", () => {
    const src = filesSource({ cwd: root })
    const rx = src.triggers[0]
    expect("@src".match(rx)?.[0]).toBe("@")
    expect("hello @src".match(rx)?.[0]).toBe("@")
    expect("email@foo".match(rx)?.[0]).toBeUndefined()
  })

  test("limit caps results", async () => {
    const src = filesSource({ cwd: root, limit: 2 })
    const items = await src.complete("", match(""))
    expect(items.length).toBe(2)
  })
})
