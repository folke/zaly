import { expect, test } from "vitest"
import { htmlToMarkdown } from "../src/utils/html.ts"

const url = "https://example.com/docs/page"

test("HTML conversion prefers main content, retaining headings, code, tables, and links", () => {
  const result = htmlToMarkdown(
    `<html><head><title>Documentation</title></head><body>
    <nav>Navigation clutter</nav><main><h1>API</h1><p>See <a href="../guide">the guide</a>.</p>
    <pre><code class="language-ts">const fence = "\`\`\`";</code></pre>
    <table><tr><th>Name</th><th>Value</th></tr><tr><td>a</td><td>b</td></tr></table></main>
    <footer>Footer clutter</footer></body></html>`,
    url
  )
  expect(result.title).toBe("Documentation")
  expect(result.markdown).toContain("# API")
  expect(result.markdown).toContain("[the guide](https://example.com/guide)")
  expect(result.markdown).toContain('````ts\nconst fence = "```";\n````')
  expect(result.markdown).toMatch(/\| Name\s*\| Value\s*\|/)
  expect(result.markdown).not.toContain("clutter")
})

test("an article inside main excludes surrounding UI without dropping its header", () => {
  const { markdown } = htmlToMarkdown(
    `<main><nav>Navigation</nav><aside>Sidebar</aside>
    <article><header><h1>Article title</h1></header><p>Article text</p></article></main>`,
    url
  )
  expect(markdown).toContain("# Article title")
  expect(markdown).toContain("Article text")
  expect(markdown).not.toMatch(/Navigation|Sidebar/)
})

test("base URLs, linked images, fragments, and accessible link labels survive conversion", () => {
  const { markdown } = htmlToMarkdown(
    `<html><head><base href="/assets/"></head><body><main>
    <a href="readme" aria-label="Read more"></a>
    <a href="full.png"><img src="thumb.png" alt="Diagram"></a>
    <a href="#example">Example</a>
    <a href="mailto:hi@example.com">Email</a>
  </main></body></html>`,
    url
  )
  expect(markdown).toContain("[Read more](https://example.com/assets/readme)")
  expect(markdown).toContain(
    "[![Diagram](https://example.com/assets/thumb.png)](https://example.com/assets/full.png)"
  )
  expect(markdown).toContain("[Example](https://example.com/assets/#example)")
  expect(markdown).toContain("mailto:hi@example.com")
})

test("fragments and short pages fall back to useful cleaned content", () => {
  expect(htmlToMarkdown("<h1>Short</h1><p>Useful text.</p>", url).markdown).toContain(
    "Useful text."
  )
  const { markdown } = htmlToMarkdown(
    "<html><body><nav>Nav</nav><div><p>Useful text.</p></div></body></html>",
    url
  )
  expect(markdown).toContain("Useful text.")
  expect(markdown).not.toContain("Nav")
})

test("conversion removes executable/hidden markup and unsafe links without running scripts", () => {
  const { markdown } = htmlToMarkdown(
    `<main><p>Visible</p>
    <script>throw new Error('Never execute me')</script><style>body { color: red }</style>
    <p hidden>Hidden</p><p aria-hidden="true">Secret</p>
    <a href="javascript:alert(1)">Unsafe</a><a href="data:text/html,evil">Data</a>
  </main>`,
    url
  )
  expect(markdown).toContain("Visible")
  expect(markdown).toContain("Unsafe")
  expect(markdown).not.toMatch(/Never execute|color: red|Hidden|Secret|javascript:|data:text/)
})

test("empty JavaScript shells and recognizable challenges return explicit warnings", () => {
  const shell = htmlToMarkdown(
    "<html><body><div id='root'></div><script src='/app.js'></script></body></html>",
    url
  )
  expect(shell.markdown).toBe("")
  expect(shell.warning).toContain("JavaScript")
  const challenge = htmlToMarkdown(
    "<main><form id='challenge-form'>Verify you are human</form></main>",
    url
  )
  expect(challenge.warning).toContain("bot challenge")
})
