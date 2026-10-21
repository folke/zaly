import { fileDetect } from "@zaly/shared/detect"
import { imageInfo } from "@zaly/shared/image"
import { readFileSync } from "node:fs"
import { basename } from "pathe"
import sharp from "sharp"
import { expect, test, vi } from "vitest"
import { mathImage, replaceMath } from "../../src/markdown/math.ts"

const marker = (source: string) =>
  replaceMath(source, (math) => `<math display=${math.display}>${math.tex}</math>`)

test.each([
  ["$x^2$", false],
  [String.raw`\(x^2\)`, false],
  ["$`x^2`$", false],
  ["$$x^2$$", true],
  ["$$\nx^2\n$$", true],
  [String.raw`\[x^2\]`, true],
  ["```math\nx^2\n```", true],
  ["~~~math\nx^2\n~~~", true],
] as const)("recognizes %s", (source, display) => {
  const out = replaceMath(source, (math) => {
    expect(math.tex.trim()).toBe("x^2")
    expect(math.display).toBe(display)
    expect(math.source).toBe(source)
    return "image"
  })
  expect(out).toBe("image")
})

test.each([
  "```latex\n$x$\n```",
  "  ````js\n$x$\n```\n$$y$$\n  ````",
  "~~~\n$x$\n~~~",
  "`$x$`",
  "`` `$x$` ``",
  "`multiline\n$x$\ncode`",
  "    $x$\n\t$$y$$",
  String.raw`\$x\$ and \\(x\\)`,
  "$x",
  "$$x",
  "$$\nx",
  String.raw`\[x`,
  "```math\nx^2",
  "$5 and $10",
  "$ x $",
  "[link](https://example.com/$x$)",
  "![image](https://example.com/$x$.png)",
  "![formula $x$](image.png)",
  "[ref]: https://example.com/$x$",
  '<img src="$x$.png">',
  "<code>$x$</code>",
])("does not replace code, escapes, destinations, prices, or incomplete math: %s", (source) => {
  expect(marker(source)).toBe(source)
})

test("preserves raw LaTeX and replaces multiple expressions in document order", () => {
  const expressions: string[] = []
  const source = String.raw`First \(\frac{a}{b}\), then $x_1$, finally \[\alpha + \beta\].`
  const out = replaceMath(source, (math) => {
    expressions.push(math.tex)
    return `<img id=${expressions.length - 1}>`
  })
  expect(expressions).toEqual([String.raw`\frac{a}{b}`, "x_1", String.raw`\alpha + \beta`])
  expect(out).toBe("First <img id=0>, then <img id=1>, finally <img id=2>.")
})

test("does not mistake an escaped dollar for the closing delimiter", () => {
  expect(marker(String.raw`$x + \$y$`)).toBe(String.raw`<math display=false>x + \$y</math>`)
})

test("generates a reusable, self-contained SVG temp file that images can decode", async () => {
  const math = { display: true, source: "", tex: String.raw`\frac{a}{b} + \alpha^2` }
  const [first, second] = await Promise.all([
    mathImage(math, "#abcdef"),
    mathImage(math, "#abcdef"),
  ])
  expect(first).toBe(second)
  expect(basename(first)).toMatch(/^[\da-f]+\.svg$/)
  const svg = readFileSync(first, "utf8")
  expect(svg).toContain("<svg")
  expect(svg).toContain("<path")
  expect(svg).toContain("#abcdef")
  expect(svg).not.toContain("currentColor")
  const file = await fileDetect(first)
  expect(file?.type).toBe("image")
  if (file?.type !== "image") throw new Error("Expected SVG image")
  const info = await imageInfo(file)
  expect(info.width).toBeGreaterThan(0)
  expect(info.height).toBeGreaterThan(0)
  const png = await sharp(first).png().toBuffer()
  expect(png.length).toBeGreaterThan(0)
  expect(await mathImage(math, "#123456")).not.toBe(first)
  expect(await mathImage({ ...math, display: false }, "#abcdef")).not.toBe(first)
})

test("inline expressions contain every term rather than only the first wrapping fragment", async () => {
  const path = await mathImage(
    { display: false, source: "", tex: `E=mc^2+${process.pid}` },
    "#abcdef"
  )
  const svg = readFileSync(path, "utf8")
  expect(svg).toContain('data-latex="E"')
  expect(svg).toContain('data-latex="c"')
  expect(svg).toContain('data-latex="="')
})

test("piecewise expressions serialize comparison operators as valid XML", async () => {
  const tex = String.raw`f(x)=\begin{cases}x^2 & x \ge 0 \\ -x & x < 0\end{cases}` + process.pid
  const path = await mathImage({ display: true, source: "", tex }, "#abcdef")
  const svg = readFileSync(path, "utf8")
  expect(svg).toContain("&lt;")
  const png = await sharp(path).png().toBuffer()
  expect(png.length).toBeGreaterThan(0)
})

test("dynamic double-struck fonts load locally without warnings", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    const tex =
      String.raw`\forall x \in \mathbb{R},\quad x^2 \geq 0\qquad A \subseteq B \iff A \cap B = A` +
      process.pid
    const path = await mathImage({ display: true, source: "", tex }, "#abcdef")
    const png = await sharp(path).png().toBuffer()
    expect(png.length).toBeGreaterThan(0)
    expect(warning).not.toHaveBeenCalled()
  } finally {
    warning.mockRestore()
  }
})

test("malformed and unsupported TeX rejects for the caller's source fallback", async () => {
  await expect(
    mathImage({ display: true, source: "", tex: String.raw`\frac{` }, "#abcdef")
  ).rejects.toBeDefined()
  await expect(
    mathImage({ display: true, source: "", tex: String.raw`\require{html}` }, "#abcdef")
  ).rejects.toBeDefined()
})
