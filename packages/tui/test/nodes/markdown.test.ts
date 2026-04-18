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

describe("markdown — inline callbacks", () => {
  test("strong wraps children in mdStrong", () => {
    const open = expectedOpen("mdStrong")
    expect(render("**hi**")).toContain(`${open}hi${RESET}`)
  })

  test("emphasis wraps children in mdEmphasis", () => {
    const open = expectedOpen("mdEmphasis")
    expect(render("*hi*")).toContain(`${open}hi${RESET}`)
  })

  test("strikethrough wraps children in mdStrikethrough", () => {
    const open = expectedOpen("mdStrikethrough")
    expect(render("~~hi~~")).toContain(`${open}hi${RESET}`)
  })

  test("codespan wraps in mdCode", () => {
    const open = expectedOpen("mdCode")
    expect(render("`foo`")).toContain(`${open}foo${RESET}`)
  })

  test("link wraps in mdLink + OSC 8 hyperlink", () => {
    const open = expectedOpen("mdLink")
    const out = render("[click](https://example.com)")
    expect(out).toContain("\x1b]8;;https://example.com\x1b\\")
    expect(out).toContain(`${open}click${RESET}`)
    expect(out).toContain("\x1b]8;;\x1b\\")
  })

  test("nested strong inside heading keeps heading style after inner reset", () => {
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
  test("heading level dispatches to mdHeading{level}", () => {
    // Heading rows are padded to ctx.width so the bg extends across; assert
    // the styled prefix without pinning the trailing whitespace length.
    for (let level = 1; level <= 6; level++) {
      const open = expectedOpen(`mdHeading${level}`)
      const out = render(`${"#".repeat(level)} hi`)
      expect(out).toContain(`${open}hi `)
    }
  })

  test("heading padded to ctx.width so bg extends edge-to-edge", () => {
    const width = 20
    const out = render("# hi", width)
    // "# hi" → content "hi" padded to 20 cells → "hi" + 18 spaces.
    const open = expectedOpen("mdHeading1")
    expect(out).toContain(`${open}hi${" ".repeat(18)}${RESET}`)
  })

  test("heading falls back to generic mdHeading when level-specific slot is unset", () => {
    // Drop mdHeading3 to simulate a theme that only defines the generic slot.
    const fallbackTheme = { ...moon, mdHeading3: undefined } as typeof moon
    const open = openStyle(resolveStyleSlot("mdHeading", fallbackTheme), fallbackTheme)
    const out = renderMarkdownMarked(
      "### h3",
      mdCallbacks(createCtx({ theme: fallbackTheme, width: 40 }))
    )
    expect(out).toContain(`${open}h3 `)
  })

  test("paragraph separated by blank lines", () => {
    expect(render("alpha\n\nbeta")).toContain("alpha\n\nbeta")
  })

  test("blockquote prefixes each line with styled │", () => {
    const open = expectedOpen("mdBlockquote")
    const out = render("> quote")
    expect(out).toContain(`${open}│ quote${RESET}`)
  })

  test("hr fills width with ─", () => {
    const open = expectedOpen("mdHr")
    const out = render("---", 10)
    expect(out).toContain(`${open}${"─".repeat(10)}${RESET}`)
  })

  test("code block: lines padded to widest-content + 1 trailing space", () => {
    // Block hugs its content rather than stretching to ctx.width; one cell
    // of trailing padding gives the background a visible tail.
    const open = expectedOpen("mdCodeBlock")
    const out = render("```\nabc\n```", 80)
    expect(out).toContain(`${open}abc ${RESET}`)
  })

  test("code block: multi-line block pads every line to the widest + 1", () => {
    const open = expectedOpen("mdCodeBlock")
    // Widest line is "console" (7) → padded to 8.
    const out = render("```\nabc\nconsole\n```", 80)
    expect(out).toContain(`${open}abc${" ".repeat(5)}${RESET}`)
    expect(out).toContain(`${open}console ${RESET}`)
  })

  test("code block: width is capped at ctx.width", () => {
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

  test("code block: no title attr → no title line emitted (marked)", () => {
    const titleOpen = expectedOpen("mdCodeBlockTitle")
    const out = renderMarkdownMarked("```ts\nx\n```", mdCallbacks(ctx(10)))
    expect(out).not.toContain(titleOpen)
  })

  test('code block: title="..." also works through a Bun-like renderer via the component', () => {
    const out = markdown({
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

  test("unordered list: bullet glyph styled via mdList", () => {
    const open = expectedOpen("mdList")
    const out = render("- one\n- two")
    // Top-level bullet uses the first glyph in the depth-cycle: ●.
    expect(out).toContain(`${open}●${RESET}`)
    expect(stripAnsi(out)).toMatch(/● one/)
    expect(stripAnsi(out)).toMatch(/● two/)
  })

  test("ordered list: numeric marker styled via mdList", () => {
    const open = expectedOpen("mdList")
    const out = render("1. one\n2. two")
    expect(out).toContain(`${open}1.${RESET}`)
    expect(out).toContain(`${open}2.${RESET}`)
  })

  test("task list: checkbox styled via mdListChecked / mdListUnchecked", () => {
    const listOpen = expectedOpen("mdList")
    const checkedOpen = expectedOpen("mdListChecked")
    const uncheckedOpen = expectedOpen("mdListUnchecked")
    const out = render("- [x] done\n- [ ] todo")
    // Each task item renders as "<bullet> <checkbox> <text>" — bullet wears
    // mdList, checkbox wears its own checked/unchecked slot.
    expect(out).toContain(`${listOpen}●${RESET} ${checkedOpen}[x]${RESET}`)
    expect(out).toContain(`${listOpen}●${RESET} ${uncheckedOpen}[ ]${RESET}`)
  })

  test("nested list bullet glyph cycles with depth", () => {
    // Bullet glyphs per depth: ● / ○ / ◆ / ◇
    const out = render("- outer\n  - inner")
    const plain = stripAnsi(out)
    expect(plain).toMatch(/● outer/)
    // Inner item prefixed by 2 spaces of indent + the depth-1 glyph.
    expect(plain).toMatch(/\n {2}○ inner/)
  })
})

describe("markdown — table callbacks (styled borders, no alignment)", () => {
  test("table cells separated by styled │", () => {
    const open = expectedOpen("mdTable")
    const out = render("| a | b |\n|---|---|\n| 1 | 2 |")
    // Expect multiple │ separators styled.
    expect(out).toContain(`${open}│${RESET}`)
    // Body values appear.
    expect(out).toContain("1")
    expect(out).toContain("2")
  })

  test("header cells wrapped in mdTableHeader", () => {
    const open = expectedOpen("mdTableHeader")
    const out = render("| a | b |\n|---|---|\n| 1 | 2 |")
    expect(out).toContain(`${open}a${RESET}`)
    expect(out).toContain(`${open}b${RESET}`)
  })
})

describe("markdown() factory — rendered output preserves layout", () => {
  test("nested list: leading 2-space indent survives Text rendering", () => {
    // Reproduce the demo regression: nested list items should retain their
    // indent after Text wraps + pads the rendered content. Depth-1 bullet
    // glyph is ○ (second entry in the depth-cycle).
    const out = markdown("- outer\n  - inner").render(ctx(40))
    expect(stripAnsi(out.join("\n"))).toMatch(/^ {2}○ inner/m)
  })
})

describe("markdown() factory", () => {
  test("returns a Markdown node that renders via Text", () => {
    const out = markdown("**bold**").render(ctx(20))
    const joined = out.join("\n")
    const open = expectedOpen("mdStrong")
    expect(joined).toContain(`${open}bold${RESET}`)
  })

  test("accepts state-object form", () => {
    const out = markdown({ content: "hello", fg: "primary" }).render(ctx(20))
    expect(out.join("\n")).toContain("hello")
  })

  test("options.render overrides the runtime renderer", () => {
    const stub = vi.fn((_input: string, _cbs: object, _opts?: object) => "STUB-OUT")
    const out = markdown({ content: "# hi", options: { render: stub } }).render(ctx(20))
    expect(stub).toHaveBeenCalledTimes(1)
    expect(out.join("\n")).toContain("STUB-OUT")
  })

  test("changing state.content invalidates the node", () => {
    const m = markdown("a")
    let invalidated = 0
    m.on("invalidate", () => invalidated++)
    m.render(ctx(10))
    m.state.content = "b"
    expect(invalidated).toBe(1)
  })
})
