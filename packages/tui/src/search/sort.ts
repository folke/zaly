import type { SearchItem } from "./matcher.ts"

type SortKey<T> = Extract<keyof T, string>

export type SortField<T extends SearchItem = SearchItem> =
  | SortKey<T>
  | {
      desc?: boolean
      len?: boolean
      name: SortKey<T>
    }

export function sorter<T extends SearchItem>(
  fields: readonly SortField<T>[] = [
    { desc: true, name: "score" as SortKey<T> },
    "idx" as SortKey<T>,
  ]
): (a: T, b: T) => number {
  const parsed: { desc?: boolean; len?: boolean; name: SortKey<T> }[] = fields.map((field) =>
    typeof field === "string" ? { name: field } : field
  )
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
