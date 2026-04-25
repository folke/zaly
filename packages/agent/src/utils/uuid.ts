/**
 * RFC 9562 UUIDv7 — timestamp-prefixed (48-bit ms since epoch),
 * monotonic within a millisecond via a 32-bit sequence counter,
 * random tail otherwise. Sortable lexicographically by creation time,
 * which is handy for debugging ("show me the latest few records by
 * uuid") and for any future DB index.
 *
 * Hand-rolled to keep `@zaly/agent` dep-free. Same algorithm as the
 * `uuid` package's v7 implementation, just without the buffer/offset
 * ceremony — we only ever want the canonical string form.
 */

let lastMs = 0
let seq = 0

export function uuidv7(): string {
  let ms = Date.now()
  if (ms > lastMs) {
    // Time moved on — fresh sequence base.
    lastMs = ms
    seq = Math.floor(Math.random() * 0x1_00_00_00_00)
  } else {
    // Same (or earlier) ms — bump sequence with 32-bit rollover. On
    // rollover, advance the timestamp by one ms to preserve
    // monotonicity (allowed by RFC 9562 §6.2; self-corrects as the
    // wall clock catches up).
    seq = (seq + 1) >>> 0
    if (seq === 0) lastMs++
    ms = lastMs
  }

  const r = crypto.getRandomValues(new Uint8Array(6))
  const b = new Uint8Array(16)

  // bytes 0-5: 48-bit big-endian millisecond timestamp
  b[0] = (ms / 0x1_00_00_00_00_00) & 0xff
  b[1] = (ms / 0x1_00_00_00_00) & 0xff
  b[2] = (ms / 0x1_00_00_00) & 0xff
  b[3] = (ms / 0x1_00_00) & 0xff
  b[4] = (ms / 0x1_00) & 0xff
  b[5] = ms & 0xff
  // byte 6: version (0x70) + top 4 bits of sequence
  b[6] = 0x70 | ((seq >>> 28) & 0x0f)
  // byte 7: next 8 bits of sequence
  b[7] = (seq >>> 20) & 0xff
  // byte 8: variant (0x80) + next 6 bits of sequence
  b[8] = 0x80 | ((seq >>> 14) & 0x3f)
  // byte 9: next 8 bits of sequence
  b[9] = (seq >>> 6) & 0xff
  // byte 10: low 6 bits of sequence + 2 random bits
  b[10] = ((seq << 2) & 0xff) | (r[0] & 0x03)
  // bytes 11-15: 40 random bits
  b[11] = r[1]
  b[12] = r[2]
  b[13] = r[3]
  b[14] = r[4]
  b[15] = r[5]

  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
