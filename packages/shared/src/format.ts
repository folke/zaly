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
  return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`
}

export function formatRelTime(
  from: number,
  opts: { to?: number; nowThreshold?: number } = {}
): string {
  const to = opts.to ?? Date.now()
  const diff = formatDuration(from, { ...opts, to })
  return from < to ? `${diff} ago` : `in ${diff}`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
  let i = -1
  do {
    bytes /= 1024
    i++
  } while (bytes >= 1024 && i < units.length - 1)
  return `${bytes.toFixed(2)} ${units[i]}`
}
