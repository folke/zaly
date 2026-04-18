import type { MdCallbacks } from "../../src/md.ts"

import { renderMarkdown } from "#runtime"
import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { renderMarkdown as renderMarkdownMarked } from "../../src/md.ts"
import { markdown, mdCallbacks } from "../../src/nodes/markdown.ts"
import { openStyle, RESET } from "../../src/style/ansi.ts"
import { resolveStyleSlot } from "../../src/style/compose.ts"
import { moon } from "../../src/style/theme.ts"

const ctx = (width = 80) => createCtx({ theme: moon, width })

function render(md: string, width = 80): string {
  return renderMarkdown(md, mdCallbacks(ctx(width)))
}

function expectedOpen(slot: string): string {
  return openStyle(resolveStyleSlot(slot, moon), moon)
}

// Strip all SGR escapes so plain-text regex assertions aren't tripped up by
// the `[reset]` that now sits between styled glyphs and following text.
const ESC = String.fromCharCode(27)
const ANSI_SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "g")
function stripAnsi(s: string): string {
  return s.replaceAll(ANSI_SGR, "")
}

// Minimal stand-in for Bun.markdown.render: finds the first fenced block and
// reports the first whitespace-delimited token as `language` — the exact
// truncation behavior we saw live. With `Markdown._render` encoding spaces
// in the info-string beforehand, Bun's tokenization now hands back the
// whole info-string as `language` and the component's wrapper re-parses
// `title` out of it.
const bunLike = (input: string, cbs: MdCallbacks): string => {
  const m = /^ {0,3}`{3,}([^\n]*)\n([\s\S]*?)\n`{3,}/m.exec(input)
  if (m === null) return ""
  const info = m[1]
  const body = m[2]
  const lang = info.split(/\s/)[0]
  return cbs.code?.(`${body}\n`, lang === "" ? undefined : { language: lang }) ?? `${body}\n`
}

// Sentinel-wrapping stand-in for shiki. The markdown code callback sees
// shiki's output fronted by `\x1b[33m...\x1b[0m`, so tests can check the
// highlight path fired without actually loading a shiki grammar.
const fakeHighlighter = (code: string) => `\x1b[33m${code}\x1b[0m`

// Shiki returns the input unchanged when a language isn't recognized;
// `tryHighlight` then falls through to plain styling.
const passthroughHighlighter = (code: string) => code

describe("markdown — inline callbacks", () => {
  test("strong wraps children in mdStrong", async () => {
    const open = expectedOpen("mdStrong")
    expect(render("**hi**")).toContain(`${open}hi${RESET}`)
  })

  test("emphasis wraps children in mdEmphasis", async () => {
    const open = expectedOpen("mdEmphasis")
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
    expect(out).toContain("\x1b]8;;https://example.com\x1b\\")
    expect(out).toContain(`${open}click${RESET}`)
    expect(out).toContain("\x1b]8;;\x1b\\")
  })

  test("nested strong inside heading keeps heading style after inner reset", async () => {
    const headingOpen = expectedOpen("mdHeading1")
    const strongOpen = expectedOpen("mdStrong")
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

  test("heading falls back to generic mdHeading when level-specific slot is unset", async () => {
    // Drop mdHeading3 to simulate a theme that only defines the generic slot.
    const fallbackTheme = { ...moon, mdHeading3: undefined } as typeof moon
    const open = openStyle(resolveStyleSlot("mdHeading", fallbackTheme), fallbackTheme)
    const out = renderMarkdownMarked(
      "### h3",
      mdCallbacks(createCtx({ theme: fallbackTheme, width: 40 }))
    )
    expect(out).toContain(`${open}h3 `)
  })

  test("paragraph separated by blank lines", async () => {
    expect(render("alpha\n\nbeta")).toContain("alpha\n\nbeta")
  })

  test("blockquote prefixes each line with styled │", async () => {
    const open = expectedOpen("mdBlockquote")
    const out = render("> quote")
    expect(out).toContain(`${open}│ quote${RESET}`)
  })

  test("hr fills width with ─", async () => {
    const open = expectedOpen("mdHr")
    const out = render("---", 10)
    expect(out).toContain(`${open}${"─".repeat(10)}${RESET}`)
  })

  test("code block: lines padded to widest-content + 1 trailing space", async () => {
    // Block hugs its content rather than stretching to ctx.width; one cell
    // of trailing padding gives the background a visible tail.
    const open = expectedOpen("mdCodeBlock")
    const out = render("```\nabc\n```", 80)
    expect(out).toContain(`${open}abc ${RESET}`)
  })

  test("code block: multi-line block pads every line to the widest + 1", async () => {
    const open = expectedOpen("mdCodeBlock")
    // Widest line is "console" (7) → padded to 8.
    const out = render("```\nabc\nconsole\n```", 80)
    expect(out).toContain(`${open}abc${" ".repeat(5)}${RESET}`)
    expect(out).toContain(`${open}console ${RESET}`)
  })

  test("code block: highlighter output replaces plain mdCodeBlock fg when supplied", async () => {
    // mdCodeBlock drops its own fg when a highlighter is active so per-token
    // colors win. The bg/attrs from the slot still show through.
    const bodyOpen = expectedOpen("mdCodeBlock")
    const out = renderMarkdownMarked(
      "```ts\nconst x = 1\n```",
      mdCallbacks(ctx(40), { highlighter: fakeHighlighter })
    )
    expect(out).toContain("\x1b[33mconst x = 1\x1b[0m")
    expect(out).not.toContain(`${bodyOpen}const`)
  })

  test("code block: highlighter returning input unchanged falls back to plain styling", async () => {
    const bodyOpen = expectedOpen("mdCodeBlock")
    const out = renderMarkdownMarked(
      "```mystery\nprint(1)\n```",
      mdCallbacks(ctx(40), { highlighter: passthroughHighlighter })
    )
    expect(out).toContain(`${bodyOpen}print(1)`)
  })

  test("code block: width is capped at ctx.width", async () => {
    const open = expectedOpen("mdCodeBlock")
    // Line is 12 cells; block is capped at ctx.width = 8 (no room for +1).
    const out = render("```\nabcdefghijkl\n```", 8)
    expect(out).toContain(`${open}abcdefghijkl${RESET}`)
  })

  test('code block: title="..." renders above block with mdCodeBlockTitle (marked)', () => {
    const titleOpen = expectedOpen("mdCodeBlockTitle")
    const bodyOpen = expectedOpen("mdCodeBlock")
    // Direct marked path: md.ts already parses title, no component wrapper.
    const out = renderMarkdownMarked(
      '```ts title="foo.ts"\nx\n```',
      mdCallbacks(ctx(10))
    )
    expect(out).toContain(`${titleOpen}foo.ts${RESET}`)
    expect(out).toContain(`${bodyOpen}x`)
    const titleIdx = out.indexOf("foo.ts")
    const bodyIdx = out.lastIndexOf(`${bodyOpen}x`)
    expect(titleIdx).toBeLessThan(bodyIdx)
  })

  test("code block: no title attr → no title line emitted (marked)", async () => {
    const titleOpen = expectedOpen("mdCodeBlockTitle")
    const out = renderMarkdownMarked("```ts\nx\n```", mdCallbacks(ctx(10)))
    expect(out).not.toContain(titleOpen)
  })

  test('code block: title="..." also works through a Bun-like renderer via the component', async () => {
    const out = await markdown({
      content: '```ts title="foo.ts"\nx\n```',
      options: { render: bunLike },
    }).render(ctx(30))
    const joined = out.join("\n")
    // slice-ansi may split compound SGRs when our Text re-slices lines, so
    // don't assert on exact escape bytes. Instead strip escapes and check
    // that the title text appears as its own row ahead of the body.
    const esc = String.fromCharCode(27)
    const plain = joined.replaceAll(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "")
    expect(plain).toMatch(/^foo\.ts/m)
    expect(plain.indexOf("foo.ts")).toBeLessThan(plain.indexOf("x"))
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
    const open = expectedOpen("mdStrong")
    expect(joined).toContain(`${open}bold${RESET}`)
  })

  test("accepts state-object form", async () => {
    const out = await markdown({ content: "hello", fg: "primary" }).render(ctx(20))
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
    const m = markdown("a")
    let invalidated = 0
    m.on("invalidate", () => invalidated++)
    await m.render(ctx(10))
    m.state.content = "b"
    expect(invalidated).toBe(1)
  })
})
