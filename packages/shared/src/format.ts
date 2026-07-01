/** Humanized elapsed-time string between two epoch-ms timestamps. */
export function formatDuration(
  from: number,
  opts: { to?: number; nowThreshold?: number } = {}
): string {
  const to = opts.to ?? Date.now()
  const ms = Math.abs(to - from)
  if (ms < (opts.nowThreshold ?? 60_000)) return "now"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  if (d < 7) return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`
  const w = Math.floor(d / 7)
  if (w < 4) return d % 7 === 0 ? `${w}w` : `${w}w ${d % 7}d`
  const M = Math.floor(w / 4)
  if (M < 12) return w % 4 === 0 ? `${M}M` : `${M}M ${w % 4}w`
  const y = Math.floor(M / 12)
  return M % 12 === 0 ? `${y}y` : `${y}y ${M % 12}M`
}

const relativeTimeFormat = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
  style: "long",
})

const RELATIVE_UNITS = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
  ["second", 1000],
] as const satisfies readonly [Intl.RelativeTimeFormatUnit, number][]

export function formatRelativeTime(
  from: number,
  opts: { to?: number; nowThreshold?: number } = {}
): string {
  const to = opts.to ?? Date.now()
  const delta = from - to
  const ms = Math.abs(delta)
  if (ms < (opts.nowThreshold ?? 60_000)) return "now"

  for (const [unit, size] of RELATIVE_UNITS) {
    if (ms >= size || unit === "second")
      return relativeTimeFormat.format(Math.round(delta / size), unit)
  }
  return "now"
}

export function formatSize(bytes: number, digits = 2): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
  let i = -1
  do {
    bytes /= 1024
    i++
  } while (bytes >= 1024 && i < units.length - 1)
  return `${bytes.toFixed(digits)} ${units[i]}`
}

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: n >= 1000 ? "compact" : "standard",
    ...opts,
  }).format(n)
}
