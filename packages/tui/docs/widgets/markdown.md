# markdown

Render a markdown string as a themed, syntax-highlighted, terminal-native node.

## Example

```ts
import { markdown } from "@zaly/tui"

markdown(`
# Heading

This is **bold**, *italic*, and \`inline code\`.

\`\`\`ts
const ok = true
\`\`\`

- lists with a [link](https://zaly.dev)
- and ![images](./logo.png) inline

| col A | col B |
|-------|-------|
| one   | two   |
`)
```

## State

| field                    | type        | default | description                                                                      |
| ------------------------ | ----------- | ------- | -------------------------------------------------------------------------------- |
| `content`                | `string`    | —       | Markdown source. Mutating this field re-renders (useful for streamed tokens).    |
| `options`                | `MdOptions` | —       | Parser flags passed through to `renderMarkdown`. Mirrors `Bun.markdown.Options`. |
| `syntax`                 | `boolean`   | `true`  | Enable shiki-backed syntax highlighting for fenced code blocks.                  |
| `wrap`, `width`, `fg`, … | —           | —       | [`text`](./text) style fields flow through.                                      |

## Themed elements

Every element maps to a theme slot — override these to restyle the rendered look without touching the callbacks.

- `mdHeading`, `mdHeading1`..`mdHeading6`
- `mdBold`, `mdItalic`, `mdStrikethrough`
- `mdCode` (inline), `mdCodeBlock`, `mdCodeBlockTitle`
- `mdLink`, `mdHr`, `mdQuote`
- `mdListBullet`, `mdListChecked`, `mdListUnchecked`
- `mdTable`, `mdTableHeader`

See [Theming](../guide/theming) for the slot values.

## Streaming

Because `content` is reactive, you can append tokens as they arrive — the node re-renders on each write, fenced blocks become syntax-highlighted in place, lists reformat. See [Agent stream](../demos/stream) for a full streaming demo.

```ts
const md = markdown("")
renderer.stream.append(md)
for await (const chunk of llm.stream()) md.state.content += chunk
```

## Math

Math is recognized before Markdown parsing on both Bun and Node:

- Inline: `$…$`, `\(…\)`, and GitHub's dollar-backtick form.
- Display: `$$…$$`, `\[…\]`, and fenced `math` blocks.

Complete expressions are typeset locally with a lazy-loaded MathJax TeX/AMS renderer. Self-contained SVGs are cached under the system temporary directory in `zaly-math-<uid>/<hash>.svg`; the hash includes the expression, display mode, and resolved `mdMath` foreground. The existing [`image`](./image) widget handles SVG conversion and terminal placement. Formula widths use a consistent text-relative scale rather than filling the available width, and shrink to fit narrower terminals.

Inline formulas share a top-aligned row band with the surrounding text. The tallest formula determines the band's height; continuation rows are aligned to each formula's terminal column. This layout targets the render width; downstream wrapping to a narrower width can break the alignment. The `mdMath` theme slot controls formula color. Unsupported terminals, disabled images, unresolved terminal-native foreground colors, invalid expressions, or unavailable image conversion fall back to the original source. Code spans, ordinary code fences, and indented code are not interpreted as math. Incomplete expressions are left for later streaming updates. `latex` and `tex` fences remain source code; bare LaTeX environments and MathML markup are not recognized as math.

## Notes

- Image refs (`![alt](src)`) are rendered via the [`image`](./image) widget when on their own line; inline images share top-aligned row bands, including multi-row images.
- The Bun runtime uses `Bun.markdown.render`; Node uses `marked`. Both accept the same callbacks, and a code-fence info-string shim normalizes quoted titles (e.g. `\`\`\`ts title="foo.ts"`) across runtimes.

> [!TIP]
> For one-off markdown-to-ANSI conversion without a widget (e.g. inside a `text()` content function), call `renderMarkdown(str, createCallbacks(ctx))` directly — see `src/markdown/callbacks.ts`.
