import { Glob } from "bun"

export function _globber(patterns: string[]): (path: string) => boolean {
  const globs = patterns.map((p) => new Glob(p))
  return (path: string) => globs.some((g) => g.match(path))
}
