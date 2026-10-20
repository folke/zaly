/// <reference lib="dom" />

import { gfm } from "@joplin/turndown-plugin-gfm"
import { Readability } from "@mozilla/readability"
import { DOMParser } from "linkedom"
import TurndownService from "turndown"

/** Convert static HTML only: no scripts, resources, or browser layout are executed. */
export function htmlToMarkdown(html: string, url: string) {
  const parser = new DOMParser()
  const parse = (source: string) =>
    parser.parseFromString(source, "text/html") as unknown as Document
  let doc = parse(html)
  if (!doc.querySelector("html")) doc = parse(`<html><head></head><body>${html}</body></html>`)

  const title = doc.title.trim()
  const challenge = !!doc.querySelector("#challenge-form, #cf-challenge-running, #px-captcha")
  const base = doc.querySelector("base[href]")?.getAttribute("href")
  let baseUrl = url
  if (base) {
    try {
      baseUrl = new URL(base, url).href
    } catch {
      /* Use the response URL for invalid bases. */
    }
  }
  doc.querySelectorAll("base").forEach((node) => node.remove())
  const baseNode = doc.createElement("base")
  baseNode.setAttribute("href", baseUrl)
  doc.head.prepend(baseNode)
  doc
    .querySelectorAll(
      "script, style, noscript, template, svg, iframe, nav, footer, [hidden], [aria-hidden='true']"
    )
    .forEach((node) => node.remove())

  for (const node of doc.querySelectorAll("a[href], img[src]")) {
    const attr = node.tagName === "A" ? "href" : "src"
    try {
      const resolved = new URL(node.getAttribute(attr)!, baseUrl)
      if (["http:", "https:", "mailto:", "tel:"].includes(resolved.protocol))
        node.setAttribute(attr, resolved.href)
      else node.removeAttribute(attr)
    } catch {
      node.removeAttribute(attr)
    }
  }
  for (const link of doc.querySelectorAll("a")) {
    if (!link.textContent.trim() && !link.querySelector("img"))
      link.textContent = link.getAttribute("aria-label") ?? link.getAttribute("title") ?? ""
  }

  // Prefer authored content boundaries for reference pages; article heuristics can drop code/tables.
  const main = doc.querySelector("main, [role='main']")
  const articles = (main ?? doc).querySelectorAll("article")
  let root: Element | undefined = (articles.length === 1 ? articles[0] : main) ?? undefined
  let extracted: string | undefined
  if (!root?.textContent.trim() && !root?.querySelector("img")) {
    root = undefined
    doc.querySelectorAll("aside").forEach((node) => node.remove())
    try {
      const article = new Readability(doc.cloneNode(true) as Document, {
        keepClasses: true,
      }).parse()
      extracted = article?.content ?? undefined
    } catch {
      /* Malformed pages still have a cleaned-body fallback. */
    }
  }
  if (!root && !extracted) root = doc.body
  const converter = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    headingStyle: "atx",
  }).use(gfm)
  converter.addRule("fencedCode", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => {
      const code = node.querySelector("code")
      const text = (code ?? node).textContent
      const classes = `${node.className} ${code?.className ?? ""} ${node.parentElement?.className ?? ""}`
      const language =
        classes.match(/(?:^|\s)(?:language-|lang-|highlight-source-)([\w+-]+)/)?.[1] ?? ""
      const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0)
      const fence = "`".repeat(Math.max(3, longest + 1))
      return `\n\n${fence}${language}\n${text.replace(/\n$/, "")}\n${fence}\n\n`
    },
  })
  // Turndown's own DOM parser provides table APIs absent from lightweight DOM implementations.
  const markdown = converter.turndown(extracted ?? root?.innerHTML ?? "").trim()
  let warning: string | undefined
  if (challenge) warning = "The response appears to be a bot challenge; use a browser if available."
  else if (!markdown)
    warning =
      "No readable content found. This page may require JavaScript; use a browser if available."
  return { markdown, title, warning }
}
