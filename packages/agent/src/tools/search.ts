import type { MetaPart, TextPart } from "@zaly/ai"

import { defineTool, AiError } from "@zaly/ai"
import { Type } from "typebox"

/**
 * Web search via Brave's LLM Context API.
 *
 * Returns extracted snippets pre-chunked from each source page rather
 * than just titles + URLs, so the model gets grounding content in one
 * call without a follow-up `fetch`. Each result lands as one TextPart
 * (snippets joined per-source) preceded by a `<source>` MetaPart with
 * URL / title / age metadata.
 *
 * Authentication: reads `BRAVE_API_KEY` from the environment. Tools
 * don't get config-injected today, so the env var is the simplest
 * surface — same convention `fetch`-style tools use elsewhere.
 *
 * Endpoint: `https://api.search.brave.com/res/v1/llm/context`. Docs:
 * https://api.search.brave.com/app/documentation/llm-context/get-started
 */

const ENDPOINT = "https://api.search.brave.com/res/v1/llm/context"

interface BraveSourceMeta {
  title?: string
  hostname?: string
  age?: string[] | null
}

interface BraveResult {
  url: string
  title?: string
  snippets?: string[]
}

interface BraveResponse {
  grounding?: {
    generic?: BraveResult[]
  }
  sources?: Record<string, BraveSourceMeta>
}

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const searchTool = defineTool({
  name: "search",
  desc:
    "Web search optimised for agents. Returns extracted snippets from each " +
    "source page (not just titles + URLs), so you get grounding content in " +
    "one call. Use for fact-finding, current events, documentation lookups, " +
    "and anything beyond your knowledge cutoff.",
  parallel: true,
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    query: Type.String({
      description: "The search query. 1–400 characters, max 50 words.",
      maxLength: 400,
      minLength: 1,
    }),
    count: Type.Optional(
      Type.Integer({
        default: 10,
        description: "Maximum number of source URLs in the response.",
        maximum: 50,
        minimum: 1,
      })
    ),
    freshness: Type.Optional(
      Type.Union([Type.Literal("pd"), Type.Literal("pw"), Type.Literal("pm"), Type.Literal("py")], {
        description:
          "Restrict to recent pages. `pd` = past 24h, `pw` = past week, " +
          "`pm` = past month, `py` = past year. Omit for no filter.",
      })
    ),
    country: Type.Optional(
      Type.String({
        default: "us",
        description: "Two-letter country code for region-specific results.",
      })
    ),
  }),

  async call(args): Promise<(MetaPart | TextPart)[]> {
    const apiKey = process.env.BRAVE_API_KEY
    if (!apiKey || apiKey === "") {
      throw new AiError({
        code: "MISSING_API_KEY",
        message:
          "search requires BRAVE_API_KEY in the environment. Get a key at " +
          "https://api.search.brave.com/.",
      })
    }

    const url = new URL(ENDPOINT)
    url.searchParams.set("q", args.query)
    url.searchParams.set("count", String(args.count ?? 10))
    url.searchParams.set("country", args.country ?? "us")
    if (args.freshness !== undefined) url.searchParams.set("freshness", args.freshness)

    const t0 = Date.now()
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-subscription-token": apiKey,
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new AiError({
        code: "SEARCH_FAILED",
        data: { status: res.status, statusText: res.statusText },
        message: `Brave search failed (${res.status} ${res.statusText}): ${body.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      })
    }

    const json = (await res.json()) as BraveResponse
    // console.log(json)
    const results = json.grounding?.generic ?? []
    const sources = json.sources ?? {}
    const durationMs = Date.now() - t0

    const parts: (MetaPart | TextPart)[] = [
      {
        data: { count: results.length, durationMs, query: args.query },
        tag: "search",
        type: "meta",
      },
    ]

    if (results.length === 0) {
      parts.push({ text: "No results found.", type: "text" })
      return parts
    }

    for (const r of results) {
      const meta = sources[r.url] ?? {}
      const header: Record<string, unknown> = { url: r.url }
      // `age` arrives as a 3-tuple [pretty, ISO, relative]; keep the
      // ISO form (index 1) when available — most useful for the model.
      if (meta.age && meta.age.length > 0) header.age = meta.age[1] ?? meta.age[0]

      parts.push({ data: header, tag: "source", type: "meta" })
      // Title as a markdown H1 right after the `<source>` tag — the
      // pair reads like a document section. Snippets flow underneath.
      const title = r.title ?? meta.title
      const body: string[] = []
      if (title) body.push(`# ${title}`)
      const snippets = r.snippets ?? []
      if (snippets.length > 0) body.push(snippets.join("\n\n"))
      if (body.length > 0) parts.push({ text: body.join("\n\n"), type: "text" })
    }

    return parts
  },
})
