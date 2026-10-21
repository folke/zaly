import { hash } from "@zaly/shared"
import { existsSync } from "node:fs"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { tmpdir, userInfo } from "node:os"
import { join } from "pathe"

// Rasterize at three times an 8px cell width, independently of terminal placement size.
export const MATH_PIXELS_PER_CELL = 24

export interface MathExpression {
  tex: string
  display: boolean
  source: string
}

/** Protect math before Markdown consumes its escapes. Code and incomplete spans stay intact. */
export function replaceMath(source: string, replace: (math: MathExpression) => string): string {
  if (!/[$\\]|^ {0,3}(?:`{3,}|~{3,})\s*math\s*$/m.test(source)) return source
  let out = ""
  let i = 0
  const escaped = (pos: number) => {
    let count = 0
    while (pos > 0 && source[--pos] === "\\") count++
    return count % 2 === 1
  }
  while (i < source.length) {
    if (i === 0 || source[i - 1] === "\n") {
      const lineEnd = source.indexOf("\n", i)
      const line = source.slice(i, lineEnd === -1 ? source.length : lineEnd)
      const fence = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line)
      if (fence) {
        const close = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`, "gm")
        close.lastIndex = lineEnd === -1 ? source.length : lineEnd + 1
        const end = close.exec(source)
        const stop = end ? end.index + end[0].length : source.length
        const raw = source.slice(i, stop)
        out +=
          end && fence[2].trim() === "math"
            ? replace({
                display: true,
                source: raw,
                tex: source.slice(lineEnd + 1, end.index).trim(),
              })
            : raw
        i = stop
        continue
      }
      if (/^(?: {4}|\t)|^ {0,3}\[[^\]]+\]:/.test(line)) {
        out += line
        i += line.length
        continue
      }
    }
    // Existing destinations and raw HTML must not become math or acquire image markers.
    if (source[i] === "<") {
      const html = /^(?:<(pre|code|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>\n]*>)/i.exec(
        source.slice(i)
      )
      if (html) {
        out += html[0]
        i += html[0].length
        continue
      }
    }
    if (source.startsWith("![", i)) {
      let end = i + 2
      let depth = 1
      for (; end < source.length && depth > 0; end++) {
        if (escaped(end)) continue
        if (source[end] === "[") depth++
        else if (source[end] === "]") depth--
      }
      out += source.slice(i, end)
      i = end
      continue
    }
    if (source[i] === "(" && source[i - 1] === "]") {
      let end = i + 1
      let depth = 1
      for (; end < source.length && depth > 0; end++) {
        if (escaped(end)) continue
        if (source[end] === "(") depth++
        else if (source[end] === ")") depth--
      }
      out += source.slice(i, end)
      i = end
      continue
    }
    let open: string | undefined
    let close = ""
    let display = false
    if (source.startsWith(String.raw`\[`, i)) {
      open = String.raw`\[`
      close = String.raw`\]`
      display = true
    } else if (source.startsWith(String.raw`\(`, i)) {
      open = String.raw`\(`
      close = String.raw`\)`
    } else if (source.startsWith("$$", i)) {
      open = "$$"
      close = "$$"
      display = true
    } else if (source.startsWith("$`", i)) {
      open = "$`"
      close = "`$"
    } else if (source[i] === "$" && /\S/.test(source[i + 1] ?? "")) {
      open = "$"
      close = "$"
    }
    if (open) {
      let end = i + open.length
      for (; end < source.length; end++) {
        if (!display && source[end] === "\n") break
        if (!source.startsWith(close, end) || escaped(end)) continue
        if (close === "$" && (/\s/.test(source[end - 1]) || /[\d$]/.test(source[end + 1] ?? "")))
          continue
        const stop = end + close.length
        const tex = source.slice(i + open.length, end)
        if (!tex.trim()) break
        out += replace({ display, source: source.slice(i, stop), tex })
        i = stop
        break
      }
      if (i === end + close.length) continue
      // Keep incomplete spans intact, without rescanning every nested opener while streaming.
      out += source.slice(i, end)
      i = end
      continue
    }
    if (source[i] === "`") {
      const ticks = /^`+/.exec(source.slice(i))![0]
      let end = source.indexOf(ticks, i + ticks.length)
      while (end >= 0 && (source[end - 1] === "`" || source[end + ticks.length] === "`"))
        end = source.indexOf(ticks, end + ticks.length)
      const stop = end < 0 ? source.length : end + ticks.length
      out += source.slice(i, stop)
      i = stop
      continue
    }
    if (source[i] === "\\" && i + 1 < source.length) {
      out += source.slice(i, i + 2)
      i += 2
      continue
    }
    out += source[i++]
  }
  return out
}

async function createTypesetter() {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] =
    await Promise.all([
      import("@mathjax/src/js/mathjax.js"),
      import("@mathjax/src/js/input/tex.js"),
      import("@mathjax/src/js/output/svg.js"),
      import("@mathjax/src/js/adaptors/liteAdaptor.js"),
      import("@mathjax/src/js/handlers/html.js"),
      import("@mathjax/src/js/input/tex/ams/AmsConfiguration.js"),
      import("@mathjax/src/js/util/asyncLoad/esm.js"),
    ])
  const adaptor = liteAdaptor()
  // oxlint-disable-next-line new-cap -- MathJax registration API.
  RegisterHTMLHandler(adaptor)
  const doc = mathjax.document("", {
    InputJax: new TeX({
      formatError: (_jax: unknown, error: Error) => {
        throw error
      },
      maxBuffer: 20_000,
      packages: ["base", "ams"],
    }),
    OutputJax: new SVG({ fontCache: "none", linebreaks: { inline: false } }),
  })
  return async (math: MathExpression, color: string) => {
    const node = await mathjax.handleRetriesFor(() =>
      doc.convert(math.tex, { display: math.display })
    )
    const svg = adaptor.firstChild(node)
    if (!("attributes" in svg) || svg.kind !== "svg") throw new Error("MathJax did not produce SVG")
    // Explicit pixel dimensions work with both image-meta and sharp, unlike MathJax's ex units.
    for (const dimension of ["width", "height"]) {
      const ex = Number.parseFloat(adaptor.getAttribute(svg, dimension))
      adaptor.setAttribute(
        svg,
        dimension,
        String(Math.max(1, Math.ceil(ex * MATH_PIXELS_PER_CELL)))
      )
    }
    const xml = adaptor.serializeXML(svg)
    if (xml.includes('data-mml-node="merror"')) throw new Error("Invalid math expression")
    return xml.replaceAll("currentColor", color)
  }
}

let typesetter: ReturnType<typeof createTypesetter> | undefined
const files = new Map<string, Promise<string>>()

/** Theme-dependent, self-contained SVG paths shared by repeated occurrences and re-renders. */
export function mathImage(math: MathExpression, color: string): Promise<string> {
  if (math.tex.length > 20_000) return Promise.reject(new Error("Math expression is too large"))
  const key = hash(JSON.stringify(["svg-v3", math.tex, math.display, color]))
  const cached = files.get(key)
  if (cached) return cached
  const pending = (async () => {
    const dir = join(tmpdir(), `zaly-math-${userInfo().uid}`)
    const path = join(dir, `${key}.svg`)
    if (existsSync(path)) return path
    const render = await (typesetter ??= createTypesetter())
    const svg = await render(math, color)
    await mkdir(dir, { mode: 0o700, recursive: true })
    const temporary = join(dir, `${key}-${process.pid}-${Math.random().toString(36).slice(2)}.svg`)
    await writeFile(temporary, svg, { mode: 0o600 })
    await rename(temporary, path)
    return path
  })()
  if (files.size >= 128) files.delete(files.keys().next().value!)
  files.set(key, pending)
  return pending
}
