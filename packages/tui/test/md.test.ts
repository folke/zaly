import { renderMarkdown } from "#runtime"
import { describe, expect, test } from "vitest"
import { renderMarkdown as renderMarkdownMarked } from "../src/style/md/marked.ts"
import { encodeFenceInfoStrings, FENCE_MARKER } from "../src/style/md/utils.ts"

// ── callback-ordering / structural fixtures ──────────────────────────────
//
// These assertions intentionally avoid asserting exact byte output; Bun's
// native renderer and the marked-based Node impl differ in cosmetic details
// (trailing whitespace, empty-string separators). Instead we assert the
// essential contract: the right callbacks fire for the right nodes with the
// right metadata, and children pass through unchanged when callbacks are
// omitted.

describe("renderMarkdown — callback dispatch", () => {
  test("heading callback fires with level meta", () => {
    const seen: { level: number; children: string }[] = []
    renderMarkdown("# One\n\n## Two", {
      heading: (children, { level }) => {
        seen.push({ children, level })
        return children
      },
    })
    expect(seen).toHaveLength(2)
    expect(seen[0].level).toBe(1)
    expect(seen[0].children).toBe("One")
    expect(seen[1].level).toBe(2)
    expect(seen[1].children).toBe("Two")
  })

  test("strong / emphasis / strikethrough / codespan", () => {
    const out = renderMarkdown("**b** *i* ~~s~~ `c`", {
      codespan: (c) => `<code>${c}</code>`,
      emphasis: (c) => `<i>${c}</i>`,
      paragraph: (c) => c,
      strikethrough: (c) => `<s>${c}</s>`,
      strong: (c) => `<b>${c}</b>`,
    })
    expect(out).toContain("<b>b</b>")
    expect(out).toContain("<i>i</i>")
    expect(out).toContain("<s>s</s>")
    expect(out).toContain("<code>c</code>")
  })

  test("code block callback receives language meta", () => {
    let meta: { language?: string } | undefined
    let children = ""
    renderMarkdown("```js\nconst x = 1\n```", {
      code: (c, m) => {
        children = c
        meta = m
        return c
      },
    })
    expect(meta?.language).toBe("js")
    expect(children.trim()).toBe("const x = 1")
  })

  // Title-attribute parsing is marked-side only — Bun.markdown.render strips
  // the info-string after the first token, so the title is unrecoverable for
  // the Bun runtime. Users who need titles on Bun can plug the marked renderer
  // via `options.render`.
  describe("code block info-string (marked renderer)", () => {
    test('title="..." is parsed out of the info string', () => {
      let meta: { language?: string; title?: string } | undefined
      renderMarkdownMarked('```jsx title="/src/Hello.js"\nconst x = 1\n```', {
        code: (_c, m) => {
          meta = m
          return ""
        },
      })
      expect(meta?.language).toBe("jsx")
      expect(meta?.title).toBe("/src/Hello.js")
    })

    test("title='...' (single-quoted) is also parsed", () => {
      let meta: { language?: string; title?: string } | undefined
      renderMarkdownMarked("```ts title='foo bar.ts'\nx\n```", {
        code: (_c, m) => {
          meta = m
          return ""
        },
      })
      expect(meta?.language).toBe("ts")
      expect(meta?.title).toBe("foo bar.ts")
    })

    test("no title: language only", () => {
      let meta: { language?: string; title?: string } | undefined
      renderMarkdownMarked("```ts\nx\n```", {
        code: (_c, m) => {
          meta = m
          return ""
        },
      })
      expect(meta?.language).toBe("ts")
      expect(meta?.title).toBeUndefined()
    })

    test("bare fenced block (no lang): no language, no title", () => {
      let meta: { language?: string; title?: string } | undefined
      renderMarkdownMarked("```\nx\n```", {
        code: (_c, m) => {
          meta = m
          return ""
        },
      })
      expect(meta?.language).toBeUndefined()
      expect(meta?.title).toBeUndefined()
    })

    test("language with other attrs besides title: title still parsed", () => {
      let meta: { language?: string; title?: string } | undefined
      renderMarkdownMarked('```ts showLineNumbers title="x.ts" foo=bar\n1\n```', {
        code: (_c, m) => {
          meta = m
          return ""
        },
      })
      expect(meta?.language).toBe("ts")
      expect(meta?.title).toBe("x.ts")
    })
  })

  describe("encodeFenceInfoStrings", () => {
    test("closing fences with trailing whitespace are left untouched", () => {
      // Regression: encoding the closing fence's trailing whitespace into
      // markers breaks fence recognition and swallows the rest of the doc.
      const input = "```ts\ncode\n```   \nparagraph\n"
      const out = encodeFenceInfoStrings(input)
      expect(out).not.toContain(FENCE_MARKER)
      expect(out).toBe(input)
    })

    test("opening fence with language+attrs gets spaces encoded", () => {
      const input = '```ts title="x.ts"\ncode\n```\n'
      const out = encodeFenceInfoStrings(input)
      expect(out).toContain(`ts${FENCE_MARKER}title="x.ts"`)
      expect(out).toContain("\n```\n")
    })

    test("encoded input: closing fence with trailing space still closes the block", () => {
      // End-to-end: marked must still see a balanced block after encoding.
      const input = '```ts title="x.ts"\ncode\n```   \npara\n'
      const encoded = encodeFenceInfoStrings(input)
      let sawCode = false
      let sawPara = false
      renderMarkdownMarked(encoded, {
        code: () => {
          sawCode = true
          return ""
        },
        paragraph: (c) => {
          if (c === "para") sawPara = true
          return c
        },
      })
      expect(sawCode).toBe(true)
      expect(sawPara).toBe(true)
    })
  })

  test("link callback receives href + title", () => {
    let meta: { href: string; title?: string } | undefined
    renderMarkdown('[label](https://example.com "t")', {
      link: (c, m) => {
        meta = m
        return c
      },
      paragraph: (c) => c,
    })
    expect(meta?.href).toBe("https://example.com")
    expect(meta?.title).toBe("t")
  })

  test("list + listItem meta shapes", () => {
    const items: {
      depth: number
      index: number
      ordered: boolean
      start?: number
      checked?: boolean
    }[] = []
    renderMarkdown("- a\n- b\n- c", {
      list: (c) => c,
      listItem: (c, m) => {
        items.push({
          checked: m.checked,
          depth: m.depth,
          index: m.index,
          ordered: m.ordered,
          start: m.start,
        })
        return c
      },
    })
    expect(items).toEqual([
      { checked: undefined, depth: 0, index: 0, ordered: false, start: undefined },
      { checked: undefined, depth: 0, index: 1, ordered: false, start: undefined },
      { checked: undefined, depth: 0, index: 2, ordered: false, start: undefined },
    ])
  })

  test("ordered list carries start + ordered=true", () => {
    const items: { index: number; ordered: boolean; start?: number }[] = []
    renderMarkdown("3. a\n4. b", {
      list: (c) => c,
      listItem: (c, m) => {
        items.push({ index: m.index, ordered: m.ordered, start: m.start })
        return c
      },
    })
    expect(items[0]).toEqual({ index: 0, ordered: true, start: 3 })
    expect(items[1]).toEqual({ index: 1, ordered: true, start: 3 })
  })

  test("nested lists report increasing depth", () => {
    const items: { depth: number; index: number }[] = []
    renderMarkdown("- outer\n  - inner-a\n  - inner-b", {
      list: (c) => c,
      listItem: (c, m) => {
        items.push({ depth: m.depth, index: m.index })
        return c
      },
    })
    // Outer item at depth 0; inner items at depth 1.
    expect(items.some((x) => x.depth === 0)).toBe(true)
    expect(items.some((x) => x.depth === 1)).toBe(true)
  })

  test("blockquote + hr callbacks fire", () => {
    let bq = ""
    let hr = 0
    renderMarkdown("> quote\n\n---", {
      blockquote: (c) => {
        bq = c
        return c
      },
      hr: () => {
        hr++
        return ""
      },
      paragraph: (c) => c,
    })
    expect(bq).toContain("quote")
    expect(hr).toBe(1)
  })

  test("omitted callback: children pass through unchanged", () => {
    // No callbacks at all → output contains the raw text (children).
    const out = renderMarkdown("**hello** world", {})
    expect(out).toContain("hello")
    expect(out).toContain("world")
  })

  test("callback returning undefined omits the element", () => {
    const out = renderMarkdown("keep ~~drop~~ keep", {
      paragraph: (c) => c,
      strikethrough: () => undefined,
    })
    expect(out).not.toContain("drop")
    expect(out).toContain("keep")
  })
})
