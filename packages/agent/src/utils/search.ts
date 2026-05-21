import { normPath, prettyPath } from "@zaly/shared"
import { which } from "@zaly/shared/process"
import { basename } from "pathe"

export const DEFAULT_SEARCH_EXCLUDES = [
  ".git",
  ".bare",
  "node_modules",
  ".node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".vitepress/dist",
  ".cache",
  ".turbo",
] as const

export const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  c: ["c", "h"],
  cpp: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
  go: ["go"],
  java: ["java"],
  js: ["js", "jsx", "mjs", "cjs"],
  json: ["json"],
  lua: ["lua"],
  markdown: ["md", "markdown"],
  md: ["md", "markdown"],
  py: ["py"],
  python: ["py"],
  rs: ["rs"],
  rust: ["rs"],
  toml: ["toml"],
  ts: ["ts", "tsx", "mts", "cts"],
  yaml: ["yml", "yaml"],
}

export type SearchBinary = "fd" | "rg" | "grep" | "find"

const cache = new Map<SearchBinary, string | undefined>()

export function bin(cmd: SearchBinary): string | undefined {
  if (!cache.has(cmd)) cache.set(cmd, which(cmd) ?? (cmd === "fd" ? which("fdfind") : undefined))
  return cache.get(cmd)
}

export function defaultExcludes(paths: readonly string[]): string[] {
  return DEFAULT_SEARCH_EXCLUDES.filter(
    (exclude) => !paths.some((p) => explicitlyTargets(p, exclude))
  )
}

export function compactPath(path: string, cwd: string): string {
  return prettyPath(normPath(cwd, path), cwd)
}

export function fileTypeExtensions(type: string): string[] {
  return FILE_TYPE_EXTENSIONS[type] ?? [type]
}

export function fileTypeGlobs(type: string): string[] {
  return fileTypeExtensions(type).map((e) => `*.${e}`)
}

function explicitlyTargets(path: string, exclude: string): boolean {
  const abs = normPath(path)
  const base = basename(abs)
  return base === exclude || abs.endsWith(`/${exclude}`) || abs.includes(`/${exclude}/`)
}
