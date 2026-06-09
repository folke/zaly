import type { ScoredItem, SearchItem } from "./matcher.ts"

type SortKey<T extends SearchItem> = Extract<keyof (ScoredItem<T> & SearchItem), string>

export type SortField<T extends SearchItem = SearchItem> =
  | SortKey<T>
  | `#${SortKey<T>}`
  | `${SortKey<T>}:desc`

export type ParsedField<T extends SearchItem = SearchItem> = {
  desc?: boolean
  len?: boolean
  name: SortKey<T>
}

export type Sorter<T extends SearchItem = SearchItem> = (
  a: ScoredItem<T>,
  b: ScoredItem<T>
) => number

function parse<T extends SearchItem>(field: SortField<T>): ParsedField<T> {
  const len = field.startsWith("#")
  const desc = field.endsWith(":desc")
  const name = field.replace(/^#/, "").replace(/:desc$/, "") as SortKey<T>
  return { desc, len, name }
}

export function sorter<T extends SearchItem>(
  fields: readonly SortField<T>[] = ["score:desc", "#text", "idx"]
): Sorter<T> {
  const parsed: ParsedField<T>[] = fields.map(parse)
  return (a, b) => {
    for (const field of parsed) {
      let av: unknown = a[field.name]
      let bv: unknown = b[field.name]
      if (av === undefined || bv === undefined) continue
      if (field.len) {
        av = typeof av === "string" || Array.isArray(av) ? av.length : 0
        bv = typeof bv === "string" || Array.isArray(bv) ? bv.length : 0
      }
      if (av === bv) continue
      if (typeof av === "boolean" && typeof bv === "boolean") {
        av = av ? 0 : 1
        bv = bv ? 0 : 1
      }
      return compare(av, bv) * (field.desc ? -1 : 1)
    }
    return 0
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b)
  return String(a).localeCompare(String(b))
}
