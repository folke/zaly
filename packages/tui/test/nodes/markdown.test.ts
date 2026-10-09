import { RESET, stripAnsi as stripControl } from "@zaly/shared/ansi"
// oxlint-disable unicorn/no-await-expression-member
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { renderMarkdown } from "#md"
import { createCtx } from "../../src/core/ctx.ts"
import { resetKittyGraphics } from "../../src/image/kitty.ts"
import { createNode } from "../../src/index.ts"
import { TerminalQueries } from "../../src/input/queries.ts"
import { InputRouter } from "../../src/input/router.ts"
import { createCallbacks } from "../../src/markdown/callbacks.ts"
import { createImageCallback } from "../../src/markdown/image.ts"
import { openStyle, resolveStyle } from "../../src/style/style.ts"
import { defaultTheme } from "../../src/themes/registry.ts"
import { markdown } from "../../src/widgets/markdown.ts"
import { mockMountCtx } from "../renderer/mock.ts"

// No-op `transmit` so kitty image transmits don't leak to stdout during
// tests. Tests that need to assert on transmit bytes pass their own.
const ctx = (width = 80) => createCtx({ theme: defaultTheme, transmit: () => {}, width })

function kgpQueries(opts: { inline?: boolean } = {}): TerminalQueries {
  const router = new InputRouter()
  return new TerminalQueries(router, {
    write: (seq) => {
      if (seq.includes("[>q")) {
        router.dispatch({
          kind: "dcs",
          payload: `>|${opts.inline === false ? "WezTerm" : "Ghostty"} 1.0`,
          sequence: `\x1bP>|${opts.inline === false ? "WezTerm" : "Ghostty"} 1.0\x1b\\`,
          type: "term-response",
        })
      } else if (seq.includes("\x1b_G")) {
        router.dispatch({
          kind: "apc",
          payload: "Gi=4294967290;EINVAL: expected",
          sequence: "\x1b_Gi=4294967290;EINVAL: expected\x1b\\",
          type: "term-response",
        })
      }
    },
  })
}

function mountMarkdown<T extends ReturnType<typeof markdown>>(
  node: T,
  opts: { inline?: boolean } = {}
): T {
  const mount = mockMountCtx()
  node.mount({ ...mount, input: { ...mount.input, queries: kgpQueries(opts) } })
  return node
}

function render(md: string, width = 80): string {
  return renderMarkdown(md, createCallbacks(ctx(width)))
}

function expectedOpen(slot: string): string {
  return openStyle(resolveStyle(slot, defaultTheme), defaultTheme)
}

// Strip all SGR escapes so plain-text regex assertions aren't tripped up by
// the `[reset]` that now sits between styled glyphs and following text.
const ESC = String.fromCharCode(27)
const ANSI_SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "g")
function stripAnsi(s: string): string {
  return s.replaceAll(ANSI_SGR, "")
}

// Sentinel-wrapping stand-in for shiki. The markdown code callback sees
// shiki's output fronted by `\x1b[33m...\x1b[0m`, so tests can check the
// highlight path fired without actually loading a shiki grammar.
const fakeHighlighter = (code: string) => `\x1b[33m${code}\x1b[0m`

// Shiki returns the input unchanged when a language isn't recognized;
// `tryHighlight` then falls through to plain styling.
const passthroughHighlighter = (code: string) => code

describe("markdown — inline callbacks", () => {
  test("strong wraps children in mdBold", async () => {
    const open = expectedOpen("mdBold")
    expect(render("**hi**")).toContain(`${open}hi${RESET}`)
  })

  test("emphasis wraps children in mdItalic", async () => {
    const open = expectedOpen("mdItalic")
    expect(render("*hi*")).toContain(`${open}hi${RESET}`)
  })

  test("strikethrough wraps children in mdStrikethrough", async () => {
    const open = expectedOpen("mdStrikethrough")
    expect(render("~~hi~~")).toContain(`${open}hi${RESET}`)
  })

  test("codespan wraps in mdCode", async () => {
    const open = expectedOpen("mdCode")
    expect(render("`foo`")).toContain(`${open}foo${RESET}`)
  })

  test("link wraps in mdLink + OSC 8 hyperlink", async () => {
    const open = expectedOpen("mdLink")
    const out = render("[click](https://example.com)")
    expect(out).toMatch(/\x1b\]8;id=[^;]+-1;https:\/\/example\.com\x1b\\/)
    expect(out).toContain(`${open}click${RESET}`)
    expect(out).toContain("\x1b]8;;\x1b\\")
  })

  test("long bare URL stays clickable across soft wraps", async () => {
    // Callbacks alone don't wrap; the markdown widget's layout does.
    const { createRender } = await import("../../src/core/render.ts")
    const url =
      "https://example.com/docs?first=abcdefghijklmnopqrstuvwxyz&second=0123456789abcdefghijklmnopqrstuvwxyz&third=abcdefghijklmnop"
    const rows = await createRender(() => markdown(`See ${url} for details.`), ctx(40))
    const linkRows = rows.filter((r) => r.includes("\x1b]8;"))
    expect(linkRows.length).toBeGreaterThan(1)
    const ids = linkRows.map(
      (row) => /\x1b\]8;id=([^;]+);/.exec(row)?.[1]
    )
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(1)
    expect(linkRows.every((r) => r.includes(`;${url}\x1b\\`))).toBe(true)
    expect(rows.map((r) => stripControl(r)).join("")).toBe(`See ${url} for details.`)
  })

  test("nested strong inside heading keeps heading style after inner reset", async () => {
    const headingOpen = expectedOpen("mdHeading1")
    const strongOpen = expectedOpen("mdBold")
    // Heading is "**hi** world" — the inner bold reset must re-apply the
    // heading style so " world" doesn't lose fg/underline. The heading is
    // padded to ctx.width so the bg extends past the text; assert on the
    // prefix up to where padding begins.
    const out = render("# **hi** world")
    expect(out).toContain(`${headingOpen}${strongOpen}hi${RESET}${headingOpen} world`)
  })
})

describe("markdown — block callbacks", () => {
  test("heading level dispatches to mdHeading{level}", async () => {
    // Heading rows are padded to ctx.width so the bg extends across; assert
    // the styled prefix without pinning the trailing whitespace length.
    for (let level = 1; level <= 6; level++) {
      const open = expectedOpen(`mdHeading${level}`)
      const out = render(`${"#".repeat(level)} hi`)
      expect(out).toContain(`${open}hi `)
    }
  })

  test("heading padded to ctx.width so bg extends edge-to-edge", async () => {
    const width = 20
    const out = render("# hi", width)
    // "# hi" → content "hi" padded to 20 cells → "hi" + 18 spaces.
    const open = expectedOpen("mdHeading1")
    expect(out).toContain(`${open}hi${" ".repeat(18)}${RESET}`)
  })

  test("paragraph separated by blank lines", async () => {
    expect(render("alpha\n\nbeta")).toContain("alpha\n\nbeta")
  })

  test("blockquote prefixes each line with styled ┃", async () => {
    const open = expectedOpen("mdQuote")
    const out = render("> quote")
    expect(out).toContain(`${open}┃${RESET} quote`)
  })

  test("hr fills width with ─", async () => {
    const open = expectedOpen("mdHr")
    const out = render("---", 10)
    expect(out).toContain(`${open}${"─".repeat(10)}${RESET}`)
  })

  test("code block: lines padded to widest-content with 2-cell horizontal band", async () => {
    // Block hugs its content rather than stretching to ctx.width; padding is
    // [1, 2, 1, 2] (top/bottom blank rows + 2-cell h-pad).
    const open = expectedOpen("mdCodeBlock")
    const out = render("```\nabc\n```", 80)
    expect(out).toContain(`${open}  abc  ${RESET}`)
  })

  test("code block: multi-line block pads every line to the widest", async () => {
    const open = expectedOpen("mdCodeBlock")
    // Widest line is "console" (7); total band width = widest + 4 = 11.
    // Lines are left-aligned with a fixed 2-cell leading pad and
    // right-padded to fill: "abc" → 2 + abc + 6; "console" → 2 + console + 2.
    const out = render("```\nabc\nconsole\n```", 80)
    expect(out).toContain(`${open}  abc      ${RESET}`)
    expect(out).toContain(`${open}  console  ${RESET}`)
  })

  test("code block: highlighter output replaces plain mdCodeBlock fg when supplied", async () => {
    // mdCodeBlock drops its own fg when a highlighter is active so per-token
    // colors win. The bg/attrs from the slot still show through.
    const bodyOpen = expectedOpen("mdCodeBlock")
    const out = renderMarkdown(
      "```ts\nconst x = 1\n```",
      createCallbacks({ ...ctx(40), highlight: fakeHighlighter })
    )
    expect(out).toContain("\x1b[33mconst x = 1\x1b[0m")
    expect(out).not.toContain(`${bodyOpen}const`)
  })

  test("code block: highlighter returning input unchanged falls back to plain styling", async () => {
    const bodyOpen = expectedOpen("mdCodeBlock")
    const out = renderMarkdown(
      "```mystery\nprint(1)\n```",
      createCallbacks({ ...ctx(40), highlight: passthroughHighlighter })
    )
    expect(out).toContain(`${bodyOpen}  print(1)  `)
  })

  test('code block: title="..." renders above block with mdCodeBlockTitle (marked)', () => {
    const titleOpen = expectedOpen("mdCodeBlockTitle")
    const bodyOpen = expectedOpen("mdCodeBlock")
    // Direct marked path: md.ts already parses title, no component wrapper.
    const out = renderMarkdown('```ts title="foo.ts"\nx\n```', createCallbacks(ctx(10)))
    expect(out).toContain(`${titleOpen}foo.ts${RESET}`)
    expect(out).toContain(`${bodyOpen}  x  `)
    const titleIdx = out.indexOf("foo.ts")
    const bodyIdx = out.lastIndexOf(`${bodyOpen}  x  `)
    expect(titleIdx).toBeLessThan(bodyIdx)
  })

  test("code block: no title attr → no title line emitted (marked)", async () => {
    const titleOpen = expectedOpen("mdCodeBlockTitle")
    const out = renderMarkdown("```ts\nx\n```", createCallbacks(ctx(10)))
    expect(out).not.toContain(titleOpen)
  })

  test("unordered list: bullet glyph styled via mdList", async () => {
    const open = expectedOpen("mdList")
    const out = render("- one\n- two")
    // Top-level bullet uses the first glyph in the depth-cycle: ●.
    expect(out).toContain(`${open}●${RESET}`)
    expect(stripAnsi(out)).toMatch(/● one/)
    expect(stripAnsi(out)).toMatch(/● two/)
  })

  test("ordered list: numeric marker styled via mdList", async () => {
    const open = expectedOpen("mdList")
    const out = render("1. one\n2. two")
    expect(out).toContain(`${open}1.${RESET}`)
    expect(out).toContain(`${open}2.${RESET}`)
  })

  test("task list: checkbox styled via mdListChecked / mdListUnchecked", async () => {
    const listOpen = expectedOpen("mdList")
    const checkedOpen = expectedOpen("mdListChecked")
    const uncheckedOpen = expectedOpen("mdListUnchecked")
    const out = render("- [x] done\n- [ ] todo")
    // Each task item renders as "<bullet> <checkbox> <text>" — bullet wears
    // mdList, checkbox wears its own checked/unchecked slot.
    expect(out).toContain(`${listOpen}●${RESET} ${checkedOpen}[x]${RESET}`)
    expect(out).toContain(`${listOpen}●${RESET} ${uncheckedOpen}[ ]${RESET}`)
  })

  test("nested list bullet glyph cycles with depth", async () => {
    // Bullet glyphs per depth: ● / ○ / ◆ / ◇
    const out = render("- outer\n  - inner")
    const plain = stripAnsi(out)
    expect(plain).toMatch(/● outer/)
    // Inner item prefixed by 2 spaces of indent + the depth-1 glyph.
    expect(plain).toMatch(/\n {2}○ inner/)
  })
})

// ─── RED: list-spacing semantics ────────────────────────────────────────
// GFM defines a list as "loose" when any item contains a blank line OR any
// two consecutive items are blank-line separated in source. Tight lists
// stack siblings with single newlines (no blank rows); loose lists keep
// blank rows between siblings. These tests pin the expected post-fix
// behaviour for the rendering pipeline.
describe("markdown — list spacing (loose vs tight)", () => {
  // Helper: compact view of the rendered output, minus trailing blank
  // lines that the document-level contract leaves for the next block.
  const view = (md: string, width = 80): string =>
    stripAnsi(render(md, width)).replace(/^\n+|\n+$/g, "")

  test("tight list: siblings stack with single newlines (no blank rows)", () => {
    expect(view("- one\n- two\n- three")).toBe("● one\n● two\n● three")
  })

  test("tight ordered list: numeric markers stack with single newlines", () => {
    expect(view("1. one\n2. two\n3. three")).toBe("1. one\n2. two\n3. three")
  })

  test("loose list (blank-line separated source): blank row between siblings", () => {
    expect(view("- one\n\n- two\n\n- three")).toBe("● one\n\n● two\n\n● three")
  })

  test("loose list (item carries block content): blank rows between siblings", () => {
    // The code block makes the parent list loose. The two prose siblings
    // around it should be separated by blank rows.
    const out = view("- before\n\n  ```\n  x\n  ```\n\n- after", 40)
    // Sanity: both sibling markers are present.
    expect(out).toMatch(/● before/)
    expect(out).toMatch(/● after/)
    // Loose: a blank row sits between the last line of `before`'s subtree
    // and the marker for `after`.
    expect(out).toMatch(/\n\n● after/)
  })

  test("nested tight list: 2-space indent, no blank rows between nested siblings", () => {
    // Outer + tight inner — inner siblings stack tightly under the outer.
    const out = view("- outer\n  - a\n  - b")
    expect(out).toBe("● outer\n  ○ a\n  ○ b")
  })

  test("nested loose list: blank rows between nested siblings", () => {
    const out = view("- outer\n  - a\n\n  - b")
    expect(out).toBe("● outer\n  ○ a\n\n  ○ b")
  })

  test("code block inside list item: indented and bracketed by blank rows", () => {
    // The fenced block sits under `before`, indented to the item's body
    // column (2 spaces) plus the code block's own 2-cell horizontal pad,
    // so the visible content sits at column 4. A blank row separates the
    // prose line from the code block.
    const out = view("- before\n\n  ```\n  x\n  ```", 20)
    const lines = out.split("\n")
    expect(lines[0]).toMatch(/^● before$/)
    // bodyIndent (2) + code-block lpad (2) before the `x` cell.
    expect(out).toMatch(/^ {4}x/m)
    expect(out).toMatch(/● before\n\n {2}/)
  })

  test("paragraph after a list separated by a blank row", () => {
    // The list ends, prose follows — the gap should be exactly one blank
    // row (i.e. \n\n), not zero and not more.
    expect(view("- one\n- two\n\nepilogue")).toBe("● one\n● two\n\nepilogue")
  })

  test("two top-level lists separated by paragraph keep their internal tightness", () => {
    // Each list is independently tight; the paragraph between them is the
    // only blank-row separator.
    expect(view("- a\n- b\n\nmid\n\n- c\n- d")).toBe("● a\n● b\n\nmid\n\n● c\n● d")
  })

  test("tight item with multiple block elements (no blank lines): list stays tight", () => {
    // CommonMark §5.4: a list is loose only if items have blank-line
    // separation OR a multi-block item has blank lines *between* its
    // blocks. Here item 1 mixes prose + code + prose with NO blank
    // lines, so the list is tight per spec — neither parser emits a
    // `<p>` wrap, and our renderer must agree.
    const out = view("- before:\n  ```\n  x\n  ```\n  after.\n- next item", 20)
    // No blank row between sibling items.
    expect(out).toMatch(/after\.\n● next item/)
    // Code block content is still indented under the marker column.
    expect(out).toMatch(/^ {4}x/m)
  })

  test("nested list inside loose outer stays independently tight", () => {
    // Per CommonMark §5.4: inner-list looseness must NOT propagate up,
    // and outer-list looseness must NOT cascade *into* the inner list's
    // own item separators. Here outer items are blank-line separated
    // (→ outer loose) but each inner list is tight (→ inner siblings
    // stack with single newlines).
    const md = `
- outer 1
  - inner a
  - inner b

- outer 2
  - inner c
  - inner d
      `.trim()
    const out = view(md)
    // Outer is loose: blank row between "outer 1"-subtree and "outer 2".
    expect(out).toMatch(/inner b\n\n● outer 2/)
    // Inner remains tight under each outer: siblings on consecutive
    // lines, no blank rows between them.
    expect(out).toMatch(/ {2}○ inner a\n {2}○ inner b/)
    expect(out).toMatch(/ {2}○ inner c\n {2}○ inner d/)
  })

  test("loose item separates parent prose from nested list with a blank row", () => {
    // CommonMark: paragraph in a loose list is `<p>`-wrapped, CSS gives
    // it margin → visual gap between the parent's prose and any nested
    // list it contains. Mirror that gap with a blank row.
    const md = "- outer 1\n  - inner a\n\n- outer 2\n  - inner b"
    const out = view(md)
    // Parent prose followed by blank row, then nested marker.
    expect(out).toMatch(/● outer 1\n\n {2}○ inner a/)
    expect(out).toMatch(/● outer 2\n\n {2}○ inner b/)
  })

  test("tight item keeps nested list snug under parent prose (no blank row)", () => {
    // Inverted: outer list is single-item, tight (no blank-line
    // separation, no multi-block-with-blank-line items). Parent prose
    // and nested list should be on consecutive lines with no gap.
    const out = view("- outer\n  - inner")
    expect(out).toBe("● outer\n  ○ inner")
  })

  test("code block following raw text in tight item is not glued to the text", () => {
    // When a list is tight, the parser doesn't wrap text in `<p>`, so
    // the text arrives in `listItem` children with no trailing `\n\n`.
    // The code callback must still emit on its own row(s) — the leading
    // `\n` in the code output guards this.
    const out = view("- is:\n  ```\n  x\n  ```\n  ok.", 20)
    // "is:" must end with a newline before the code block's first row.
    // (The code-block top-pad row is whitespace-only, so we just check
    // that "is:" doesn't continue into a non-newline char.)
    expect(out).toMatch(/is:\n/)
    // And the code "x" is a separate row.
    expect(out).toMatch(/^ {4}x/m)
  })
})

describe("markdown — table callbacks (styled borders, no alignment)", () => {
  test("table cells separated by styled │", async () => {
    const open = expectedOpen("mdTable")
    const out = render("| a | b |\n|---|---|\n| 1 | 2 |")
    // Expect multiple │ separators styled.
    expect(out).toContain(`${open}│${RESET}`)
    // Body values appear.
    expect(out).toContain("1")
    expect(out).toContain("2")
  })

  test("header cells wrapped in mdTableHeader", async () => {
    const open = expectedOpen("mdTableHeader")
    const out = render("| a | b |\n|---|---|\n| 1 | 2 |")
    expect(out).toContain(`${open}a${RESET}`)
    expect(out).toContain(`${open}b${RESET}`)
  })
})

describe("markdown() factory — rendered output preserves layout", () => {
  test("nested list: leading 2-space indent survives Text rendering", async () => {
    // Reproduce the demo regression: nested list items should retain their
    // indent after Text wraps + pads the rendered content. Depth-1 bullet
    // glyph is ○ (second entry in the depth-cycle).
    const out = await markdown("- outer\n  - inner").render(ctx(40))
    expect(stripAnsi(out.join("\n"))).toMatch(/^ {2}○ inner/m)
  })
})

describe("markdown() factory", () => {
  test("returns a Markdown node that renders via Text", async () => {
    const out = await markdown("**bold**").render(ctx(20))
    const joined = out.join("\n")
    // Text wrapping re-slices the SGR-styled content via sliceAnsi,
    // which normalises any merged SGR (`\x1b[1;38;...m`) into separate
    // attr + color runs (`\x1b[1m\x1b[38;...m`). Match just the styled
    // payload rather than pinning exact SGR order.
    expect(joined).toContain("bold")
    expect(joined).toMatch(/\x1b\[[0-9;]*1[;m]/)
  })

  test("accepts state-object form", async () => {
    const out = await markdown({ content: "hello" }).render(ctx(20))
    expect(out.join("\n")).toContain("hello")
  })

  test("options.render overrides the runtime renderer", async () => {
    const stub = vi.fn((_input: string, _cbs: object, _opts?: object) => "STUB-OUT")
    const out = await markdown({
      content: "# hi",
      options: { render: stub },
      syntax: false,
    }).render(ctx(20))
    expect(stub).toHaveBeenCalledTimes(1)
    expect(out.join("\n")).toContain("STUB-OUT")
  })

  test("changing state.content invalidates the node", async () => {
    const m = createNode(() => markdown("a"))
    let invalidated = 0
    m.on("invalidate", () => invalidated++)
    await m.render(ctx(20))
    m.state.content = "b"
    expect(invalidated).toBeGreaterThan(0)
  })
})

describe("markdown — images", () => {
  // These tests assume no terminal image protocol is available, so the
  // Image node's `_render` short-circuits to the alt-text fallback
  // without actually opening the (nonexistent) src file. `bun test`
  // inherits the caller's TTY/env, so we explicitly disable both; we
  // restore in afterAll.
  const IMG_ENV = [
    "GHOSTTY_RESOURCES_DIR",
    "ITERM_SESSION_ID",
    "KITTY_WINDOW_ID",
    "TERM",
    "TERM_PROGRAM",
  ] as const
  const savedImgEnv: Record<string, string | undefined> = {}
  let savedIsTTY: boolean | undefined
  const node = markdown("![alt](src.png)")
  beforeAll(() => {
    savedIsTTY = process.stdout.isTTY
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false })
    for (const k of IMG_ENV) {
      savedImgEnv[k] = process.env[k]
      delete process.env[k]
    }
    resetKittyGraphics()
  })
  afterAll(() => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: savedIsTTY })
    for (const k of IMG_ENV) {
      if (savedImgEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedImgEnv[k]
    }
    resetKittyGraphics()
  })

  test("image callback emits an `<img id=N>` marker per occurrence", () => {
    const { cb: image } = createImageCallback(node)
    expect(image?.("Logo", { src: "logo.png" })).toBe("<img id=0>")
    expect(image?.("Doc", { src: "doc.svg" })).toBe("<img id=1>")
    // Same src re-used gets its own marker id — dedup is by `src` in
    // the resolver, not in the marker stream.
    expect(image?.("Logo again", { src: "logo.png" })).toBe("<img id=2>")
  })

  test("resolve() replaces block markers with rendered rows", async () => {
    const image = createImageCallback(node)
    image.cb?.("pic", { src: "pic.png" })
    // Simulate the renderer's block-paragraph output: "<img id=0>" on
    // its own line. With no TTY (test env), the Image node falls back
    // to `[alt]` — so a single-row "block" substitution still works.
    const out = await image.resolve(ctx(40), "<img id=0>\n")
    // The marker is gone either way.
    expect(out).not.toContain("<img id=")
    // And the alt flows through.
    expect(out).toContain("pic")
  })

  test("resolve() falls back to alt text for inline markers", async () => {
    const image = createImageCallback(node)
    image.cb?.("icon", { src: "i.png" })
    const out = await image.resolve(ctx(40), "Click <img id=0> here.")
    expect(out).toBe("Click [icon] here.")
  })

  test("Markdown pre-renders image nodes and flows alt through to the fallback", async () => {
    const a = await markdown("![diagram](x.png)").render(ctx(40))
    expect(a.join("")).toContain("diagram")
  })
})

describe("markdown — Image instance cache", () => {
  // Mini PNG fixture built once, torn down at the end. Matches the
  // pattern in image.test.ts so we don't have to commit a binary.
  let tmpDir: string
  let pngPath: string

  const savedEnv: Record<string, string | undefined> = {}
  const ENV_KEYS = [
    "GHOSTTY_RESOURCES_DIR",
    "ITERM_SESSION_ID",
    "KITTY_WINDOW_ID",
    "TERM",
    "TERM_PROGRAM",
    "TMUX",
    "WEZTERM_PANE",
  ] as const

  beforeAll(async () => {
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const path = await import("node:path")
    // oxlint-disable-next-line unicorn/no-await-expression-member
    const sharp = (await import("sharp")).default
    tmpDir = mkdtempSync(path.join(tmpdir(), "zaly-md-image-"))
    pngPath = path.join(tmpDir, "t.png")
    const raw = Buffer.alloc(4 * 2 * 3, 0xff)
    await sharp(raw, { raw: { channels: 3, height: 2, width: 4 } })
      .png()
      .toFile(pngPath)

    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true })
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
    for (const k of ENV_KEYS) delete process.env[k]
    process.env.KITTY_WINDOW_ID = "1"
  })

  afterAll(async () => {
    const { rmSync } = await import("node:fs")
    rmSync(tmpDir, { force: true, recursive: true })
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  test("re-rendering the same markdown reuses the Image node (stable placement id)", async () => {
    resetKittyGraphics()

    // Force a fresh Markdown instance with the kitty env in place.
    const m = mountMarkdown(markdown(`![pic](${pngPath})`, { width: 40 }), { inline: false })
    const firstRows = await m.render(ctx(40))
    const firstP = extractPlacementId(firstRows.join("\n"))
    expect(firstP).toBeDefined()

    // Mutate content (add a trailing paragraph) to force a re-render.
    // The image stays on its own line — still a block — so the image
    // callback pathway fires again, and `#images` should hit the
    // cached Image → same placementId.
    m.state.content = `![pic](${pngPath})\n\nand then some text`
    const secondRows = await m.render(ctx(40))
    const secondP = extractPlacementId(secondRows.join("\n"))
    expect(secondP).toBe(firstP)
  })

  test("transmit is emitted at most once across re-renders of the same src", async () => {
    resetKittyGraphics()

    // Image transmit bytes flow through `ctx.transmit`, not the row
    // output. Capture them via a stub channel and assert dedupe across
    // re-renders. Bump `ctx.version` between paints — this mirrors the
    // Renderer, which increments version per frame so each Node's
    // per-version cache invalidates and `_render` runs again.
    const transmitted: string[] = []
    const transmit = (s: string): void => void transmitted.push(s)
    const base = { ...ctx(40), transmit }

    const m = mountMarkdown(markdown(`![pic](${pngPath})`, { width: 40 }))
    await m.render({ ...base, version: 1 })
    const aTransmits = transmitted.join("").match(/\x1b_Ga=t,/g)?.length ?? 0
    transmitted.length = 0

    m.state.content = `![pic](${pngPath}) more`
    await m.render({ ...base, version: 2 })
    const bTransmits = transmitted.join("").match(/\x1b_Ga=t,/g)?.length ?? 0

    expect(aTransmits).toBe(1)
    expect(bTransmits).toBe(0)
  })
})

function extractPlacementId(s: string): string | undefined {
  return s.match(/\x1b_Ga=p[^\x1b]*\bp=(\d+)/)?.[1]
}
