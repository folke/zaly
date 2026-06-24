import picomatch from "picomatch"

export function _globber(patterns: string[]): (path: string) => boolean {
  const isMatch = picomatch(patterns, { dot: true, windows: false })
  return (path: string) => isMatch(path)
}
