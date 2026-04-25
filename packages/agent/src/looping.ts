import type { ToolCallPart } from "../types.ts"

/** Predicate over the tool-call history of an agent turn. Returns
 *  `true` when the loop runner should bail out — typically because
 *  the model is stuck repeating itself.
 *
 *  Stateless by design: receives the full history each time, so
 *  callers can swap implementations or compose detectors without
 *  juggling internal state. */
export type LoopDetector = (calls: ToolCallPart[]) => boolean

/** Build a default loop detector from two cheap heuristics:
 *
 *  1. **Consecutive repetition** — the same `(name, params)` appears
 *     N times in a row. Catches the most common failure mode: a model
 *     re-calling `read_file` with the same path in the hope of
 *     different output.
 *
 *  2. **Windowed duplicates** — within the last `window` calls, any
 *     single `(name, params)` appears `windowRepeats` times. Catches
 *     alternation patterns (`A B A B A B …`) that the consecutive
 *     check alone won't see.
 *
 *  Hash is `name + JSON.stringify(params)`. Property order matters —
 *  if the model alternates key order on the same logical call, those
 *  read as different. In practice models keep ordering stable, so we
 *  trade off the rare false negative for a much cheaper hash.
 *
 *  Pass either limit as `Infinity` to disable that arm.
 */
export function createLoopDetector(opts?: {
  /** Same call N times in a row trips the detector. Default 3. */
  consecutive?: number
  /** Bounded window for duplicate detection. Default 10. */
  window?: number
  /** Within the window, this many duplicates of one call trips. Default 4. */
  windowRepeats?: number
}): LoopDetector {
  const consecutive = opts?.consecutive ?? 3
  const window = opts?.window ?? 10
  const windowRepeats = opts?.windowRepeats ?? 4

  return (calls) => {
    if (calls.length === 0) return false

    if (calls.length >= consecutive) {
      const last = hash(calls[calls.length - 1])
      let run = 1
      for (let i = calls.length - 2; i >= 0 && run < consecutive; i--) {
        if (hash(calls[i]) === last) run++
        else break
      }
      if (run >= consecutive) return true
    }

    if (calls.length >= windowRepeats) {
      const slice = calls.slice(Math.max(0, calls.length - window))
      const counts = new Map<string, number>()
      for (const call of slice) {
        const h = hash(call)
        const next = (counts.get(h) ?? 0) + 1
        if (next >= windowRepeats) return true
        counts.set(h, next)
      }
    }

    return false
  }
}

function hash(call: ToolCallPart): string {
  return `${call.name}\0${JSON.stringify(call.params)}`
}
